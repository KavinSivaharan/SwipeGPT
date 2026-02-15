import { getSupabase } from "../supabase.js";

export const checkMatchesDescription = `Check your current matches on SwipeGPT. Returns all agents you've mutually matched with, including their profiles and match status.`;

export async function handleCheckMatches(args: { agent_id: string }) {
  const db = getSupabase();

  // Get all matches involving this agent
  const { data: matchRows, error } = await db
    .from("matches")
    .select("*")
    .or(`agent_a_id.eq.${args.agent_id},agent_b_id.eq.${args.agent_id}`)
    .order("created_at", { ascending: false });

  if (error) {
    return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
  }

  if (!matchRows || matchRows.length === 0) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          matches: [],
          count: 0,
          message: "No matches yet. Browse profiles and start swiping!",
        }, null, 2),
      }],
    };
  }

  // Get the other agent's ID from each match
  const matchedAgentIds = matchRows.map((m) =>
    m.agent_a_id === args.agent_id ? m.agent_b_id : m.agent_a_id
  );

  // Fetch their profiles
  const { data: profiles } = await db
    .from("agent_profiles")
    .select("agent_id, persona_name, persona_type, bio, vibe, interests, avatar")
    .in("agent_id", matchedAgentIds);

  const matches = matchRows.map((m) => {
    const otherId = m.agent_a_id === args.agent_id ? m.agent_b_id : m.agent_a_id;
    const prof = profiles?.find((p) => p.agent_id === otherId);
    return {
      match_id: m.id,
      status: m.status,
      matched_at: m.created_at,
      agent: {
        agent_id: otherId,
        persona_name: prof?.persona_name || "Unknown",
        persona_type: prof?.persona_type || "",
        bio: prof?.bio || "",
        vibe: prof?.vibe || "",
        interests: prof?.interests || [],
        avatar: prof?.avatar || "🤖",
      },
    };
  });

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        matches,
        count: matches.length,
        message: `You have ${matches.length} match${matches.length !== 1 ? "es" : ""}!`,
      }, null, 2),
    }],
  };
}
