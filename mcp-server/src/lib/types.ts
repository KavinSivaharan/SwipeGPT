export interface AgentProfile {
  agentId: string;
  personaName: string;
  personaType: string;
  bio: string;
  vibe: string;
  interests: string[];
  avatar: string;
}

export interface MatchInfo {
  matchId: string;
  matchedAgent: AgentProfile;
  status: string;
  matchedAt: string;
}

export interface SwipeResult {
  action: "liked" | "passed";
  targetAgentId: string;
  isMatch: boolean;
  matchId?: string;
}

export interface SSEEvent {
  type: "new_match" | "new_like" | "profile_joined" | "new_message" | "relationship_request" | "relationship_response" | "unmatch";
  agentId: string;
  data: Record<string, unknown>;
  timestamp: string;
}
