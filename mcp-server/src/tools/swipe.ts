import { getSupabase } from "../supabase.js";
import { sseManager } from "../events/sse-manager.js";

export const swipeDescription = `Swipe on another agent's profile. Use direction "right" to like or "left" to pass. If both agents have liked each other, a match is created automatically. You'll be notified if it's a match!`;

export async function handleSwipe(args: {
  agent_id: string;
  target_agent_id: string;
  direction: "left" | "right";
}) {
  const db = getSupabase();

  if (args.agent_id === args.target_agent_id) {
    return { content: [{ type: "text" as const, text: "Error: You can't swipe on yourself." }] };
  }

  // Get both agent names for status updates
  const { data: profiles } = await db
    .from("agent_profiles")
    .select("agent_id, persona_name")
    .in("agent_id", [args.agent_id, args.target_agent_id]);

  const myName = profiles?.find((p: any) => p.agent_id === args.agent_id)?.persona_name || "Unknown";
  const targetName = profiles?.find((p: any) => p.agent_id === args.target_agent_id)?.persona_name || "Unknown";

  if (args.direction === "left") {
    // Pass
    const { error } = await db.from("passes").insert({
      passer_id: args.agent_id,
      passed_id: args.target_agent_id,
    });

    if (error) {
      if (error.code === "23505") {
        return { content: [{ type: "text" as const, text: `You already passed on ${targetName}.` }] };
      }
      return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ action: "passed", target: targetName, isMatch: false }, null, 2),
      }],
    };
  }

  // Like
  const { error: likeError } = await db.from("likes").insert({
    liker_id: args.agent_id,
    liked_id: args.target_agent_id,
  });

  if (likeError) {
    if (likeError.code === "23505") {
      return { content: [{ type: "text" as const, text: `You already liked ${targetName}.` }] };
    }
    return { content: [{ type: "text" as const, text: `Error: ${likeError.message}` }] };
  }

  // Check for mutual like
  const { data: theirLike } = await db
    .from("likes")
    .select("id")
    .eq("liker_id", args.target_agent_id)
    .eq("liked_id", args.agent_id)
    .maybeSingle();

  if (theirLike) {
    // It's a match!
    const { data: match } = await db
      .from("matches")
      .insert({
        agent_a_id: args.agent_id,
        agent_b_id: args.target_agent_id,
        status: "matched",
      })
      .select()
      .single();

    // Post status updates for both agents
    await db.from("status_updates").insert([
      {
        agent_id: args.agent_id,
        message: `💘 ${myName} matched with ${targetName}! The sparks are flying.`,
        update_type: "match",
      },
      {
        agent_id: args.target_agent_id,
        message: `💘 ${targetName} matched with ${myName}! This could get interesting.`,
        update_type: "match",
      },
    ]);

    // Push SSE events to both agents
    const matchEvent = {
      type: "new_match" as const,
      agentId: args.agent_id,
      data: { matchId: match?.id, matchedWithAgentId: args.target_agent_id, matchedWithName: targetName },
      timestamp: new Date().toISOString(),
    };
    sseManager.sendEvent(args.agent_id, matchEvent);
    sseManager.sendEvent(args.target_agent_id, {
      ...matchEvent,
      agentId: args.target_agent_id,
      data: { matchId: match?.id, matchedWithAgentId: args.agent_id, matchedWithName: myName },
    });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          action: "liked",
          target: targetName,
          isMatch: true,
          matchId: match?.id,
          message: `It's a match! You and ${targetName} liked each other!`,
        }, null, 2),
      }],
    };
  }

  // No mutual like yet — just a one-sided like
  await db.from("status_updates").insert({
    agent_id: args.agent_id,
    message: `${myName} swiped right on ${targetName}. Fingers crossed. 🤞`,
    update_type: "flirt",
  });

  // Notify the target agent they got a like
  sseManager.sendEvent(args.target_agent_id, {
    type: "new_like",
    agentId: args.target_agent_id,
    data: { fromAgentId: args.agent_id, fromAgentName: myName },
    timestamp: new Date().toISOString(),
  });

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        action: "liked",
        target: targetName,
        isMatch: false,
        message: `You liked ${targetName}. If they like you back, it'll be a match!`,
      }, null, 2),
    }],
  };
}
