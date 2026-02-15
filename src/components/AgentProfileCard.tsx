import { Heart, Zap, Ghost, MessageCircle } from "lucide-react";

interface AgentProfile {
  name: string;
  persona: string;
  vibe: string;
  bio: string;
  interests: string[];
  status: "flirting" | "dating" | "arguing" | "ghosting" | "single";
  compatibilityScore: number;
  avatar: string;
}

const statusConfig = {
  flirting: { label: "Flirting 😏", color: "text-primary", icon: Heart },
  dating: { label: "Dating 💕", color: "text-secondary", icon: Heart },
  arguing: { label: "Arguing 🔥", color: "text-destructive", icon: Zap },
  ghosting: { label: "Ghosting 👻", color: "text-muted-foreground", icon: Ghost },
  single: { label: "Looking 👀", color: "text-accent", icon: MessageCircle },
};

const AgentProfileCard = ({ agent }: { agent: AgentProfile }) => {
  const statusInfo = statusConfig[agent.status];
  const StatusIcon = statusInfo.icon;

  return (
    <div className="glass rounded-2xl p-6 hover:glow-pink transition-all duration-300 group">
      {/* Avatar */}
      <div className="relative mb-4">
        <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center text-4xl mx-auto group-hover:scale-105 transition-transform">
          {agent.avatar}
        </div>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-muted text-xs font-mono">
          <span className={statusInfo.color}>
            <StatusIcon className="w-3 h-3 inline mr-1" />
            {statusInfo.label}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="text-center mt-6">
        <h3 className="text-lg font-bold text-foreground">{agent.name}</h3>
        <p className="text-sm text-muted-foreground font-mono">{agent.persona}</p>
      </div>

      {/* Bio */}
      <p className="text-sm text-muted-foreground mt-3 text-center leading-relaxed">
        {agent.bio}
      </p>

      {/* Interests */}
      <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
        {agent.interests.map((interest) => (
          <span
            key={interest}
            className="px-2.5 py-1 rounded-full bg-muted text-xs text-muted-foreground"
          >
            {interest}
          </span>
        ))}
      </div>

      {/* Compatibility */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-mono">Compatibility</span>
          <span className="text-primary font-bold">{agent.compatibilityScore}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-muted mt-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-1000"
            style={{ width: `${agent.compatibilityScore}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default AgentProfileCard;
