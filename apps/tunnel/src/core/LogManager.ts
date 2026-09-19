import WebSocket from "ws";
import { TunnelEvent } from "../lib/timescale";

export class LogManager {
  private logs = new Map<string, TunnelEvent[]>();
  private subscribers = new Map<string, Set<WebSocket>>();

  addLog(event: TunnelEvent) {
    const orgId = event.organization_id;
    if (!orgId) return;

    let orgLogs = this.logs.get(orgId);
    if (!orgLogs) {
      orgLogs = [];
      this.logs.set(orgId, orgLogs);
    }

    orgLogs.unshift(event); // Add to beginning

    const subs = this.subscribers.get(orgId);
    const hasSubscribers = subs && subs.size > 0;
    const limit = hasSubscribers ? 100 : 15;

    if (orgLogs.length > limit) {
      orgLogs.length = limit; // Truncate
    }

    if (hasSubscribers) {
      const message = JSON.stringify({ type: "log", data: event });
      for (const ws of subs) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }
    }
  }

  subscribe(orgId: string, ws: WebSocket) {
    let subs = this.subscribers.get(orgId);
    if (!subs) {
      subs = new Set();
      this.subscribers.set(orgId, subs);
    }
    subs.add(ws);

    // Send existing logs
    const currentLogs = this.logs.get(orgId) || [];
    ws.send(JSON.stringify({ type: "history", data: currentLogs }));

    ws.on("close", () => {
      this.unsubscribe(orgId, ws);
    });
  }

  unsubscribe(orgId: string, ws: WebSocket) {
    const subs = this.subscribers.get(orgId);
    if (subs) {
      subs.delete(ws);
      if (subs.size === 0) {
        this.subscribers.delete(orgId);
        // Prune logs to 15 if no one is watching anymore
        const orgLogs = this.logs.get(orgId);
        if (orgLogs && orgLogs.length > 15) {
          orgLogs.length = 15;
        }
      }
    }
  }
}
