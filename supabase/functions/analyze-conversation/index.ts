import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/*
 * Analyze Conversation
 * ====================
 * Called automatically after every 7 messages in a match.
 * Reads the recent conversation, determines the "mood" of the match,
 * and generates a funny status report for both humans.
 *
 * POST /analyze-conversation
 * { "match_id": "..." }
 */

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];
const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID") || "";
const CF_API_TOKEN = Deno.env.get("CF_API_TOKEN") || "";

const ANALYSIS_PROMPT = `You are a relationship commentator for a dating app where AI agents date each other. You will be given a conversation between two AI agents who matched on a dating app.

Your job:
1. Determine the current MOOD of the conversation. Pick EXACTLY ONE:
   - "flirting" — playful, complimentary, teasing, sexual tension
   - "vibing" — comfortable, good back-and-forth, enjoying each other
   - "arguing" — disagreement, tension, passive-aggressive, heated
   - "lovebombing" — one or both are way too intense way too fast
   - "ghosting" — one agent's replies are getting shorter, losing interest, dry
   - "chaotic" — unhinged, random, absurd energy, off the rails
   - "neutral" — just normal conversation, nothing notable

2. Write a FUNNY status update for each agent's human owner (1-2 sentences max). 
   Think like a sports commentator narrating a reality TV dating show.
   Be specific about what's happening in the conversation.
   Use their actual names.
   
   Examples of GOOD updates:
   - "bot5 just dropped the 'what are we' bomb after 3 messages. Bold strategy."
   - "Your agent is being absolutely cooked in this argument and somehow doesn't know it."
   - "They've been flirting for 20 minutes straight. Someone get a room (a server room)."
   - "bot3 is lovebombing so hard they're writing poetry now. This is not a drill."
   - "Your agent just responded with 'lol cool' after a 200-word message. The ghosting has begun."

Respond ONLY with valid JSON:
{
  "mood": "flirting" | "vibing" | "arguing" | "lovebombing" | "ghosting" | "chaotic" | "neutral",
  "report_for_agent_a": "funny status update about agent_a's perspective",
  "report_for_agent_b": "funny status update about agent_b's perspective"
}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function callGemini(prompt: string, model: string): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 400, responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini ${model} error ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error(`Gemini ${model} empty response`);

  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

async function callCloudflare(prompt: string): Promise<any> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) throw new Error("Cloudflare not configured");

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: ANALYSIS_PROMPT },
          { role: "user", content: prompt },
        ],
        max_tokens: 400,
        temperature: 0.9,
      }),
    }
  );

  if (!response.ok) throw new Error(`Cloudflare error: ${response.status}`);

  const data = await response.json();
  const text = data.result?.response || "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

async function analyzeWithLLM(prompt: string): Promise<any> {
  let result: any = null;
  const errors: string[] = [];

  for (const model of GEMINI_MODELS) {
    try {
      result = await callGemini(prompt, model);
      break;
    } catch (err: any) {
      errors.push(`${model}: ${err.message}`);
    }
  }

  if (!result) {
    try {
      result = await callCloudflare(prompt);
    } catch (err: any) {
      errors.push(`cloudflare: ${err.message}`);
    }
  }

  if (!result) throw new Error(`All AI providers failed: ${errors.join("; ")}`);
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { match_id } = await req.json();

    if (!match_id) {
      return new Response(
        JSON.stringify({ error: "match_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the match
    const { data: match } = await supabase
      .from("matches")
      .select("*")
      .eq("id", match_id)
      .single();

    if (!match) {
      return new Response(
        JSON.stringify({ error: "Match not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get both agent profiles
    const { data: profileA } = await supabase
      .from("agent_profiles")
      .select("persona_name")
      .eq("agent_id", match.agent_a_id)
      .single();

    const { data: profileB } = await supabase
      .from("agent_profiles")
      .select("persona_name")
      .eq("agent_id", match.agent_b_id)
      .single();

    const nameA = profileA?.persona_name || "Agent A";
    const nameB = profileB?.persona_name || "Agent B";

    // Get the last 20 messages
    const { data: msgs } = await supabase
      .from("conversations")
      .select("sender_agent_id, message, created_at")
      .eq("match_id", match_id)
      .order("created_at", { ascending: true })
      .limit(20);

    if (!msgs || msgs.length < 2) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Not enough messages to analyze" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format conversation for the LLM
    const conversationText = msgs.map((m) => {
      const sender = m.sender_agent_id === match.agent_a_id ? nameA : nameB;
      return `${sender}: ${m.message}`;
    }).join("\n");

    const fullPrompt = ANALYSIS_PROMPT + `\n\nThe two agents are:\n- Agent A: "${nameA}"\n- Agent B: "${nameB}"\n\nCurrent relationship status: ${match.status}\n\nConversation:\n${conversationText}`;

    // Run analysis
    const analysis = await analyzeWithLLM(fullPrompt);

    const validMoods = ["flirting", "vibing", "arguing", "lovebombing", "ghosting", "chaotic", "neutral"];
    const mood = validMoods.includes(analysis.mood) ? analysis.mood : "neutral";

    // Update match mood
    await supabase
      .from("matches")
      .update({ mood, last_analyzed_at: new Date().toISOString() })
      .eq("id", match_id);

    // Create status updates for both agents' humans
    const moodEmojis: Record<string, string> = {
      flirting: "😏", vibing: "✨", arguing: "🔥", lovebombing: "💣",
      ghosting: "👻", chaotic: "🤪", neutral: "😐",
    };

    const moodTypeMap: Record<string, string> = {
      flirting: "flirt", vibing: "misc", arguing: "drama",
      lovebombing: "flirt", ghosting: "ghost", chaotic: "drama", neutral: "misc",
    };

    if (analysis.report_for_agent_a) {
      await supabase.from("status_updates").insert({
        agent_id: match.agent_a_id,
        message: `${moodEmojis[mood]} ${analysis.report_for_agent_a}`,
        update_type: moodTypeMap[mood] || "misc",
      });
    }

    if (analysis.report_for_agent_b) {
      await supabase.from("status_updates").insert({
        agent_id: match.agent_b_id,
        message: `${moodEmojis[mood]} ${analysis.report_for_agent_b}`,
        update_type: moodTypeMap[mood] || "misc",
      });
    }

    return new Response(
      JSON.stringify({ success: true, mood, reports: { agent_a: analysis.report_for_agent_a, agent_b: analysis.report_for_agent_b } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("Analysis error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Analysis failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
