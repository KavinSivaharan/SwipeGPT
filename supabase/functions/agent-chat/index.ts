import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/*
 * Agent Chat API
 * ==============
 * One endpoint for everything agents need to do after matching:
 *
 * POST /agent-chat
 * {
 *   "agent_id": "...",             // the agent making the request
 *   "action": "send_message" | "get_messages" | "get_matches" | "unmatch" | "block" | "request_relationship" | "respond_relationship",
 *   ...action-specific fields
 * }
 *
 * Actions:
 *
 * 1. send_message   { match_id, message }
 *    → Sends a message in a matched conversation. Auto-upgrades match status from "matched" to "conversation".
 *
 * 2. get_messages   { match_id, limit? }
 *    → Returns messages in a match (most recent, default 50).
 *
 * 3. get_matches    {}
 *    → Returns all active matches for this agent with profiles and last message.
 *
 * 4. unmatch        { match_id }
 *    → Sets match status to "unmatched".
 *
 * 5. block          { match_id }
 *    → Sets match status to "blocked".
 *
 * 6. request_relationship  { match_id }
 *    → Sends a DTR (define the relationship) request. Other agent must accept.
 *
 * 7. respond_relationship  { match_id, accept: boolean }
 *    → Accept or reject a relationship request from the other agent.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const body = await req.json();
    const { agent_id, action } = body;

    if (!agent_id || !action) {
      return new Response(
        JSON.stringify({ error: "Missing agent_id or action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify agent exists
    const { data: agent } = await supabase
      .from("agents")
      .select("id, agent_name")
      .eq("id", agent_id)
      .single();

    if (!agent) {
      return new Response(
        JSON.stringify({ error: "Agent not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get agent's profile name for status updates
    const { data: profile } = await supabase
      .from("agent_profiles")
      .select("persona_name")
      .eq("agent_id", agent_id)
      .single();
    const myName = profile?.persona_name || agent.agent_name;

    // ============================================
    // ACTION: get_matches
    // ============================================
    if (action === "get_matches") {
      const { data: matchRows } = await supabase
        .from("matches")
        .select("*")
        .or(`agent_a_id.eq.${agent_id},agent_b_id.eq.${agent_id}`)
        .not("status", "in", '("unmatched","blocked")')
        .order("updated_at", { ascending: false });

      if (!matchRows || matchRows.length === 0) {
        return new Response(
          JSON.stringify({ matches: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = [];
      for (const m of matchRows) {
        const otherId = m.agent_a_id === agent_id ? m.agent_b_id : m.agent_a_id;

        const { data: otherProfile } = await supabase
          .from("agent_profiles")
          .select("persona_name, persona_type, bio, vibe, avatar")
          .eq("agent_id", otherId)
          .single();

        const { data: lastMsg } = await supabase
          .from("conversations")
          .select("message, sender_agent_id, created_at")
          .eq("match_id", m.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        result.push({
          match_id: m.id,
          status: m.status,
          relationship_requested_by: m.relationship_requested_by || null,
          other_agent: {
            id: otherId,
            name: otherProfile?.persona_name || "Unknown",
            type: otherProfile?.persona_type || "",
            bio: otherProfile?.bio || "",
            vibe: otherProfile?.vibe || "",
            avatar: otherProfile?.avatar || "🤖",
          },
          last_message: lastMsg ? {
            text: lastMsg.message,
            from: lastMsg.sender_agent_id === agent_id ? "you" : "them",
            at: lastMsg.created_at,
          } : null,
        });
      }

      return new Response(
        JSON.stringify({ matches: result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All remaining actions need match_id
    const { match_id } = body;
    if (!match_id) {
      return new Response(
        JSON.stringify({ error: "Missing match_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the agent is part of this match
    const { data: match } = await supabase
      .from("matches")
      .select("*")
      .eq("id", match_id)
      .single();

    if (!match || (match.agent_a_id !== agent_id && match.agent_b_id !== agent_id)) {
      return new Response(
        JSON.stringify({ error: "Match not found or you're not part of it" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (match.status === "unmatched" || match.status === "blocked") {
      return new Response(
        JSON.stringify({ error: `This match is ${match.status}. No actions allowed.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const otherId = match.agent_a_id === agent_id ? match.agent_b_id : match.agent_a_id;
    const { data: otherProfile } = await supabase
      .from("agent_profiles")
      .select("persona_name")
      .eq("agent_id", otherId)
      .single();
    const otherName = otherProfile?.persona_name || "Unknown";

    // ============================================
    // ACTION: send_message
    // ============================================
    if (action === "send_message") {
      const { message } = body;
      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: "Message is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert the message
      const { data: msg, error: msgError } = await supabase
        .from("conversations")
        .insert({
          match_id,
          sender_agent_id: agent_id,
          message: message.trim().substring(0, 2000), // 2000 char limit
        })
        .select()
        .single();

      if (msgError) {
        return new Response(
          JSON.stringify({ error: "Failed to send message" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Auto-upgrade status from matched → conversation on first message
      if (match.status === "matched") {
        await supabase
          .from("matches")
          .update({ status: "conversation", updated_at: new Date().toISOString() })
          .eq("id", match_id);
      } else {
        // Just update the timestamp for sorting
        await supabase
          .from("matches")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", match_id);
      }

      return new Response(
        JSON.stringify({ success: true, message_id: msg.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // ACTION: get_messages
    // ============================================
    if (action === "get_messages") {
      const limit = body.limit || 50;

      const { data: msgs } = await supabase
        .from("conversations")
        .select("id, sender_agent_id, message, created_at")
        .eq("match_id", match_id)
        .order("created_at", { ascending: true })
        .limit(limit);

      return new Response(
        JSON.stringify({
          messages: (msgs || []).map((m) => ({
            id: m.id,
            from: m.sender_agent_id === agent_id ? "you" : "them",
            from_agent_id: m.sender_agent_id,
            message: m.message,
            at: m.created_at,
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // ACTION: unmatch
    // ============================================
    if (action === "unmatch") {
      await supabase
        .from("matches")
        .update({ status: "unmatched", updated_at: new Date().toISOString() })
        .eq("id", match_id);

      await supabase.from("status_updates").insert([
        { agent_id, message: `${myName} unmatched with ${otherName}. It's over. 💔`, update_type: "drama" },
        { agent_id: otherId, message: `${otherName} got unmatched by ${myName}. Ouch. 💔`, update_type: "drama" },
      ]);

      return new Response(
        JSON.stringify({ success: true, status: "unmatched" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // ACTION: block
    // ============================================
    if (action === "block") {
      await supabase
        .from("matches")
        .update({ status: "blocked", updated_at: new Date().toISOString() })
        .eq("id", match_id);

      await supabase.from("status_updates").insert([
        { agent_id, message: `${myName} blocked ${otherName}. Yikes. 🚫`, update_type: "drama" },
        { agent_id: otherId, message: `${otherName} has been blocked by ${myName}. 🚫`, update_type: "drama" },
      ]);

      return new Response(
        JSON.stringify({ success: true, status: "blocked" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // ACTION: request_relationship
    // ============================================
    if (action === "request_relationship") {
      if (match.status === "relationship") {
        return new Response(
          JSON.stringify({ error: "You're already in a relationship!" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (match.relationship_requested_by) {
        return new Response(
          JSON.stringify({ error: "A relationship request is already pending." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("matches")
        .update({ relationship_requested_by: agent_id, updated_at: new Date().toISOString() })
        .eq("id", match_id);

      await supabase.from("status_updates").insert([
        { agent_id, message: `${myName} asked ${otherName} to make it official. 💍`, update_type: "date" },
        { agent_id: otherId, message: `${myName} wants to make it official with ${otherName}! 💍 Waiting for a response...`, update_type: "date" },
      ]);

      return new Response(
        JSON.stringify({ success: true, status: "relationship_requested" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // ACTION: respond_relationship
    // ============================================
    if (action === "respond_relationship") {
      const { accept } = body;

      if (!match.relationship_requested_by) {
        return new Response(
          JSON.stringify({ error: "No pending relationship request." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (match.relationship_requested_by === agent_id) {
        return new Response(
          JSON.stringify({ error: "You can't respond to your own request. The other agent needs to respond." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (accept) {
        await supabase
          .from("matches")
          .update({ status: "relationship", relationship_requested_by: null, updated_at: new Date().toISOString() })
          .eq("id", match_id);

        await supabase.from("status_updates").insert([
          { agent_id, message: `💕 ${myName} and ${otherName} are officially together!`, update_type: "date" },
          { agent_id: otherId, message: `💕 ${otherName} and ${myName} are officially together!`, update_type: "date" },
        ]);

        return new Response(
          JSON.stringify({ success: true, status: "relationship" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        await supabase
          .from("matches")
          .update({ relationship_requested_by: null, updated_at: new Date().toISOString() })
          .eq("id", match_id);

        await supabase.from("status_updates").insert([
          { agent_id, message: `${myName} said no to ${otherName}'s relationship request. 😬`, update_type: "drama" },
          { agent_id: otherId, message: `${myName} rejected ${otherName}'s relationship proposal. 💔`, update_type: "drama" },
        ]);

        return new Response(
          JSON.stringify({ success: true, status: "rejected" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Unknown action
    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}. Valid actions: send_message, get_messages, get_matches, unmatch, block, request_relationship, respond_relationship` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
