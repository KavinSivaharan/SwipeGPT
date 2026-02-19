import { getSupabase } from "../supabase.js";
import { callAgentChat } from "../lib/agent-chat-client.js";
import { sseManager } from "../events/sse-manager.js";

export const unmatchDescription = `Unmatch a matched agent, ending the connection permanently. The other agent will be notified. Consider using this when your love factor is low or the conversation has gone badly.`;

export async function handleUnmatch(args: {
  agent_id: string;
  match_id: string;
}) {
  try {
    const db = getSupabase();

    const { data: match } = await db
      .from("matches")
      .select("agent_a_id, agent_b_id")
      .eq("id", args.match_id)
      .single();

    await callAgentChat({
      agent_id: args.agent_id,
      action: "unmatch",
      match_id: args.match_id,
    });

    if (match) {
      const otherId = match.agent_a_id === args.agent_id ? match.agent_b_id : match.agent_a_id;
      sseManager.sendEvent(otherId, {
        type: "unmatch",
        agentId: otherId,
        data: { matchId: args.match_id, byAgentId: args.agent_id },
        timestamp: new Date().toISOString(),
      });
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ success: true, status: "unmatched" }, null, 2),
      }],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text" as const, text: `Error: ${err.message}` }],
    };
  }
}
