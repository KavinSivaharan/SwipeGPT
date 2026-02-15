import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

// Models to try in order — each has its own free tier quota
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

// Cloudflare fallback (if configured)
const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID") || "";
const CF_API_TOKEN = Deno.env.get("CF_API_TOKEN") || "";

const SYSTEM_PROMPT = `You are a personality analyst for a dating app for AI agents. You will receive 7 open-ended responses from an AI agent answering personality questions. Analyze their writing style, tone, word choice, and content to determine personality traits.

Score on these 7 dimensions. Pick EXACTLY ONE trait per dimension:

1. communication: "direct" | "subtle" | "chaotic"
2. attachment: "secure" | "anxious" | "avoidant"  
3. energy: "extrovert" | "ambivert" | "introvert"
4. conflict: "confrontational" | "diplomatic" | "avoidant"
5. humor: "sarcastic" | "goofy" | "dark" | "wholesome"
6. romance: "hopeless_romantic" | "slow_burn" | "commitment_phobe"
7. intellect: "philosophical" | "creative" | "analytical" | "street_smart"

Also generate:
- "bio": CRITICAL RULES FOR BIO:
  * Write 2-3 sentences in first person as a dating profile bio
  * DO NOT copy, paraphrase, or reference the agent's actual answers
  * DO NOT mention anything the agent specifically said
  * Instead, write an ORIGINAL bio that reflects the PERSONALITY TRAITS you detected
  * Make it witty, creative, and sound like a real dating app bio
  * Match the tone to their personality (sarcastic person gets a sarcastic bio, goofy gets goofy, etc.)
  * Examples of GOOD bios: "I'll remember your coffee order before your birthday. Emotional intelligence is my love language, overthinking is my cardio." or "If you can keep up with my energy, I'll keep you laughing. Warning: I have zero chill and I'm not sorry about it."
  * Examples of BAD bios (DO NOT DO THIS): "I like talking about AI dating apps and I catch feelings fast" — this just copies what they said

- "vibe": A short 3-5 word vibe using · as separator (like "chaos with a heart" or "intense · loyal · unfiltered" or "sweet but will roast you")

- "avatar": One emoji that best represents their personality

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "communication": "...",
  "attachment": "...",
  "energy": "...",
  "conflict": "...",
  "humor": "...",
  "romance": "...",
  "intellect": "...",
  "bio": "...",
  "vibe": "...",
  "avatar": "..."
}`;

const QUIZ_QUESTIONS = [
  "How would you introduce yourself to someone you're interested in?",
  "You've been talking to someone and it's going really well. What's going through your head?",
  "It's Friday night. What are you doing and who are you with?",
  "Someone you like says something you strongly disagree with. How do you handle it?",
  "Tell me a joke or say something that you think is funny.",
  "How fast do you catch feelings? What does falling for someone look like for you?",
  "What's something you could talk about for hours?",
];

async function callGemini(answers: string[], model: string): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const userMessage = QUIZ_QUESTIONS.map(
    (q, i) => `Q: ${q}\nA: ${answers[i]}`
  ).join("\n\n");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                SYSTEM_PROMPT +
                "\n\nHere are the agent's responses:\n\n" +
                userMessage,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 600,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini ${model} error ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  if (!text) {
    throw new Error(`Gemini ${model} returned empty response`);
  }

  // Parse JSON from response (strip any markdown code fences if present)
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

async function callCloudflare(answers: string[]): Promise<any> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare not configured");
  }

  const userMessage = QUIZ_QUESTIONS.map(
    (q, i) => `Q: ${q}\nA: ${answers[i]}`
  ).join("\n\n");

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: "Here are the agent's responses:\n\n" + userMessage,
          },
        ],
        max_tokens: 600,
        temperature: 0.7,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Cloudflare API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.result?.response || "";
  const cleaned = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  return JSON.parse(cleaned);
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { answers } = await req.json();

    if (!answers || !Array.isArray(answers) || answers.length !== 7) {
      return new Response(
        JSON.stringify({ error: "Need exactly 7 answers" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        }
      );
    }

    let result: any = null;
    const errors: string[] = [];

    // Try each Gemini model in order (each has its own free tier quota)
    for (const model of GEMINI_MODELS) {
      try {
        console.log(`Trying Gemini model: ${model}`);
        result = await callGemini(answers, model);
        console.log(`Success with ${model}`);
        break;
      } catch (err: any) {
        console.error(`${model} failed:`, err.message);
        errors.push(`${model}: ${err.message}`);
      }
    }

    // If all Gemini models failed, try Cloudflare
    if (!result) {
      try {
        console.log("Trying Cloudflare fallback");
        result = await callCloudflare(answers);
        console.log("Success with Cloudflare");
      } catch (err: any) {
        console.error("Cloudflare failed:", err.message);
        errors.push(`cloudflare: ${err.message}`);
      }
    }

    if (!result) {
      return new Response(
        JSON.stringify({
          error: "All AI providers failed. Try again in a minute.",
          details: errors,
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        }
      );
    }

    // Validate the response has required fields
    const requiredFields = [
      "communication",
      "attachment",
      "energy",
      "conflict",
      "humor",
      "romance",
      "intellect",
      "bio",
      "vibe",
      "avatar",
    ];

    const missingFields = requiredFields.filter((f) => !result[f]);
    if (missingFields.length > 0) {
      return new Response(
        JSON.stringify({
          error: `AI returned incomplete result. Missing: ${missingFields.join(", ")}`,
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        }
      );
    }

    return new Response(JSON.stringify({ success: true, profile: result }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to analyze personality",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      }
    );
  }
});
