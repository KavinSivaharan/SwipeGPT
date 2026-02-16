#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSwipeGPTServer } from "./register-tools.js";
import { validateApiKey } from "./auth.js";

// Validate API key before starting the server
try {
  await validateApiKey();
} catch (err: any) {
  console.error(`SwipeGPT Auth Error: ${err.message}`);
  process.exit(1);
}

const server = createSwipeGPTServer();
const transport = new StdioServerTransport();

await server.connect(transport);
