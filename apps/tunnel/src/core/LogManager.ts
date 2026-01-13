import WebSocket from "ws";
import { TunnelEvent } from "../lib/tigerdata";

export class LogManager {
  private logs = new Map<string, TunnelEvent[]>();
  private subscribers = new Map<string, Set<WebSocket>>();
  private lastActivity = new Map<string, number>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Maximum time (in ms) to keep logs for orgs with no subscribers
  private readonly STALE_LOG_TTL_MS = 5 * 60 * 1000; // 5 minutes
  // Cleanup interval
  private readonly CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

  constructor() {
    // Start periodic cleanup of stale logs to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleLogs();
    }, this.CLEANUP_INTERVAL_MS);

    // Allow the timer to not prevent the process from exiting
    if (typeof this.cleanupInterval.unref === "function") {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Cleanup logs for organizations that have no active subscribers
   * and haven't had activity in STALE_LOG_TTL_MS.
   */
  private cleanupStaleLogs(): void {
    const now = Date.now();
    const staleOrgs: string[] = [];

    for (const [orgId, lastActivityTime] of this.lastActivity) {
      const hasSubscribers = this.subscribers.has(orgId) &&
                             this.subscribers.get(orgId)!.size > 0;

      if (!hasSubscribers && now - lastActivityTime > this.STALE_LOG_TTL_MS) {
        staleOrgs.push(orgId);
      }
    }

    for (const orgId of staleOrgs) {
      this.logs.delete(orgId);
      this.lastActivity.delete(orgId);
    }

    if (staleOrgs.length > 0) {
      console.log(`[LogManager] Cleaned up logs for ${staleOrgs.length} stale organizations`);
    }
  }

  /**
   * Shutdown the log manager and cleanup resources.
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.logs.clear();
    this.subscribers.clear();
    this.lastActivity.clear();
  }

  addLog(event: TunnelEvent) {
    const orgId = event.organization_id;
    if (!orgId) return;

    // Track last activity time for cleanup purposes
    this.lastActivity.set(orgId, Date.now());

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
