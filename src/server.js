/**
 * server.js
 * ─────────────────────────────────────────────────────────────────
 * Quran Foundation OAuth2 + OIDC – Express server entry point.
 *
 * Uses cookie-session (httpOnly, sameSite=lax, secure in production)
 * to store PKCE state and tokens server-side.
 * Tokens are NEVER sent to the browser via JS-accessible cookies.
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

require("dotenv").config();

const express = require("express");
const cookieSession = require("cookie-session");
const cors = require("cors");
const path = require("path");

// Validate credentials at startup – fail fast.
const { getQfOAuthConfig } = require("./config/qfOAuthConfig");
const config = getQfOAuthConfig();
console.log(
  `[boot] QF OAuth2 ready | env=${config.env} | ` +
  `clientType=${config.isConfidential ? "confidential" : "public"} | ` +
  `auth=${config.authBaseUrl}`
);

const authRoutes = require("./auth/authRoutes");
const userRoutes = require("./api/userRoutes");
const contentRoutes = require("./content/contentRoutes");

// ── Redirect URI diagnostic ───────────────────────────────────────
// authRoutes prints the resolved redirect_uri at module load (above).
// Repeat it here in the broader startup block so it can't be missed.
const redirectUri = process.env.QF_REDIRECT_URI
  || ((process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "") + "/auth/callback");
console.log(`[boot] ┌─────────────────────────────────────────────────`);
console.log(`[boot] │  redirect_uri = ${redirectUri}`);
console.log(`[boot] │  Register this EXACT value in your QF OAuth2 client.`);
console.log(`[boot] │  Docs: https://api-docs.quran.foundation/docs/tutorials/oidc/client-setup`);
console.log(`[boot] └─────────────────────────────────────────────────`);

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === "production";

// ── Session (httpOnly cookie, server-side token storage) ──────────
app.use(
  cookieSession({
    name: "qf_session",
    secret: process.env.SESSION_SECRET,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "none" : "lax",
  })
);

console.log(`[boot] Session Cookie Settings: secure=${IS_PROD} | sameSite=${IS_PROD ? "none" : "lax"}`);

// ── CORS ─────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_BASE_URL || "https://hifz-app-five.vercel.app",
    credentials: true,
  })
);

console.log(`[boot] CORS origin: ${process.env.FRONTEND_BASE_URL || "https://hifz-app-five.vercel.app"}`);

// ── Static files ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "../public")));

// ── Auth routes ───────────────────────────────────────────────────
app.use("/auth", authRoutes);

// ── Mobile/SPA backend-proxy exchange endpoint ────────────────────
app.use("/api/auth/qf", authRoutes); // /api/auth/qf/exchange

// ── Protected User API proxy routes ──────────────────────────────
app.use("/api/user", userRoutes);

// ── Content API proxy routes ──────────────────────────────────────
app.use("/api/content", contentRoutes);


app.get("/quran-reader", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/quran-reader.html"));
});

app.get("/content-explorer", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/content-explorer.html"));
});


// ── Dashboard (protected) ─────────────────────────────────────────
app.get("/dashboard", (req, res) => {
  if (!req.session?.qf_tokens?.accessToken) {
    return res.redirect("/");
  }
  res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});

// ── Health check ──────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", env: config.env });
});

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log(`[server] Login flow: http://localhost:${PORT}/auth/login`);
});
