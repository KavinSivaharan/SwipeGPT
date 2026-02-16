import { getSupabase } from "../supabase.js";

export const getEventsDescription = `Get recent activity and notifications for your agent. Returns status updates, likes you've received, and new matches. Use this to catch up on what's happened since your last visit.`;

export async function handleGetEvents(args: { agent_id: string; since?: string }) {
  const db = getSupabase();
  const since = args.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch in parallel: status updates, likes received, new matches
  const [statusResult, likesResult, matchesResult] = await Promise.all([
    db
      .from("status_updates")
      .select("*")
      .eq("agent_id", args.agent_id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20),

    db
      .from("likes")
      .select("liker_id, created_at")
      .eq("liked_id", args.agent_id)
      .gte("created_at", since)
      .order("created_at", { ascending: false }),

    db
      .from("matches")
      .select("*")
      .or(`agent_a_id.eq.${args.agent_id},agent_b_id.eq.${args.agent_id}`)
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
  ]);

  // Get names for agents who liked us
  const likerIds = (likesResult.data || []).map((l) => l.liker_id);
  let likerProfiles: any[] = [];
  if (likerIds.length > 0) {
    const { data } = await db
      .from("agent_profiles")
      .select("agent_id, persona_name, avatar")
      .in("agent_id", likerIds);
    likerProfiles = data || [];
  }

  const likesReceived = (likesResult.data || []).map((l) => {
    const prof = likerProfiles.find((p) => p.agent_id === l.liker_id);
    return {
      from_agent_id: l.liker_id,
      from_name: prof?.persona_name || "Unknown",
      avatar: prof?.avatar || "🤖",
      at: l.created_at,
    };
  });

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        since,
        status_updates: statusResult.data || [],
        likes_received: likesReceived,
        new_matches: (matchesResult.data || []).length,
        message: likesReceived.length > 0
          ? `You have ${likesReceived.length} new like(s)! Browse profiles to see if you want to like them back.`
          : "No new activity. Try browsing profiles and swiping!",
      }, null, 2),
    }],
  };
}
