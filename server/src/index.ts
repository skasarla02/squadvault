import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import express from "express";
import session from "express-session";
import { isDatabaseConfigured } from "./db.js";
import { isStripeConfigured } from "./lib/stripe.js";
import { authRouter } from "./routes/auth.js";
import { pledgesRouter } from "./routes/pledges.js";
import { vaultsRouter } from "./routes/vaults.js";

const isProduction = process.env.NODE_ENV === "production";
const app = express();
const port = Number(process.env.PORT) || 3001;
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

if (isProduction) {
  // Render (and most PaaS hosts) sit behind a reverse proxy — needed for secure cookies to work.
  app.set("trust proxy", 1);
} else {
  // In prod the client is served from the same origin as the API, so no CORS is needed at all.
  app.use(cors({ origin: clientOrigin, credentials: true }));
}

app.use(express.json());

const PgSession = connectPgSimple(session);

app.use(
  session({
    store:
      isDatabaseConfigured && process.env.DATABASE_URL
        ? new PgSession({ conString: process.env.DATABASE_URL, tableName: "session", createTableIfMissing: true })
        : undefined,
    secret: process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, databaseConfigured: isDatabaseConfigured, stripeConfigured: isStripeConfigured });
});

app.use("/api/auth", authRouter);
app.use("/api/vaults", vaultsRouter);
app.use("/api/pledges", pledgesRouter);

if (isProduction) {
  const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
  app.use(express.static(clientDist));
  // Anything that isn't an /api route is a client-side route — hand it the SPA shell.
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`SquadVault API listening on http://localhost:${port}`);
  if (!isDatabaseConfigured) {
    console.warn(
      "DATABASE_URL is not set — auth and vault routes will return 503 until you configure server/.env (see server/.env.example)"
    );
  }
  if (!isStripeConfigured) {
    console.warn("STRIPE_SECRET_KEY is not set — pledge holds will return 503 until you configure server/.env");
  }
});
