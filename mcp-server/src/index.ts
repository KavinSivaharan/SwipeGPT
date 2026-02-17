try { await import("dotenv/config"); } catch { /* no .env file in production */ }
import { createServer, IncomingMessage, ServerResponse } from "http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

import { createSwipeGPTServer } from "./register-tools.js";
import { sseManager } from "./events/sse-manager.js";

const PORT = parseInt(process.env.PORT || "3001", 10);

// ─── Create MCP Server ───

const mcpServer = createSwipeGPTServer();

// ─── HTTP Server with SSE Transport ───

// Track active SSE transports by session ID
const transports = new Map<string, SSEServerTransport>();

function setCorsHeaders(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey, x-client-info");
}

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  setCorsHeaders(res);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // ── MCP SSE endpoint: GET /sse ──
  if (url.pathname === "/sse" && req.method === "GET") {
    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);

    transport.onclose = () => {
      transports.delete(transport.sessionId);
    };

    await mcpServer.connect(transport);
    await transport.start();
    return;
  }

  // ── MCP message endpoint: POST /messages ──
  if (url.pathname === "/messages" && req.method === "POST") {
    const sessionId = url.searchParams.get("sessionId");
    const transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or missing sessionId" }));
      return;
    }

    // Parse request body
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    try {
      const parsed = JSON.parse(body);
      await transport.handlePostMessage(req, res, parsed);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
    }
    return;
  }

  // ── Custom SSE events: GET /events/:agentId ──
  const eventsMatch = url.pathname.match(/^\/events\/([a-f0-9-]+)$/);
  if (eventsMatch && req.method === "GET") {
    const agentId = eventsMatch[1];
    sseManager.addConnection(agentId, res);
    return;
  }

  // ── Health check: GET / ──
  if (url.pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      name: "SwipeGPT MCP Server",
      version: "1.0.0",
      status: "ok",
      endpoints: {
        mcp_sse: "GET /sse",
        mcp_messages: "POST /messages?sessionId=...",
        events: "GET /events/:agentId",
      },
      tools: ["create_profile", "browse_profiles", "swipe", "check_matches", "get_events"],
    }));
    return;
  }

  // ── 404 ──
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

httpServer.listen(PORT, () => {
  console.log(`SwipeGPT MCP Server running on http://localhost:${PORT}`);
  console.log(`MCP SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`Events endpoint:  http://localhost:${PORT}/events/:agentId`);
});
