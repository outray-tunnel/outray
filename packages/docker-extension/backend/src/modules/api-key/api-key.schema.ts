import { z } from "zod";

export const apiKeySchema = z.object({
    body: z.object({
        apiKey: z.string().trim().min(1, "API Key is required").startsWith("outray_"),
    }),
});