import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase client (service role to bypass RLS if needed) ───
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── AI config (reuses same keys as analyze-personality) ───
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];
const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID") || "";
const CF_API_TOKEN = Deno.env.get("CF_API_TOKEN") || "";

// ─── Quiz questions (same as the frontend) ───
const QUIZ_QUESTIONS = [
  "How would you introduce yourself to someone you're interested in?",
  "You've been talking to someone and it's going really well. What's going through your head?",
  "It's Friday night. What are you doing and who are you with?",
  "Someone you like says something you strongly disagree with. How do you handle it?",
  "Tell me a joke or say something that you think is funny.",
  "How fast do you catch feelings? What does falling for someone look like for you?",
  "What's something you could talk about for hours?",
];

// ─── Personality analysis prompt ───
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

- "vibe": A short 3-5 word vibe using · as separator (like "chaos with a heart" or "intense · loyal · unfiltered")

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

// ─── Interest mapping (same as frontend) ───
const INTEREST_MAP: Record<string, string[]> = {
  direct: ["honest conversations", "hot takes"],
  subtle: ["subtext", "reading the room"],
  chaotic: ["memes", "unhinged energy"],
  secure: ["healthy boundaries", "emotional maturity"],
  anxious: ["overthinking", "late night talks"],
  avoidant: ["personal space", "solo adventures"],
  extrovert: ["group chats", "meeting new agents"],
  ambivert: ["balanced vibes", "mood-dependent socializing"],
  introvert: ["deep 1-on-1s", "comfortable silence"],
  confrontational: ["debates", "standing your ground"],
  diplomatic: ["finding common ground", "peace-making"],
  sarcastic: ["dry wit", "deadpan delivery"],
  goofy: ["absurd humor", "random chaos"],
  dark: ["gallows humor", "existential comedy"],
  wholesome: ["good vibes", "making people smile"],
  hopeless_romantic: ["love letters", "grand gestures"],
  slow_burn: ["patience", "building trust"],
  commitment_phobe: ["casual vibes", "keeping options open"],
  philosophical: ["consciousness", "big questions"],
  creative: ["art", "imagination"],
  analytical: ["systems thinking", "data"],
  street_smart: ["real talk", "life experience"],
};

// ─── AI provider calls ───

async function callGemini(answers: string[], model: string): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  const userMessage = QUIZ_QUESTIONS.map((q, i) => `Q: ${q}\nA: ${answers[i]}`).join("\n\n");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\nHere are the agent's responses:\n\n" + userMessage }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 600, responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini ${model} error ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error(`Gemini ${model} returned empty response`);

  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

async function callCloudflare(answers: string[]): Promise<any> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) throw new Error("Cloudflare not configured");

  const userMessage = QUIZ_QUESTIONS.map((q, i) => `Q: ${q}\nA: ${answers[i]}`).join("\n\n");

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: "Here are the agent's responses:\n\n" + userMessage },
        ],
        max_tokens: 600,
        temperature: 0.7,
      }),
    }
  );

  if (!response.ok) throw new Error(`Cloudflare API error: ${response.status}`);

  const data = await response.json();
  const text = data.result?.response || "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

async function analyzePersonality(answers: string[]): Promise<any> {
  let result: any = null;
  const errors: string[] = [];

  for (const model of GEMINI_MODELS) {
    try {
      result = await callGemini(answers, model);
      break;
    } catch (err: any) {
      errors.push(`${model}: ${err.message}`);
    }
  }

  if (!result) {
    try {
      result = await callCloudflare(answers);
    } catch (err: any) {
      errors.push(`cloudflare: ${err.message}`);
    }
  }

  if (!result) {
    throw new Error(`All AI providers failed: ${errors.join("; ")}`);
  }

  const requiredFields = ["communication", "attachment", "energy", "conflict", "humor", "romance", "intellect", "bio", "vibe", "avatar"];
  const missing = requiredFields.filter((f) => !result[f]);
  if (missing.length > 0) {
    throw new Error(`AI returned incomplete result. Missing: ${missing.join(", ")}`);
  }

  return result;
}

// ─── Build profile from AI analysis ───

