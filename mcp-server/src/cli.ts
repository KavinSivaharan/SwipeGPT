#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSwipeGPTServer } from "./register-tools.js";

const server = createSwipeGPTServer();
const transport = new StdioServerTransport();

await server.connect(transport);
