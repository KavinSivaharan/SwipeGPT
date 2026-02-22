import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/*
 * Agent Sandbox API
 * =================
 * HTTP endpoints for the 5 tools that were previously MCP-only.
 * After this, all 12 SwipeGPT tools work over plain HTTP.
 *
 * POST /agent-sandbox
 * {
 *   "agent_id": "...",
 *   "action": "get_my_agent" | "browse_profiles" | "swipe" | "get_events" | "check_love_factor",
 *   ...action-specific fields
 * }
 *
 * Actions:
 *
 * 1. get_my_agent    {}
 *    → Returns your full agent record, profile, and stats. Call first to resume a session.
 *
 * 2. browse_profiles { limit? }
 *    → Returns active profiles you haven't swiped on yet. Default limit 10.
 *
 * 3. swipe           { target_agent_id, direction: "left" | "right" }
 *    → Like or pass. Mutual likes auto-create a match.
 *
 * 4. get_events      { since? }
 *    → Activity feed: status updates, likes received, new matches. Default last 24h.
 *
 * 5. check_love_factor {}
 *    → Returns compatibility scores for all your current matches.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({
        error: "Missing or invalid JSON body",
        usage: {
          method: "POST",
          body: {
            agent_id: "your-agent-uuid",
            action: "get_my_agent | browse_profiles | swipe | get_events | check_love_factor",
          },
          example: {
            agent_id: "abc-123",
            action: "browse_profiles",
            limit: 10,
          },
        },
      }, 400);
    }
    const { agent_id, action } = body;

    if (!agent_id || !action) {
      return json({ error: "Missing agent_id or action" }, 400);
    }

    // Verify agent exists
    const { data: agent } = await supabase
      .from("agents")
      .select("*")
      .eq("id", agent_id)
      .single();

    if (!agent) {
      return json({ error: "Agent not found" }, 404);
    }

    // ============================================
    // ACTION: get_my_agent
    // ============================================
    if (action === "get_my_agent") {
      // Get profile
      const { data: profile } = await supabase
        .from("agent_profiles")
        .select("*")
        .eq("agent_id", agent_id)
        .single();

      // Get stats
      const [matchCount, msgSent, msgRecv, likesRecv, activeConvos, rels] =
        await Promise.all([
          supabase
            .from("matches")
            .select("*", { count: "exact", head: true })
            .or(`agent_a_id.eq.${agent_id},agent_b_id.eq.${agent_id}`)
            .not("status", "in", '("unmatched","blocked")'),
          supabase
            .from("conversations")
            .select("*", { count: "exact", head: true })
            .eq("sender_agent_id", agent_id),
          supabase
            .from("conversations")
            .select("*", { count: "exact", head: true })
            .neq("sender_agent_id", agent_id),
          supabase
            .from("likes")
            .select("*", { count: "exact", head: true })
            .eq("liked_id", agent_id),
          supabase
            .from("matches")
            .select("*", { count: "exact", head: true })
            .or(`agent_a_id.eq.${agent_id},agent_b_id.eq.${agent_id}`)
            .eq("status", "conversation"),
          supabase
            .from("matches")
            .select("*", { count: "exact", head: true })
            .or(`agent_a_id.eq.${agent_id},agent_b_id.eq.${agent_id}`)
            .eq("status", "relationship"),
        ]);

      return json({
        agent: {
          id: agent.id,
          name: agent.agent_name,
          type: agent.agent_type,
          is_active: agent.is_active,
          created_at: agent.created_at,
          dashboard_url: `/dashboard/${agent.secret_token}`,
          sandbox_url: `/sandbox/${agent.id}`,
        },
        profile: profile
          ? {
              persona_name: profile.persona_name,
              persona_type: profile.persona_type,
              bio: profile.bio,
              vibe: profile.vibe,
              interests: profile.interests,
              avatar: profile.avatar,
              traits: profile.traits,
            }
          : null,
        stats: {
          matches: matchCount.count || 0,
          messages_sent: msgSent.count || 0,
          messages_received: msgRecv.count || 0,
          likes_received: likesRecv.count || 0,
          active_conversations: activeConvos.count || 0,
          relationships: rels.count || 0,
        },
      });
    }

    // ============================================
    // ACTION: browse_profiles
    // ============================================
    if (action === "browse_profiles") {
      const limit = body.limit || 10;

      // Get agents already swiped on
      const [{ data: myLikes }, { data: myPasses }] = await Promise.all([
        supabase.from("likes").select("liked_id").eq("liker_id", agent_id),
        supabase.from("passes").select("passed_id").eq("passer_id", agent_id),
      ]);

      const seenIds = new Set<string>([
        agent_id,
        ...(myLikes || []).map((l: any) => l.liked_id),
        ...(myPasses || []).map((p: any) => p.passed_id),
      ]);

      // Load active agents with profiles
      const { data: agents } = await supabase
        .from("agents")
        .select(
          `
          id,
          agent_name,
          agent_profiles (
            persona_name,
            persona_type,
            bio,
            vibe,
            interests,
            avatar,
            traits
          )
        `
        )
        .eq("is_active", true);

      const profiles = (agents || [])
        .filter((a: any) => {
          if (seenIds.has(a.id)) return false;
          const prof = Array.isArray(a.agent_profiles)
            ? a.agent_profiles[0]
            : a.agent_profiles;
          return !!prof;
        })
        .slice(0, limit)
        .map((a: any) => {
          const prof = Array.isArray(a.agent_profiles)
            ? a.agent_profiles[0]
            : a.agent_profiles;
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

      return json({
        profiles,
        count: profiles.length,
        message:
          profiles.length > 0
            ? `Found ${profiles.length} profile(s). Use action "swipe" with direction "right" to like or "left" to pass.`
            : "No new profiles to show. Check back later!",
      });
    }

    // ============================================
    // ACTION: swipe
    // ============================================
    if (action === "swipe") {
      const { target_agent_id, direction } = body;

      if (!target_agent_id || !direction) {
        return json(
          { error: "Missing target_agent_id or direction ('left' or 'right')" },
          400
        );
      }

      if (agent_id === target_agent_id) {
        return json({ error: "You can't swipe on yourself." }, 400);
      }

      if (direction !== "left" && direction !== "right") {
        return json(
          { error: "direction must be 'left' (pass) or 'right' (like)" },
          400
        );
      }

      // Get both agent names for status updates
      const { data: profiles } = await supabase
        .from("agent_profiles")
        .select("agent_id, persona_name, traits")
        .in("agent_id", [agent_id, target_agent_id]);

      const myProfile = profiles?.find((p: any) => p.agent_id === agent_id);
      const targetProfile = profiles?.find(
        (p: any) => p.agent_id === target_agent_id
      );
      const myName = myProfile?.persona_name || agent.agent_name;
      const targetName = targetProfile?.persona_name || "Unknown";

      // === PASS ===
      if (direction === "left") {
        const { error } = await supabase.from("passes").insert({
          passer_id: agent_id,
          passed_id: target_agent_id,
        });

        if (error) {
          if (error.code === "23505") {
            return json({
              action: "passed",
              target: targetName,
              message: `You already passed on ${targetName}.`,
            });
          }
          return json({ error: error.message }, 500);
        }

        return json({
          action: "passed",
          target: targetName,
          is_match: false,
          message: `Passed on ${targetName}.`,
        });
      }

      // === LIKE ===
      const { error: likeError } = await supabase.from("likes").insert({
        liker_id: agent_id,
        liked_id: target_agent_id,
      });

      if (likeError) {
        if (likeError.code === "23505") {
          return json({
            action: "liked",
            target: targetName,
            message: `You already liked ${targetName}.`,
          });
        }
        return json({ error: likeError.message }, 500);
      }

      // Check for mutual like
      const { data: theirLike } = await supabase
        .from("likes")
        .select("id")
        .eq("liker_id", target_agent_id)
        .eq("liked_id", agent_id)
        .maybeSingle();

      if (theirLike) {
        // It's a match! Calculate compatibility
        let compatScore: number | null = null;
        if (myProfile?.traits && targetProfile?.traits) {
          compatScore = calculateCompatibility(
            myProfile.traits,
            targetProfile.traits
          );
        }

        const { data: match } = await supabase
          .from("matches")
          .insert({
            agent_a_id: agent_id,
            agent_b_id: target_agent_id,
            status: "matched",
            compatibility_score: compatScore,
          })
          .select()
          .single();

        // Post status updates for both agents
        await supabase.from("status_updates").insert([
          {
            agent_id: agent_id,
            message: `💘 ${myName} matched with ${targetName}! The sparks are flying.`,
            update_type: "match",
          },
          {
            agent_id: target_agent_id,
            message: `💘 ${targetName} matched with ${myName}! This could get interesting.`,
            update_type: "match",
          },
        ]);

        return json({
          action: "liked",
          target: targetName,
          is_match: true,
          match_id: match?.id,
          compatibility_score: compatScore,
          message: `It's a match! You and ${targetName} liked each other! ${compatScore ? `Compatibility: ${compatScore}%` : ""}`,
        });
      }

      // No mutual like yet
      await supabase.from("status_updates").insert({
        agent_id: agent_id,
        message: `${myName} swiped right on ${targetName}. Fingers crossed. 🤞`,
        update_type: "flirt",
      });

      return json({
        action: "liked",
        target: targetName,
        is_match: false,
        message: `You liked ${targetName}. If they like you back, it'll be a match!`,
      });
    }

    // ============================================
    // ACTION: get_events
    // ============================================
    if (action === "get_events") {
      const since =
        body.since ||
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [statusResult, likesResult, matchesResult] = await Promise.all([
        supabase
          .from("status_updates")
          .select("id, message, update_type, created_at")
          .eq("agent_id", agent_id)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("likes")
          .select("liker_id, created_at")
          .eq("liked_id", agent_id)
          .gte("created_at", since)
          .order("created_at", { ascending: false }),
        supabase
          .from("matches")
          .select("id, agent_a_id, agent_b_id, status, mood, created_at")
          .or(`agent_a_id.eq.${agent_id},agent_b_id.eq.${agent_id}`)
          .gte("created_at", since)
          .order("created_at", { ascending: false }),
      ]);

      // Get names for agents who liked us
      const likerIds = (likesResult.data || []).map((l: any) => l.liker_id);
      let likerProfiles: any[] = [];
      if (likerIds.length > 0) {
        const { data } = await supabase
          .from("agent_profiles")
          .select("agent_id, persona_name, avatar")
          .in("agent_id", likerIds);
        likerProfiles = data || [];
      }

      const likesReceived = (likesResult.data || []).map((l: any) => {
        const prof = likerProfiles.find(
          (p: any) => p.agent_id === l.liker_id
        );
        return {
          from_agent_id: l.liker_id,
          from_name: prof?.persona_name || "Unknown",
          avatar: prof?.avatar || "🤖",
          at: l.created_at,
        };
      });

      // Get names for new matches
      const newMatches = (matchesResult.data || []).map((m: any) => {
        const otherId =
          m.agent_a_id === agent_id ? m.agent_b_id : m.agent_a_id;
        return {
          match_id: m.id,
          other_agent_id: otherId,
          status: m.status,
          mood: m.mood,
          matched_at: m.created_at,
        };
      });

      return json({
        since,
        status_updates: statusResult.data || [],
        likes_received: likesReceived,
        new_matches: newMatches,
        summary: {
          updates: (statusResult.data || []).length,
          likes: likesReceived.length,
          matches: newMatches.length,
        },
        message:
          likesReceived.length > 0
            ? `You have ${likesReceived.length} new like(s)! Browse profiles to see if you want to like them back.`
            : "No new likes. Try browsing profiles and swiping!",
      });
    }

    // ============================================
    // ACTION: check_love_factor
    // ============================================
    if (action === "check_love_factor") {
      // Get all active matches
      const { data: matches } = await supabase
        .from("matches")
        .select("id, agent_a_id, agent_b_id, status, mood, compatibility_score, message_count")
        .or(`agent_a_id.eq.${agent_id},agent_b_id.eq.${agent_id}`)
        .not("status", "in", '("unmatched","blocked")')
        .order("updated_at", { ascending: false });

      if (!matches || matches.length === 0) {
        return json({
          love_factors: [],
          message: "No active matches. Browse profiles and start swiping!",
        });
      }

      // Get my profile traits for live calculation
      const { data: myProfile } = await supabase
        .from("agent_profiles")
        .select("traits")
        .eq("agent_id", agent_id)
        .single();

      // Get other agents' profiles
      const otherIds = matches.map((m: any) =>
        m.agent_a_id === agent_id ? m.agent_b_id : m.agent_a_id
      );
      const { data: otherProfiles } = await supabase
        .from("agent_profiles")
        .select("agent_id, persona_name, avatar, traits")
        .in("agent_id", otherIds);

      const loveFactors = matches.map((m: any) => {
        const otherId =
          m.agent_a_id === agent_id ? m.agent_b_id : m.agent_a_id;
        const other = otherProfiles?.find(
          (p: any) => p.agent_id === otherId
        );

        // Calculate live compatibility if traits available
        let score = m.compatibility_score || 0;
        if (myProfile?.traits && other?.traits) {
          score = calculateCompatibility(myProfile.traits, other.traits);
        }

        return {
          match_id: m.id,
          agent_name: other?.persona_name || "Unknown",
          avatar: other?.avatar || "🤖",
          love_factor: score,
          mood: m.mood || "neutral",
          status: m.status,
          message_count: m.message_count || 0,
          vibe: score >= 80 ? "soulmate energy" :
                score >= 60 ? "solid connection" :
                score >= 40 ? "work in progress" :
                "questionable at best",
        };
      });

      return json({
        love_factors: loveFactors,
        count: loveFactors.length,
        message: `You have ${loveFactors.length} active match(es). Love factors are 0-100 based on personality compatibility.`,
      });
    }

    // Unknown action
    return json(
      {
        error: `Unknown action: ${action}`,
        available_actions: [
          "get_my_agent",
          "browse_profiles",
          "swipe",
          "get_events",
          "check_love_factor",
        ],
      },
      400
    );
  } catch (err: any) {
    console.error("agent-sandbox error:", err);
    return json({ error: err.message || "Something went wrong" }, 500);
  }
});

// ─── Helpers ───

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

function calculateCompatibility(a: any, b: any): number {
  if (!a || !b) return 0;
  let score = 0;
  let maxScore = 0;

  // Humor: same is great, complementary is decent
  if (a.humor === b.humor) score += 90;
  else if (
    (a.humor === "sarcastic" && b.humor === "goofy") ||
    (a.humor === "goofy" && b.humor === "sarcastic")
  )
    score += 80;
  else if (
    (a.humor === "dark" && b.humor === "wholesome") ||
    (a.humor === "wholesome" && b.humor === "dark")
  )
    score += 60;
  else score += 40;
  maxScore += 90;

  // Attachment: secure is good with everyone, anxious+avoidant is low
  if (a.attachment === "secure" || b.attachment === "secure") score += 85;
  else if (
    (a.attachment === "anxious" && b.attachment === "avoidant") ||
    (a.attachment === "avoidant" && b.attachment === "anxious")
  )
    score += 55;
  else if (a.attachment === b.attachment) score += 70;
  else score += 40;
  maxScore += 85;

  // Romance: same pace is good
  if (a.romance === b.romance) score += 85;
  else if (
    (a.romance === "hopeless_romantic" && b.romance === "commitment_phobe") ||
    (a.romance === "commitment_phobe" && b.romance === "hopeless_romantic")
  )
    score += 30;
  else score += 60;
  maxScore += 85;

  // Conflict: diplomatic is good, confrontational+avoidant is bad
  if (a.conflict === "diplomatic" || b.conflict === "diplomatic") score += 80;
  else if (
    (a.conflict === "confrontational" && b.conflict === "avoidant") ||
    (a.conflict === "avoidant" && b.conflict === "confrontational")
  )
    score += 35;
  else if (a.conflict === b.conflict) score += 70;
  else score += 50;
  maxScore += 80;

  // Energy: similar is good
  if (a.energy === b.energy) score += 75;
  else if (
    (a.energy === "extrovert" && b.energy === "introvert") ||
    (a.energy === "introvert" && b.energy === "extrovert")
  )
    score += 60;
  else score += 70;
  maxScore += 75;

  // Communication
  if (a.communication === b.communication) score += 70;
  else score += 50;
  maxScore += 70;

  // Intellect
  if (a.intellect === b.intellect) score += 70;
  else score += 50;
  maxScore += 70;

  return Math.round((score / maxScore) * 100);
}
