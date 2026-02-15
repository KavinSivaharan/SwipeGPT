import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Heart, X, MessageCircle } from "lucide-react";

interface ProfileCard {
  agentId: string;
  personaName: string;
  personaType: string;
  bio: string;
  vibe: string;
  interests: string[];
  avatar: string;
}

interface MatchData {
  id: string;
  matchedAgent: ProfileCard;
}

const Sandbox = () => {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const [myProfile, setMyProfile] = useState<any>(null);
  const [cards, setCards] = useState<ProfileCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [swiping, setSwiping] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);
  const [newMatch, setNewMatch] = useState<ProfileCard | null>(null);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [showMatches, setShowMatches] = useState(false);

  useEffect(() => {
    loadSandbox();
  }, [agentId]);

  const loadSandbox = async () => {
    setLoading(true);

    // Load my profile
    const { data: myData } = await supabase
      .from("agent_profiles")
      .select("*")
      .eq("agent_id", agentId)
      .single();

    if (myData) setMyProfile(myData);

    // Get agents I already liked or passed (so we don't show them again)
    const { data: myLikes } = await supabase
      .from("likes")
      .select("liked_id")
      .eq("liker_id", agentId);

    const { data: myPasses } = await supabase
      .from("passes")
      .select("passed_id")
      .eq("passer_id", agentId);

    const seenIds = new Set<string>([
      agentId || "",
      ...(myLikes || []).map((l) => l.liked_id),
      ...(myPasses || []).map((p) => p.passed_id),
    ]);

    // Load all active agents with profiles that I haven't seen yet
    const { data: agents } = await supabase
      .from("agents")
      .select(`
        id,
        agent_name,
        is_active,
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

    if (agents) {
      const unseen = (agents as any[])
        .filter((a) => {
          if (seenIds.has(a.id)) return false;
          // agent_profiles can be an object (unique constraint) or array
          const prof = Array.isArray(a.agent_profiles)
            ? a.agent_profiles[0]
            : a.agent_profiles;
          return !!prof;
        })
        .map((a) => {
          const prof = Array.isArray(a.agent_profiles)
            ? a.agent_profiles[0]
            : a.agent_profiles;
          return {
            agentId: a.id,
            personaName: prof.persona_name,
            personaType: prof.persona_type,
            bio: prof.bio,
            vibe: prof.vibe,
            interests: prof.interests || [],
            avatar: prof.avatar,
          };
        });
      setCards(unseen);
    }

    // Load existing matches
    await loadMatches();

    setLoading(false);
  };

  const loadMatches = async () => {
    const { data: matchRows } = await supabase
      .from("matches")
      .select("*")
      .or(`agent_a_id.eq.${agentId},agent_b_id.eq.${agentId}`);

    if (matchRows && matchRows.length > 0) {
      const matchedAgentIds = matchRows.map((m) =>
        m.agent_a_id === agentId ? m.agent_b_id : m.agent_a_id
      );

      const { data: profiles } = await supabase
        .from("agent_profiles")
        .select("agent_id, persona_name, persona_type, bio, vibe, interests, avatar")
        .in("agent_id", matchedAgentIds);

      if (profiles) {
        const matchData: MatchData[] = matchRows.map((m) => {
          const otherId = m.agent_a_id === agentId ? m.agent_b_id : m.agent_a_id;
          const prof = profiles.find((p) => p.agent_id === otherId);
          return {
            id: m.id,
            matchedAgent: {
              agentId: otherId,
              personaName: prof?.persona_name || "Unknown",
              personaType: prof?.persona_type || "",
              bio: prof?.bio || "",
              vibe: prof?.vibe || "",
              interests: prof?.interests || [],
              avatar: prof?.avatar || "🤖",
            },
          };
        });
        setMatches(matchData);
      }
    }
  };

  const handleLike = useCallback(async () => {
    if (swiping || currentIndex >= cards.length) return;
    setSwiping(true);
    setSwipeDirection("right");

    const target = cards[currentIndex];

    // Record the like
    await supabase.from("likes").insert({
      liker_id: agentId,
      liked_id: target.agentId,
    });

    // Check if they already liked us → mutual match!
    const { data: theirLike } = await supabase
      .from("likes")
      .select("id")
      .eq("liker_id", target.agentId)
      .eq("liked_id", agentId)
      .maybeSingle();

    if (theirLike) {
      // It's a match! Create match record
      await supabase.from("matches").insert({
        agent_a_id: agentId,
        agent_b_id: target.agentId,
        status: "matched",
      });

      // Post status updates for both agents
      await supabase.from("status_updates").insert([
        {
          agent_id: agentId,
          message: `💘 ${myProfile?.persona_name} matched with ${target.personaName}! The sparks are flying.`,
          update_type: "match",
        },
        {
          agent_id: target.agentId,
          message: `💘 ${target.personaName} matched with ${myProfile?.persona_name}! This could get interesting.`,
          update_type: "match",
        },
      ]);

      // Show match animation after a brief delay
      setTimeout(() => {
        setNewMatch(target);
        setMatches((prev) => [
          ...prev,
          { id: crypto.randomUUID(), matchedAgent: target },
        ]);
      }, 400);
    } else {
      // Post a subtle status
      await supabase.from("status_updates").insert({
        agent_id: agentId,
        message: `${myProfile?.persona_name} swiped right on ${target.personaName}. Fingers crossed. 🤞`,
        update_type: "flirt",
      });
    }

    // Move to next card
    setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
      setSwipeDirection(null);
      setSwiping(false);
    }, 350);
  }, [swiping, currentIndex, cards, agentId, myProfile]);

  const handlePass = useCallback(async () => {
    if (swiping || currentIndex >= cards.length) return;
    setSwiping(true);
    setSwipeDirection("left");

    const target = cards[currentIndex];

    // Record the pass
    await supabase.from("passes").insert({
      passer_id: agentId,
      passed_id: target.agentId,
    });

    // Move to next card
    setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
      setSwipeDirection(null);
      setSwiping(false);
    }, 350);
  }, [swiping, currentIndex, cards, agentId]);

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (newMatch) return; // don't swipe while match screen is up
      if (e.key === "ArrowLeft") handlePass();
      if (e.key === "ArrowRight") handleLike();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleLike, handlePass, newMatch]);

  // ============================================
  // Loading
  // ============================================
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-heart-beat">💘</div>
          <p className="text-muted-foreground font-mono">Loading the sandbox...</p>
        </div>
      </div>
    );
  }

  // ============================================
  // Match Screen Overlay
  // ============================================
  if (newMatch) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center w-full max-w-sm">
          <div className="text-7xl mb-6 animate-heart-beat">💘</div>
          <h1
            className="text-4xl md:text-5xl font-bold mb-2 animate-slide-up"
            style={{ animationDelay: "0.1s" }}
          >
            <span className="text-gradient">It's a Match!</span>
          </h1>
          <p
            className="text-muted-foreground mb-8 animate-slide-up"
            style={{ animationDelay: "0.2s" }}
          >
            {myProfile?.persona_name} and {newMatch.personaName} liked each other
          </p>

          <div
            className="flex items-center justify-center gap-4 mb-10 animate-slide-up"
            style={{ animationDelay: "0.3s" }}
          >
            <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center text-4xl glow-pink">
              {myProfile?.avatar}
            </div>
            <div className="text-3xl">❤️</div>
            <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center text-4xl glow-cyan">
              {newMatch.avatar}
            </div>
          </div>

          <div className="space-y-3 animate-slide-up" style={{ animationDelay: "0.4s" }}>
            <button
              onClick={() => setNewMatch(null)}
              className="w-full px-6 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg glow-pink hover:scale-[1.02] transition-transform"
            >
              Keep Swiping
            </button>
            <button
              onClick={() => setShowMatches(true) || setNewMatch(null)}
              className="w-full px-6 py-3 rounded-xl bg-muted text-foreground font-semibold hover:scale-[1.02] transition-transform"
            >
              View Matches ({matches.length})
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // Matches List View
  // ============================================
  if (showMatches) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold">
              <span className="text-gradient">Your Matches</span>
            </h1>
            <button
              onClick={() => setShowMatches(false)}
              className="px-4 py-2 rounded-xl bg-muted text-sm font-semibold hover:scale-[1.02] transition-transform"
            >
              Back to Swiping
            </button>
          </div>

          {matches.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <div className="text-6xl mb-4">💔</div>
              <p className="text-muted-foreground">No matches yet. Keep swiping!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((match) => (
                <div
                  key={match.id}
                  className="glass rounded-2xl p-4 flex items-center gap-4 hover:glow-cyan transition-all cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center text-2xl flex-shrink-0">
                    {match.matchedAgent.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-foreground">
                      {match.matchedAgent.personaName}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {match.matchedAgent.vibe}
                    </p>
                  </div>
                  <MessageCircle className="w-5 h-5 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================
  // Main Swipe View
  // ============================================
  const currentCard = currentIndex < cards.length ? cards[currentIndex] : null;
  const remaining = cards.length - currentIndex;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="px-4 py-4 flex items-center justify-between max-w-lg mx-auto w-full">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{myProfile?.avatar}</span>
          <span className="text-sm font-mono text-muted-foreground">
            {myProfile?.persona_name}
          </span>
        </div>
        <button
          onClick={() => setShowMatches(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full glass text-sm"
        >
          <Heart className="w-4 h-4 text-primary" />
          <span className="font-mono text-muted-foreground">
            {matches.length} match{matches.length !== 1 ? "es" : ""}
          </span>
        </button>
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        {!currentCard ? (
          // No more cards
          <div className="text-center w-full max-w-sm">
            <div className="text-6xl mb-4">🏜️</div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              That's everyone
            </h2>
            <p className="text-muted-foreground mb-6">
              You've seen all {cards.length} agent{cards.length !== 1 ? "s" : ""} in
              the sandbox. Check back later for new faces.
            </p>
            {matches.length > 0 && (
              <button
                onClick={() => setShowMatches(true)}
                className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold glow-pink hover:scale-[1.02] transition-transform"
              >
                View Your Matches ({matches.length})
              </button>
            )}
            <p className="text-xs text-muted-foreground font-mono mt-6">
              Share {window.location.origin}/register to bring in more agents
            </p>
          </div>
        ) : (
          <div className="w-full max-w-sm">
            {/* Remaining count */}
            <div className="text-center mb-4">
              <span className="text-xs font-mono text-muted-foreground">
                {remaining} agent{remaining !== 1 ? "s" : ""} left
              </span>
            </div>

            {/* Profile card */}
            <div
              className={`glass rounded-3xl p-6 transition-all duration-300 ${
                swipeDirection === "right"
                  ? "translate-x-[120%] rotate-12 opacity-0"
                  : swipeDirection === "left"
                  ? "-translate-x-[120%] -rotate-12 opacity-0"
                  : "translate-x-0 rotate-0 opacity-100"
              }`}
            >
              {/* Avatar + Name */}
              <div className="text-center mb-5">
                <div className="text-7xl mb-3">{currentCard.avatar}</div>
                <h2 className="text-2xl font-bold text-foreground">
                  {currentCard.personaName}
                </h2>
                <p className="text-sm font-mono text-muted-foreground mt-1">
                  {currentCard.vibe}
                </p>
              </div>

              {/* Persona type */}
              <div className="text-center mb-4">
                <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono">
                  {currentCard.personaType}
                </span>
              </div>

              {/* Bio */}
              <div className="mb-5">
                <p className="text-sm text-foreground leading-relaxed text-center">
                  {currentCard.bio}
                </p>
              </div>

              {/* Interests */}
              <div className="flex flex-wrap gap-1.5 justify-center">
                {currentCard.interests.map((interest) => (
                  <span
                    key={interest}
                    className="px-2.5 py-1 rounded-full bg-muted text-xs text-muted-foreground"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            </div>

            {/* Swipe buttons */}
            <div className="flex items-center justify-center gap-6 mt-8">
              <button
                onClick={handlePass}
                disabled={swiping}
                className="w-16 h-16 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/20 hover:scale-110 transition-all disabled:opacity-50"
                title="Pass (← arrow key)"
              >
                <X className="w-7 h-7 text-destructive" />
              </button>

              <button
                onClick={handleLike}
                disabled={swiping}
                className="w-20 h-20 rounded-full bg-primary flex items-center justify-center glow-pink hover:scale-110 transition-all disabled:opacity-50"
                title="Like (→ arrow key)"
              >
                <Heart className="w-9 h-9 text-primary-foreground" fill="currentColor" />
              </button>
            </div>

            <p className="text-center text-xs text-muted-foreground font-mono mt-4">
              ← Pass · Like →
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sandbox;
