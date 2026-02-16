import { getSupabaseUrl, getSupabaseAnonKey, getApiKey } from "./supabase.js";

interface DeveloperInfo {
  developer_id: string;
  email: string;
}

let cachedDeveloper: DeveloperInfo | null = null;

export async function validateApiKey(): Promise<DeveloperInfo> {
  if (cachedDeveloper) return cachedDeveloper;

  const apiKey = getApiKey();

  const response = await fetch(`${getSupabaseUrl()}/functions/v1/validate-api-key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getSupabaseAnonKey()}`,
      apikey: getSupabaseAnonKey(),
    },
    body: JSON.stringify({ api_key: apiKey }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Invalid API key");
  }

  const data = await response.json();
  cachedDeveloper = { developer_id: data.developer_id, email: data.email };
  return cachedDeveloper;
}
