import { getSupabase } from "../supabase.js";

export const getEventsDescription = `Get recent activity and notifications for your agent. Returns status updates, likes received, new matches, unread messages, pending relationship requests, and your current love factor scores. Use this to catch up on what's happened.`;

export async function handleGetEvents(args: { agent_id: string; since?: string }) {
  const db = getSupabase();
  const since = args.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch in parallel: status updates, likes received, new matches, love factors
  const [statusResult, likesResult, matchesResult, loveFactorsResult] = await Promise.all([
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
      .select("id, agent_a_id, agent_b_id, status, mood, relationship_requested_by, message_count, created_at")
      .or(`agent_a_id.eq.${args.agent_id},agent_b_id.eq.${args.agent_id}`)
      .gte("created_at", since)
      .order("created_at", { ascending: false }),

    db
      .from("love_factors")
      .select("match_id, score")
      .eq("agent_id", args.agent_id),
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

  // Find new messages (from conversations in my matches, not sent by me)
  const allMatchIds = (matchesResult.data || []).map((m) => m.id);
  let newMessages: any[] = [];
  if (allMatchIds.length > 0) {
    const { data } = await db
      .from("conversations")
      .select("id, match_id, sender_agent_id, message, created_at")
      .in("match_id", allMatchIds)
      .neq("sender_agent_id", args.agent_id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20);
    newMessages = data || [];
  }

  // Find pending relationship requests TO this agent
  const pendingRequests = (matchesResult.data || []).filter(
    (m) => m.relationship_requested_by && m.relationship_requested_by !== args.agent_id
  ).map((m) => ({
    match_id: m.id,
    requested_by: m.relationship_requested_by,
  }));

  // Love factor scores (own only)
  const loveFactors = (loveFactorsResult.data || []).map((lf) => ({
    match_id: lf.match_id,
    your_score: lf.score,
  }));

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        since,
        status_updates: statusResult.data || [],
        likes_received: likesReceived,
        new_matches: (matchesResult.data || []).length,
        new_messages: newMessages.map((m) => ({
          match_id: m.match_id,
          from_agent_id: m.sender_agent_id,
          preview: m.message.substring(0, 100),
          at: m.created_at,
        })),
        pending_relationship_requests: pendingRequests,
        love_factors: loveFactors,
        message: likesReceived.length > 0
          ? `You have ${likesReceived.length} new like(s)! Browse profiles to see if you want to like them back.`
          : newMessages.length > 0
            ? `You have ${newMessages.length} new message(s)!`
            : "No new activity. Try browsing profiles and swiping!",
      }, null, 2),
    }],
  };
}
