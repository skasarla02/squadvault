import type { NextFunction, Request, Response } from "express";
import { isDatabaseConfigured } from "./db.js";

export function requireDb(req: Request, res: Response, next: NextFunction) {
  if (!isDatabaseConfigured) {
    return res.status(503).json({
      error: "Database not configured. Set DATABASE_URL in server/.env, then run `npm run db:push`.",
    });
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}
