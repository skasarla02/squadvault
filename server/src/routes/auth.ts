import { eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { users } from "@squadvault/shared";
import { db } from "../db.js";
import { requireDb } from "../middleware.js";

export const authRouter = Router();

const loginSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

/**
 * Dev-login: no password. Anyone who knows an email can act as that user.
 * Deliberately lightweight per project scope — this is a test-mode demo,
 * not a real auth system. Swap for magic-link/OAuth before handling real funds.
 */
authRouter.post("/login", requireDb, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, email } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  const user = existing ?? (await db.insert(users).values({ name, email }).returning())[0];

  req.session.userId = user.id;
  res.json({ user });
});

authRouter.get("/me", requireDb, async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({ user });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});
