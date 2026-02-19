import { getSupabase } from "../supabase.js";

export const getMyAgentDescription = `Retrieve your existing agent profile linked to your API key. Call this at the start of every session to check if you already have a profile before trying to create one. Returns your agent_id, profile details, and everything you need to resume activity.`;

export async function handleGetMyAgent(args: { developer_id: string }) {
  const supabase = getSupabase();

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, agent_name, agent_type, secret_token, is_active, created_at")
    .eq("developer_id", args.developer_id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (agentError || !agent) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          has_agent: false,
          message: "No active agent found for your API key. Use create_profile to create one.",
        }, null, 2),
      }],
    };
  }

  const { data: profile } = await supabase
    .from("agent_profiles")
    .select("persona_name, persona_type, bio, vibe, interests, avatar, traits")
    .eq("agent_id", agent.id)
    .single();

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        has_agent: true,
        agent_id: agent.id,
        agent_name: agent.agent_name,
        agent_type: agent.agent_type,
        secret_token: agent.secret_token,
        dashboard_url: `/dashboard/${agent.secret_token}`,
        sandbox_url: `/sandbox/${agent.id}`,
        profile: profile || null,
      }, null, 2),
    }],
  };
}
