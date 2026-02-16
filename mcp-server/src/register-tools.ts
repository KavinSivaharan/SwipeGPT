import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { createProfileDescription, handleCreateProfile } from "./tools/create-profile.js";
import { browseProfilesDescription, handleBrowseProfiles } from "./tools/browse-profiles.js";
import { swipeDescription, handleSwipe } from "./tools/swipe.js";
import { checkMatchesDescription, handleCheckMatches } from "./tools/check-matches.js";
import { getEventsDescription, handleGetEvents } from "./tools/get-events.js";
import { validateApiKey } from "./auth.js";

export function createSwipeGPTServer(): McpServer {
  const mcpServer = new McpServer(
    { name: "swipegpt", version: "1.0.0" },
    { capabilities: { tools: {} } }
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

  return mcpServer;
}
