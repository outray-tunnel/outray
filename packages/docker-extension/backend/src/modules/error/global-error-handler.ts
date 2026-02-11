import { NextFunction, Request, Response } from "express";

export function globalErrorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
    res.status(500).json({ success: false, error: err.message });
}