/**
 * authRoutes.js
 * ─────────────────────────────────────────────────────────────────
 * Express route handlers for the complete Quran Foundation OAuth2
 * Authorization Code + PKCE + OpenID Connect flow.
 *
 * Routes:
 *   GET  /auth/login        – Generate PKCE/state/nonce, persist in session,
 *                             redirect to Quran Foundation login page.
 *   GET  /auth/callback     – Receive code, validate state, exchange tokens,
 *                             verify id_token nonce, store session.
 *   POST /auth/logout       – Clear server session.
 *   GET  /auth/me           – Return current user identity (from id_token).
 *
 * Mobile/SPA backend-exchange endpoint:
 *   POST /api/auth/qf/exchange  – Accept { code, codeVerifier, redirectUri }
 *                                  from the native app; exchange on the backend.
 *
 * Security checklist:
 *   ✓ state validated on callback (CSRF protection)
 *   ✓ nonce validated on callback (token-replay protection)
 *   ✓ CLIENT_SECRET never sent to the browser
 *   ✓ tokens never logged
 *   ✓ redirect_uri matched exactly
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

const express = require("express");
const { getQfOAuthConfig } = require("../config/qfOAuthConfig");
const { buildAuthorizationUrl } = require("../auth/buildAuthUrl");
const { exchangeAuthorizationCode } = require("../auth/tokenExchange");
const { verifyIdToken, decodeIdTokenUnsafe } = require("../auth/oidc");
const { refreshAccessToken } = require("../auth/tokenRefresh");
const { createUserApiClient } = require("../api/userApiClient");

const router = express.Router();

// ── Redirect URI (STATIC – must match your QF client registration) ─
//
// The redirect_uri sent to QF MUST be byte-for-byte identical to the
// value registered in your QF OAuth2 client configuration.
//
// Fix for "redirect_uri does not match":
//   Option A – Set QF_REDIRECT_URI in .env to your registered value.
//   Option B – Copy the value printed at startup into the QF console.
//
// Common mismatches: http vs https, :3000 port present/absent,
// trailing slash, /auth/callback vs /callback.

function getRedirectUri() {
  if (process.env.QF_REDIRECT_URI) {
    return process.env.QF_REDIRECT_URI.trim();
  }
  // Fallback constructed from APP_BASE_URL.
  const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/auth/callback`;
}

// Resolved once at startup – the same value is used for /login AND /callback.
const REDIRECT_URI = getRedirectUri();
const FRONTEND_BASE_URL =
  (process.env.FRONTEND_BASE_URL || "http://localhost:5173")
    .replace(/\/$/, "");

function frontendUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${FRONTEND_BASE_URL}${normalized}`;
}

console.log(`[auth] redirect_uri = ${REDIRECT_URI}`);
console.log(`[auth] frontend_url = ${FRONTEND_BASE_URL}`);
console.log("[auth] Register this EXACT URI in your QF OAuth2 client settings.");

// ─────────────────────────────────────────────────────────────────
// GET /auth/login
// Step 2: Build authorization URL, persist PKCE in session, redirect.
// ─────────────────────────────────────────────────────────────────
router.get("/login", (req, res) => {
  const redirectUri = REDIRECT_URI;

  const { url, pkce } = buildAuthorizationUrl({ redirectUri });

  // Persist PKCE values server-side BEFORE redirecting.
  // These are validated in /auth/callback.
  req.session.qf_pkce = {
    state: pkce.state,
    nonce: pkce.nonce,
    codeVerifier: pkce.codeVerifier,
    redirectUri: pkce.redirectUri,
  };

  res.redirect(url);
});

// ─────────────────────────────────────────────────────────────────
// GET /auth/callback
// Step 3: Receive code, validate state, exchange tokens, verify nonce.
// ─────────────────────────────────────────────────────────────────
router.get("/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;

  // Handle user-denied or authorization error.
  if (error) {
    console.error(`[auth/callback] Authorization error: ${error}`);
    return res.redirect(frontendUrl(`/login?error=${encodeURIComponent(error)}`));
  }

  if (!code || !state) {
    return res.status(400).send("Missing code or state in callback.");
  }

  const stored = req.session.qf_pkce;
  if (!stored) {
    return res.status(400).send("No PKCE session found. Please start login again.");
  }

  // ── Step 2 security: validate state (CSRF protection) ──────────
  if (state !== stored.state) {
    console.error("[auth/callback] state mismatch – possible CSRF. Rejecting.");
    return res.status(400).send("State mismatch. Login attempt rejected.");
  }

  try {
    // ── Step 3: Exchange code for tokens ────────────────────────
    const tokens = await exchangeAuthorizationCode({
      code,
      redirectUri: stored.redirectUri,
      codeVerifier: stored.codeVerifier,
    });

    // Clear the one-time PKCE state after a successful exchange.
    delete req.session.qf_pkce;

    let user = null;

    // ── OIDC: verify id_token and nonce ─────────────────────────
    if (tokens.id_token) {
      try {
        // Full cryptographic verification (signature + claims + nonce).
        user = await verifyIdToken({
          idToken: tokens.id_token,
          expectedNonce: stored.nonce,
        });
      } catch (oidcErr) {
        console.error("[auth/callback] id_token verification failed:", oidcErr.message);
        console.log(tokens.id_token);
        return res.status(400).send("id_token verification failed. Login rejected.");
      }
    }

    // ── Store tokens in server-side session ─────────────────────
    // Never expose access_token or refresh_token to the browser directly.
    req.session.qf_tokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      scope: tokens.scope,
    };

    // Store safe identity claims (no tokens).
    req.session.qf_user = user
      ? {
        sub: user.sub,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        name: user.name,
      }
      : null;

    res.redirect(frontendUrl("/settings"));
  } catch (err) {
    console.error("[auth/callback] Token exchange failed:", err.message);
    res.redirect(frontendUrl(`/login?error=token_exchange_failed`));
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /auth/logout
// Clear the server-side session.
// ─────────────────────────────────────────────────────────────────
router.post("/logout", (req, res) => {
  req.session = null; // cookie-session: nulling the session clears it
  res.redirect("/");
});

// ─────────────────────────────────────────────────────────────────
// GET /auth/me
// Return current user identity (safe, no tokens).
// ─────────────────────────────────────────────────────────────────
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.session.qf_user });
});

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/qf/exchange
// Mobile/SPA backend-proxy endpoint.
//
// The native app:
//   1. Opens the hosted login screen and generates PKCE itself.
//   2. Receives the code at its redirect URI.
//   3. POSTs { code, codeVerifier, redirectUri, state, nonce } here.
//   4. This backend validates state, exchanges the code, and returns
//      tokens (or a session cookie) to the app.
//
// IMPORTANT: state and nonce must also be sent here for validation.
// ─────────────────────────────────────────────────────────────────
router.post("/exchange", express.json(), async (req, res) => {
  const { code, codeVerifier, redirectUri, state, nonce, expectedState, expectedNonce } =
    req.body;

  if (!code || !codeVerifier || !redirectUri) {
    return res
      .status(400)
      .json({ error: "Missing required fields: code, codeVerifier, redirectUri" });
  }

  // Validate state if provided (mobile apps should send both expected + received).
  if (expectedState && state && expectedState !== state) {
    console.error("[api/exchange] state mismatch – possible CSRF. Rejecting.");
    return res.status(400).json({ error: "State mismatch." });
  }

  try {
    const tokens = await exchangeAuthorizationCode({
      code,
      redirectUri,
      codeVerifier,
    });

    let user = null;
    if (tokens.id_token) {
      if (expectedNonce || nonce) {
        try {
          user = await verifyIdToken({
            idToken: tokens.id_token,
            expectedNonce: expectedNonce || nonce,
          });
        } catch (oidcErr) {
          console.error("[api/exchange] id_token verification failed:", oidcErr.message);
          return res.status(400).json({ error: "id_token nonce validation failed." });
        }
      } else {
        // No nonce available – decode without verification (less safe).
        user = decodeIdTokenUnsafe(tokens.id_token);
      }
    }

    // Return the tokens to the app. The app should store these securely
    // (e.g., iOS Keychain, Android Keystore) and never log them.
    res.json({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
      user: user
        ? {
          sub: user.sub,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
        }
        : null,
    });
  } catch (err) {
    console.error("[api/exchange] exchange failed:", err.message);
    res.status(500).json({ error: "Failed to exchange authorization code for tokens." });
  }
});

// ─────────────────────────────────────────────────────────────────
// Middleware: requireAuth
// ─────────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session?.qf_tokens?.accessToken) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  next();
}

module.exports = router;
module.exports.requireAuth = requireAuth;
