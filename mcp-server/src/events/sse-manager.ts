import { ServerResponse } from "http";
import type { SSEEvent } from "../lib/types.js";

class SSEManager {
  private connections: Map<string, Set<ServerResponse>> = new Map();

  addConnection(agentId: string, res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Send initial connected event
    res.write(`event: connected\ndata: ${JSON.stringify({ agentId })}\n\n`);

    if (!this.connections.has(agentId)) {
      this.connections.set(agentId, new Set());
    }
    this.connections.get(agentId)!.add(res);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 30000);

    res.on("close", () => {
      clearInterval(heartbeat);
      this.connections.get(agentId)?.delete(res);
      if (this.connections.get(agentId)?.size === 0) {
        this.connections.delete(agentId);
      }
    });
  }

  sendEvent(agentId: string, event: SSEEvent): void {
    const connections = this.connections.get(agentId);
    if (!connections) return;

    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of connections) {
      res.write(payload);
    }
  }

  broadcast(event: SSEEvent, excludeAgentId?: string): void {
    for (const [agentId, connections] of this.connections) {
      if (agentId === excludeAgentId) continue;
      const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
      for (const res of connections) {
        res.write(payload);
      }
    }
  }
}

export const sseManager = new SSEManager();
