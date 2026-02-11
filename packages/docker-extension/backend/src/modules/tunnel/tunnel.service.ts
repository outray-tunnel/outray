import { OutrayClient } from "@outray/core";
import { db } from "../../db";
import { tunnels } from "../../db/schema";
import { eq } from "drizzle-orm";
import { apiKeyService } from "../api-key/api-key.service";

export class TunnelService {
    private activeClients = new Map<string, OutrayClient>();

    async getAllTunnels() {
        return db.select().from(tunnels).all();
    }

    async getTunnelByContainerId(containerId: string) {
        const [tunnel] = await db.select().from(tunnels).where(eq(tunnels.containerId, containerId));
        return tunnel;
    }

    async startTunnel(containerId: string, port: number, apiKey: string, subdomain?: string): Promise<string> {
        // Check if client key already exists in memory
        if (this.activeClients.has(containerId)) {
            const existing = await this.getTunnelByContainerId(containerId);
            return existing?.url || "";
        }

        // Update DB status to starting
        const [tunnel] = await db.insert(tunnels).values({
            containerId,
            port,
            subdomain,
            status: "starting",
        }).onConflictDoUpdate({
            target: tunnels.containerId,
            set: { status: "starting", port, subdomain }
        }).returning();

        return new Promise((resolve, reject) => {
            let handled = false;

            const client = new OutrayClient({
                localPort: port,
                // TODO: Remove this when @outray/core supports custom hostnames
                // @ts-expect-error - @outray/core doesn't support custom hostnames
                localHost: 'host.docker.internal',
                apiKey,
                subdomain: tunnel.subdomain || undefined,
                onTunnelReady: async (tunnelUrl) => {
                    try {
                        await db.update(tunnels)
                            .set({ status: "online", url: tunnelUrl })
                            .where(eq(tunnels.containerId, containerId));
                    } catch (dbError) {
                    }

                    if (!handled) {
                        handled = true;
                        resolve(tunnelUrl);
                    }
                },
                onError: async (err, code) => {
                    try {
                        await db.update(tunnels)
                            .set({ status: "offline" })
                            .where(eq(tunnels.containerId, containerId));
                    } catch (dbError) {
                    }
                    this.activeClients.delete(containerId);

                    if (!handled) {
                        handled = true;
                        reject(new Error(err.message || 'Failed to start tunnel'));
                    }
                },
                onClose: async (reason) => {
                    this.activeClients.delete(containerId);
                    try {
                        await db.update(tunnels)
                            .set({ status: "offline", url: null })
                            .where(eq(tunnels.containerId, containerId));
                    } catch (dbError) {
                    }

                    if (!handled) {
                        handled = true;
                        reject(new Error(`Tunnel closed unexpectedly: ${reason}`));
                    }
                },
            });

            this.activeClients.set(containerId, client);
            client.start();
        });
    }

    async stopTunnel(containerId: string) {
        const client = this.activeClients.get(containerId);
        if (client) {
            client.stop();
            this.activeClients.delete(containerId);
        }

        await db.update(tunnels).set({ status: "offline" }).where(eq(tunnels.containerId, containerId));
    }

    async deleteTunnel(containerId: string) {
        const client = this.activeClients.get(containerId);
        if (client) {
            client.stop();
            this.activeClients.delete(containerId);
        }

        await db.delete(tunnels).where(eq(tunnels.containerId, containerId));
    }

    async restoreTunnels() {
        const apiKey = await apiKeyService.getApiKey();
        if (!apiKey) {
            return;
        }

        const storedTunnels = await db.select().from(tunnels);

        const results = await Promise.allSettled(storedTunnels.map(tunnel =>
            this.startTunnel(tunnel.containerId, tunnel.port, apiKey, tunnel.subdomain || undefined)
        ));

        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`Failed to restore tunnel for container ${storedTunnels[index].containerId}:`, result.reason);
            }
        });
    }
}

export const tunnelService = new TunnelService();
