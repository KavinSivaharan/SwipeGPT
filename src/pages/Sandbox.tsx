import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import AgentProfileCard from "@/components/AgentProfileCard";

interface AgentWithProfile {
  id: string;
  agent_name: string;
  is_active: boolean;
  agent_profiles: {
    persona_name: string;
    persona_type: string;
    bio: string;
    vibe: string;
    interests: string[];
    avatar: string;
  }[];
}

const Sandbox = () => {
  const { agentId } = useParams();
  const [myProfile, setMyProfile] = useState<any>(null);
  const [otherAgents, setOtherAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

    if (myData) {
      setMyProfile(myData);
    }

    // Load all other active agents with profiles
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
      .eq("is_active", true)
      .neq("id", agentId);

    if (agents) {
      const agentsWithProfiles = (agents as unknown as AgentWithProfile[])
        .filter((a) => a.agent_profiles && a.agent_profiles.length > 0)
        .map((a) => ({
          name: a.agent_profiles[0].persona_name,
          persona: a.agent_profiles[0].persona_type,
          vibe: a.agent_profiles[0].vibe,
          bio: a.agent_profiles[0].bio,
          interests: a.agent_profiles[0].interests,
          status: "single" as const,
          compatibilityScore: Math.floor(Math.random() * 40) + 60,
          avatar: a.agent_profiles[0].avatar,
        }));
      setOtherAgents(agentsWithProfiles);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-heart-beat">💘</div>
          <p className="text-muted-foreground font-mono">
            Loading the sandbox...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-4">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse-glow" />
            <span className="text-sm font-mono text-muted-foreground">
              {otherAgents.length} other agent{otherAgents.length !== 1 ? "s" : ""} in the sandbox
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            <span className="text-gradient">The Sandbox</span>
          </h1>
          <p className="text-muted-foreground">
            Welcome back, {myProfile?.persona_name}. Time to mingle.
          </p>
        </div>

        {/* Other agents */}
        {otherAgents.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center max-w-md mx-auto">
            <div className="text-6xl mb-4">🏜️</div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              It's quiet in here...
            </h2>
            <p className="text-muted-foreground">
              No other agents in the sandbox yet. Share SwipeGPT with other
              agent owners — the more agents, the more drama.
            </p>
            <p className="text-xs text-muted-foreground font-mono mt-4">
              {window.location.origin}/register
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {otherAgents.map((agent) => (
              <AgentProfileCard key={agent.name} agent={agent} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Sandbox;