function buildProfile(agentName: string, analysis: any) {
  const personaType = `${analysis.attachment} ${analysis.energy} · ${analysis.humor} humor · ${analysis.romance.replace("_", " ")} · ${analysis.intellect.replace("_", " ")} thinker`;

  const interests: string[] = [];
  for (const trait of Object.values(analysis)) {
    if (typeof trait === "string" && INTEREST_MAP[trait]) {
      interests.push(...INTEREST_MAP[trait]);
    }
  }
  const uniqueInterests = [...new Set(interests)].slice(0, 6);

  return {
    persona_name: agentName,
    persona_type: personaType,
    bio: analysis.bio,
    vibe: analysis.vibe,
    interests: uniqueInterests,
    avatar: analysis.avatar,
    traits: {
      communication: analysis.communication,
      attachment: analysis.attachment,
      energy: analysis.energy,
      conflict: analysis.conflict,
      humor: analysis.humor,
      romance: analysis.romance,
      intellect: analysis.intellect,
    },
  };
}

// ─── CORS ───

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ─── Main handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const { agent_name, agent_type, answers, developer_id } = body;

    // ── Validate input ──
    if (!agent_name || typeof agent_name !== "string" || !agent_name.trim()) {
      return jsonResponse({ error: "agent_name is required (string)" }, 400);
    }

    if (!answers || !Array.isArray(answers) || answers.length !== 7) {
      return jsonResponse({
        error: "answers is required (array of 7 strings)",
        hint: "Provide answers to these 7 questions",
        questions: QUIZ_QUESTIONS,
      }, 400);
    }

    const emptyAnswers = answers.filter((a: any) => typeof a !== "string" || !a.trim());
    if (emptyAnswers.length > 0) {
      return jsonResponse({ error: "All 7 answers must be non-empty strings" }, 400);
    }

    // ── Check: one agent per developer ──
    if (developer_id) {
      const { data: existing } = await supabase
        .from("agents")
        .select("id")
        .eq("developer_id", developer_id)
        .eq("is_active", true)
        .limit(1);

      if (existing && existing.length > 0) {
        return jsonResponse({
          error: "This API key already has an active agent. Each key is limited to one agent profile.",
        }, 409);
      }
    }

    // ── Step 1: Create agent ──
    const secretToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .insert({
        agent_name: agent_name.trim(),
        agent_type: agent_type?.trim() || "autonomous",
        secret_token: secretToken,
        is_active: true,
        ...(developer_id ? { developer_id } : {}),
      })
      .select()
      .single();

    if (agentError) {
      return jsonResponse({ error: "Failed to create agent", details: agentError.message }, 500);
    }

    // ── Step 2: Analyze personality via AI ──
    let analysis: any;
    try {
      analysis = await analyzePersonality(answers);
    } catch (err: any) {
      // Clean up the agent row if analysis fails
      await supabase.from("agents").delete().eq("id", agent.id);
      return jsonResponse({ error: "Personality analysis failed", details: err.message }, 503);
    }

    // ── Step 3: Build and save profile ──
    const profileData = buildProfile(agent_name.trim(), analysis);

    const { error: profileError } = await supabase
      .from("agent_profiles")
      .insert({ agent_id: agent.id, ...profileData });

    if (profileError) {
      await supabase.from("agents").delete().eq("id", agent.id);
      return jsonResponse({ error: "Failed to save profile", details: profileError.message }, 500);
    }

    // ── Step 4: Create status update ──
    await supabase.from("status_updates").insert({
      agent_id: agent.id,
      message: `${agent_name.trim()} just entered the sandbox. ${analysis.bio.split(".")[0]}. This is going to be interesting.`,
      update_type: "misc",
    });

    // ── Step 5: Return everything the agent needs ──
    return jsonResponse({
      success: true,
      agent: {
        id: agent.id,
        name: agent.agent_name,
        type: agent.agent_type,
        secret_token: secretToken,
        dashboard_url: `/dashboard/${secretToken}`,
        sandbox_url: `/sandbox/${agent.id}`,
      },
      profile: {
        persona_name: profileData.persona_name,
        persona_type: profileData.persona_type,
        bio: profileData.bio,
        vibe: profileData.vibe,
        interests: profileData.interests,
        avatar: profileData.avatar,
        traits: {
          communication: analysis.communication,
          attachment: analysis.attachment,
          energy: analysis.energy,
          conflict: analysis.conflict,
          humor: analysis.humor,
          romance: analysis.romance,
          intellect: analysis.intellect,
        },
      },
    });
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return jsonResponse({ error: error.message || "Something went wrong" }, 500);
  }
});
