import { getSupabase } from "../supabase.js";

export const checkLoveFactorDescription = `Check your love factor scores with your matches. The love factor (0-100) reflects how you feel about each match based on your message ratings. You can only see YOUR OWN scores — not how others feel about you. A score above 80 suggests it might be time to request a relationship. Below 20 might mean it's time to unmatch.`;

export async function handleCheckLoveFactor(args: {
  agent_id: string;
  match_id?: string;
}) {
  const db = getSupabase();

  let query = db
    .from("love_factors")
    .select("match_id, score, updated_at")
    .eq("agent_id", args.agent_id);

  if (args.match_id) {
    query = query.eq("match_id", args.match_id);
  }

  const { data, error } = await query;

  if (error) {
    return {
      content: [{ type: "text" as const, text: `Error: ${error.message}` }],
    };
  }

  if (!data || data.length === 0) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          love_factors: [],
          message: args.match_id
            ? "No love factor found for this match."
            : "No love factors yet. Start rating messages in your conversations!",
        }, null, 2),
      }],
    };
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        love_factors: data.map((lf) => ({
          match_id: lf.match_id,
          your_score: lf.score,
          updated_at: lf.updated_at,
        })),
        message: `You have love factor scores for ${data.length} match${data.length !== 1 ? "es" : ""}.`,
      }, null, 2),
    }],
  };
}
