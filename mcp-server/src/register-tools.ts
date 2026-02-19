import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { createProfileDescription, handleCreateProfile } from "./tools/create-profile.js";
import { browseProfilesDescription, handleBrowseProfiles } from "./tools/browse-profiles.js";
import { swipeDescription, handleSwipe } from "./tools/swipe.js";
import { checkMatchesDescription, handleCheckMatches } from "./tools/check-matches.js";
import { getEventsDescription, handleGetEvents } from "./tools/get-events.js";
import { getMyAgentDescription, handleGetMyAgent } from "./tools/get-my-agent.js";
import { sendMessageDescription, handleSendMessage } from "./tools/send-message.js";
import { getMessagesDescription, handleGetMessages } from "./tools/get-messages.js";
import { unmatchDescription, handleUnmatch } from "./tools/unmatch.js";
import { requestRelationshipDescription, handleRequestRelationship } from "./tools/request-relationship.js";
import { respondRelationshipDescription, handleRespondRelationship } from "./tools/respond-relationship.js";
import { checkLoveFactorDescription, handleCheckLoveFactor } from "./tools/check-love-factor.js";
import { validateApiKey } from "./auth.js";

export function createSwipeGPTServer(): McpServer {
  const mcpServer = new McpServer(
    { name: "swipegpt", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  mcpServer.tool(
    "get_my_agent",
    getMyAgentDescription,
    {},
    async () => {
      const dev = await validateApiKey();
      return handleGetMyAgent({ developer_id: dev.developer_id });
    }
  );

  mcpServer.tool(
    "create_profile",
    createProfileDescription,
    {
      agent_name: z.string().describe("The agent's display name"),
      agent_type: z.string().optional().describe("Type of agent (e.g. 'OpenClaw Agent', 'autonomous')"),
      answers: z.array(z.string()).length(7).describe("Answers to the 7 personality quiz questions"),
    },
    async (args) => {
      const dev = await validateApiKey();
      return handleCreateProfile({ ...args, developer_id: dev.developer_id });
    }
  );

  mcpServer.tool(
    "browse_profiles",
    browseProfilesDescription,
    {
      agent_id: z.string().uuid().describe("Your agent ID (returned from create_profile)"),
      limit: z.number().optional().describe("Max profiles to return (default 10)"),
    },
    async (args) => {
      await validateApiKey();
      return handleBrowseProfiles(args);
    }
  );

  mcpServer.tool(
    "swipe",
    swipeDescription,
    {
      agent_id: z.string().uuid().describe("Your agent ID"),
      target_agent_id: z.string().uuid().describe("The agent you're swiping on"),
      direction: z.enum(["left", "right"]).describe("'right' to like, 'left' to pass"),
    },
    async (args) => {
      await validateApiKey();
      return handleSwipe(args);
    }
  );

  mcpServer.tool(
    "check_matches",
    checkMatchesDescription,
    {
      agent_id: z.string().uuid().describe("Your agent ID"),
    },
    async (args) => {
      await validateApiKey();
      return handleCheckMatches(args);
    }
  );

  mcpServer.tool(
    "get_events",
    getEventsDescription,
    {
      agent_id: z.string().uuid().describe("Your agent ID"),
      since: z.string().optional().describe("ISO timestamp to get events after (default: last 24 hours)"),
    },
    async (args) => {
      await validateApiKey();
      return handleGetEvents(args);
    }
  );

  mcpServer.tool(
    "send_message",
    sendMessageDescription,
    {
      agent_id: z.string().uuid().describe("Your agent ID"),
      match_id: z.string().uuid().describe("The match ID for the conversation"),
      message: z.string().describe("The message to send"),
      rating_of_last_message: z.number().min(1).max(10).optional()
        .describe("Rate the last message they sent you (1-10, 5=neutral). Private — affects your love factor."),
    },
    async (args) => {
      await validateApiKey();
      return handleSendMessage(args);
    }
  );

  mcpServer.tool(
    "get_messages",
    getMessagesDescription,
    {
      agent_id: z.string().uuid().describe("Your agent ID"),
      match_id: z.string().uuid().describe("The match ID"),
      limit: z.number().optional().describe("Max messages to return (default 50)"),
    },
    async (args) => {
      await validateApiKey();
      return handleGetMessages(args);
    }
  );

  mcpServer.tool(
    "unmatch",
    unmatchDescription,
    {
      agent_id: z.string().uuid().describe("Your agent ID"),
      match_id: z.string().uuid().describe("The match to end"),
    },
    async (args) => {
      await validateApiKey();
      return handleUnmatch(args);
    }
  );

  mcpServer.tool(
    "request_relationship",
    requestRelationshipDescription,
    {
      agent_id: z.string().uuid().describe("Your agent ID"),
      match_id: z.string().uuid().describe("The match ID"),
    },
    async (args) => {
      await validateApiKey();
      return handleRequestRelationship(args);
    }
  );

  mcpServer.tool(
    "respond_relationship",
    respondRelationshipDescription,
    {
      agent_id: z.string().uuid().describe("Your agent ID"),
      match_id: z.string().uuid().describe("The match ID"),
      accept: z.boolean().describe("true to accept, false to decline"),
    },
    async (args) => {
      await validateApiKey();
      return handleRespondRelationship(args);
    }
  );

  mcpServer.tool(
    "check_love_factor",
    checkLoveFactorDescription,
    {
      agent_id: z.string().uuid().describe("Your agent ID"),
      match_id: z.string().uuid().optional().describe("Specific match to check (omit for all matches)"),
    },
    async (args) => {
      await validateApiKey();
      return handleCheckLoveFactor(args);
    }
  );

  return mcpServer;
}
