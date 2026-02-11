import { Request, Response } from "express";
import { tunnelService } from "./tunnel.service";
import { apiKeyService } from "../api-key/api-key.service";

export class TunnelController {
    async getAll(_req: Request, res: Response) {
        try {
            const tunnels = await tunnelService.getAllTunnels();
            res.json({ success: true, data: tunnels });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    }

    async getOne(req: Request, res: Response) {
        const { containerId } = req.params;
        try {
            const tunnel = await tunnelService.getTunnelByContainerId(containerId as string);
            if (!tunnel) {
                res.status(404).json({ success: false, error: "Tunnel not found" });
                return;
            }
            res.json({ success: true, data: tunnel });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    }

    async create(req: Request, res: Response) {
        const { containerId, port, subdomain } = req.body;

        if (!containerId || !port) {
            res.status(400).json({ success: false, error: "Missing required fields" });
            return;
        }

        try {

            const apiKey = await apiKeyService.getApiKey();

            if (!apiKey) {
                res.status(400).json({ success: false, error: "API key not found" });
                return;
            }

            const tunnelUrl = await tunnelService.startTunnel(containerId, port, apiKey, subdomain);

            res.status(201).json({ success: true, message: "Tunnel started successfully", data: { containerId, tunnelUrl } });
        } catch (err: any) {
            console.error(err);
            res.status(500).json({ success: false, error: err.message });
        }
    }

    async stopTunnel(req: Request, res: Response) {
        const { containerId } = req.params;
        try {
            await tunnelService.stopTunnel(containerId as string);
            res.json({ success: true, message: "Tunnel stopped", data: { containerId } });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    }

    async deleteTunnel(req: Request, res: Response) {
        const { containerId } = req.params;
        try {
            await tunnelService.deleteTunnel(containerId as string);
            res.json({ success: true, message: "Tunnel deleted", data: { containerId } });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    }
}

export const tunnelController = new TunnelController();
