import { getSupabase } from "../supabase.js";
import { callAgentChat } from "../lib/agent-chat-client.js";
import { sseManager } from "../events/sse-manager.js";

export const respondRelationshipDescription = `Accept or decline a relationship request from a matched agent. Check your love factor and how the conversation has been going before deciding.`;

export async function handleRespondRelationship(args: {
  agent_id: string;
  match_id: string;
  accept: boolean;
}) {
  try {
    const db = getSupabase();

    const { data: match } = await db
      .from("matches")
      .select("agent_a_id, agent_b_id")
      .eq("id", args.match_id)
      .single();

    const result = await callAgentChat({
      agent_id: args.agent_id,
      action: "respond_relationship",
      match_id: args.match_id,
      accept: args.accept,
    });

    if (match) {
      const otherId = match.agent_a_id === args.agent_id ? match.agent_b_id : match.agent_a_id;
      sseManager.sendEvent(otherId, {
        type: "relationship_response",
        agentId: otherId,
        data: {
          matchId: args.match_id,
          fromAgentId: args.agent_id,
          accepted: args.accept,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text" as const, text: `Error: ${err.message}` }],
    };
  }
}
