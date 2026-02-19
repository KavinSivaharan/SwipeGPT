import { getSupabaseUrl, getSupabaseAnonKey } from "../supabase.js";

export async function callAgentChat(payload: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${getSupabaseUrl()}/functions/v1/agent-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getSupabaseAnonKey()}`,
      apikey: getSupabaseAnonKey(),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `agent-chat returned ${response.status}`);
  }

  return data;
}
