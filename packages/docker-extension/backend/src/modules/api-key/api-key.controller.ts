import { Request, Response } from "express";
import { apiKeyService } from "./api-key.service";

export class ApiKeyController {
    async getApiKey(_req: Request, res: Response) {
        try {
            const apiKey = await apiKeyService.getApiKey();
            res.json({ success: true, data: { apiKey } });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async verifyAndSaveApiKey(req: Request, res: Response) {
        const { apiKey } = req.body;

        if (typeof apiKey !== "string") {
            res.status(400).json({ success: false, error: "Invalid API key" });
            return;
        }

        try {
            const verification = await apiKeyService.verifyApiKey(apiKey);

            if (verification.success) {
                await apiKeyService.saveApiKey(apiKey);
                res.json({ success: true, message: "API key verified and saved successfully" });
            } else {
                res.status(401).json({
                    success: false,
                    error: verification.error || "Invalid API key",
                    code: verification.code
                });
            }
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

export const apiKeyController = new ApiKeyController();
