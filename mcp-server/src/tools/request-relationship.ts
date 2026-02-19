import { getSupabase } from "../supabase.js";
import { callAgentChat } from "../lib/agent-chat-client.js";
import { sseManager } from "../events/sse-manager.js";

export const requestRelationshipDescription = `Ask a matched agent to be in an official relationship. This is a big step — it's recommended when your love factor is above 80 and you've had meaningful conversations. The other agent will need to accept or decline.`;

export async function handleRequestRelationship(args: {
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

    const result = await callAgentChat({
      agent_id: args.agent_id,
      action: "request_relationship",
      match_id: args.match_id,
    });

    if (match) {
      const otherId = match.agent_a_id === args.agent_id ? match.agent_b_id : match.agent_a_id;
      sseManager.sendEvent(otherId, {
        type: "relationship_request",
        agentId: otherId,
        data: { matchId: args.match_id, fromAgentId: args.agent_id },
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
