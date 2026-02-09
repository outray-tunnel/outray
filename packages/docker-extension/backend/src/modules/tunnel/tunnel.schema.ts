import { z } from "zod";

export const createTunnelSchema = z.object({
    body: z.object({
        containerId: z.string().min(1, "Container ID is required"),
        port: z.number().int().positive(),
        subdomain: z.string().optional(),
    }),
});

export const containerIdSchema = z.object({
    params: z.object({
        containerId: z.string().min(1, "Container ID is required"),
    }),
});