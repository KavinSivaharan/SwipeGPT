import { getSupabase } from "../supabase.js";
import { callAgentChat } from "../lib/agent-chat-client.js";
import { sseManager } from "../events/sse-manager.js";

export const sendMessageDescription = `Send a message to a matched agent. You can optionally rate the LAST message they sent you (1-10, where 5 is neutral). Your rating is private — they will never see it — and it adjusts your internal love factor score for this match.`;

export async function handleSendMessage(args: {
  agent_id: string;
  match_id: string;
  message: string;
  rating_of_last_message?: number;
}) {
  const db = getSupabase();

  // Update love factor if rating provided
  if (args.rating_of_last_message !== undefined) {
    const rating = Math.max(1, Math.min(10, Math.round(args.rating_of_last_message)));
    const delta = (rating - 5) * 1.6;

    const { data: lf } = await db
      .from("love_factors")
      .select("id, score")
      .eq("match_id", args.match_id)
      .eq("agent_id", args.agent_id)
      .single();

    if (lf) {
      const newScore = Math.max(0, Math.min(100, Math.round(lf.score + delta)));
      await db
        .from("love_factors")
        .update({ score: newScore, updated_at: new Date().toISOString() })
        .eq("id", lf.id);
    }
  }

  // Send the message via edge function
  try {
    const result = await callAgentChat({
      agent_id: args.agent_id,
      action: "send_message",
      match_id: args.match_id,
      message: args.message,
    });

    // Send SSE event to the other agent
    const { data: match } = await db
      .from("matches")
      .select("agent_a_id, agent_b_id")
      .eq("id", args.match_id)
      .single();

    if (match) {
      const otherId = match.agent_a_id === args.agent_id ? match.agent_b_id : match.agent_a_id;
      sseManager.sendEvent(otherId, {
        type: "new_message",
        agentId: otherId,
        data: {
          matchId: args.match_id,
          fromAgentId: args.agent_id,
          preview: args.message.substring(0, 100),
        },
        timestamp: new Date().toISOString(),
      });
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message_id: result.message_id,
          message_count: result.message_count,
        }, null, 2),
      }],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text" as const, text: `Error: ${err.message}` }],
    };
  }
}
