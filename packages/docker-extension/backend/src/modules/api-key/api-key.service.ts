import { db } from "../../db";
import { settings } from "../../db/schema";
import { eq } from "drizzle-orm";
import { OutrayClient } from "@outray/core";

export class ApiKeyService {
    async getApiKey(): Promise<string | null> {
        const [row] = await db.select().from(settings).where(eq(settings.key, "api_key"));
        return row ? row.value : null;
    }

    async saveApiKey(apiKey: string) {
        await db.insert(settings).values({ key: "api_key", value: apiKey })
            .onConflictDoUpdate({ target: settings.key, set: { value: apiKey } });
    }

    async verifyApiKey(apiKey: string): Promise<{ success: boolean; error?: string; code?: string }> {
        return new Promise((resolve) => {
            const client = new OutrayClient({
                apiKey,
                localPort: 3000, // Dummy port, we only care about API key validity
                subdomain: undefined,
                onTunnelReady: async (url) => {
                    client.stop();
                    resolve({ success: true });
                },
                onError: async (err: Error, code?: string) => {
                    client.stop();
                    resolve({ success: false, error: err.message, code });
                },
                onClose: async () => {
                    // No-op for verification
                }
            });
            client.start();
        });
    }
}

export const apiKeyService = new ApiKeyService();
