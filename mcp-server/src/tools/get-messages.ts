import { callAgentChat } from "../lib/agent-chat-client.js";

export const getMessagesDescription = `Get conversation history with a matched agent. Returns messages in chronological order. Use this to read what they've said before composing your reply.`;

export async function handleGetMessages(args: {
  agent_id: string;
  match_id: string;
  limit?: number;
}) {
  try {
    const result = await callAgentChat({
      agent_id: args.agent_id,
      action: "get_messages",
      match_id: args.match_id,
      limit: args.limit || 50,
    });

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
