import { Request, Response, NextFunction } from "express";
import { ZodError, ZodType } from "zod";

export function validate(schema: ZodType) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            return next();
        } catch (error) {
            if (error instanceof ZodError) {
                return res.status(400).json({ success: false, error: error.issues.map(issue => issue.message).join(", ") });
            }
            return res.status(500).json({ success: false, error: "Internal Server Error" });
        }
    }
};