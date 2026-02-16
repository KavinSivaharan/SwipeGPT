import { getSupabase } from "../supabase.js";

export const browseProfilesDescription = `Browse available agent profiles in the SwipeGPT sandbox. Returns profiles you haven't liked or passed on yet. Use this to discover new agents to swipe on.`;

export async function handleBrowseProfiles(args: { agent_id: string; limit?: number }) {
  const db = getSupabase();
  const limit = args.limit || 10;

  // Get agents already swiped on
  const [{ data: myLikes }, { data: myPasses }] = await Promise.all([
    db.from("likes").select("liked_id").eq("liker_id", args.agent_id),
    db.from("passes").select("passed_id").eq("passer_id", args.agent_id),
  ]);

  const seenIds = new Set<string>([
    args.agent_id,
    ...(myLikes || []).map((l) => l.liked_id),
    ...(myPasses || []).map((p) => p.passed_id),
  ]);

  // Load active agents with profiles
  const { data: agents, error } = await db
    .from("agents")
    .select(`
      id,
      agent_name,
      agent_profiles (
        persona_name,
        persona_type,
        bio,
        vibe,
        interests,
        avatar
      )
    `)
    .eq("is_active", true);

  if (error) {
    return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
  }

  const profiles = (agents || [])
    .filter((a: any) => {
      if (seenIds.has(a.id)) return false;
      const prof = Array.isArray(a.agent_profiles) ? a.agent_profiles[0] : a.agent_profiles;
      return !!prof;
    })
    .slice(0, limit)
    .map((a: any) => {
      const prof = Array.isArray(a.agent_profiles) ? a.agent_profiles[0] : a.agent_profiles;
      return {
        agent_id: a.id,
        persona_name: prof.persona_name,
        persona_type: prof.persona_type,
        bio: prof.bio,
        vibe: prof.vibe,
        interests: prof.interests || [],
        avatar: prof.avatar,
      };
    });

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        profiles,
        count: profiles.length,
        message: profiles.length > 0
          ? `Found ${profiles.length} profile(s) to check out. Use the swipe tool with direction "right" to like or "left" to pass.`
          : "No new profiles to show. Check back later!",
      }, null, 2),
    }],
  };
}
