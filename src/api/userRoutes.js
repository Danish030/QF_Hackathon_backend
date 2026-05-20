/**
 * userRoutes.js
 * ─────────────────────────────────────────────────────────────────
 * Step 4 demo – Protected User API routes.
 *
 * Uses createUserApiClient() which automatically:
 *   • Injects x-auth-token + x-client-id headers
 *   • Refreshes the access token on 401 (once per request)
 *   • Updates the session with the new tokens
 *
 * Routes:
 *   GET /api/user/bookmarks         (scope: bookmark)
 *   GET /api/user/collections       (scope: collection)
 *   GET /api/user/preferences       (scope: preference)
 *   GET /api/user/reading-sessions  (scope: reading_session)
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

const express = require("express");
const { createUserApiClient } = require("../api/userApiClient");
const { requireAuth } = require("../auth/authRoutes");

const router = express.Router();

// All user routes require authentication.
router.use(requireAuth);

// Helper: build a per-request client bound to the session's tokens.
function getClient(req) {
  return createUserApiClient({
    getAccessToken: () => req.session.qf_tokens.accessToken,
    getRefreshToken: () => req.session.qf_tokens.refreshToken,
    onTokensRefreshed: (newTokens) => {
      // Update the session so subsequent requests use the refreshed token.
      req.session.qf_tokens = {
        ...req.session.qf_tokens,
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token ?? req.session.qf_tokens.refreshToken,
        expiresAt: Date.now() + newTokens.expires_in * 1000,
      };
    },
    sessionKey: req.session.qf_user?.sub || "default",
  });
}

// GET /api/user/bookmarks
router.get("/bookmarks", async (req, res) => {
  try {
    const data = await getClient(req).get("/auth/v1/bookmarks", {
      first: Number(req.query.first) || 20,
    });
    res.json(data);
    console.log(data);
    
  } catch (err) {
    handleApiError(res, err);
  }
});

// GET /api/user/collections
router.get("/collections", async (req, res) => {
  try {
    const data = await getClient(req).get("/auth/v1/collections", {
      first: Number(req.query.first) || 20,
    });
    res.json(data);
  } catch (err) {
    handleApiError(res, err);
  }
});

// GET /api/user/preferences
router.get("/preferences", async (req, res) => {
  try {
    const data = await getClient(req).get("/auth/v1/preferences");
    res.json(data);
  } catch (err) {
    handleApiError(res, err);
  }
});

// GET /api/user/reading-sessions
router.get("/reading-sessions", async (req, res) => {
  try {
    const data = await getClient(req).get("/auth/v1/reading-sessions");
    res.json(data);
  } catch (err) {
    handleApiError(res, err);
  }
});

function handleApiError(res, err) {
  if (err.message.includes("Re-authentication required")) {
    return res.status(401).json({ error: err.message });
  }
  if (err.message.includes("403")) {
    return res.status(403).json({
      error: err.message,
      hint: "The access token may be missing the required scope. Re-login with the correct scopes.",
    });
  }
  res.status(500).json({ error: err.message });
}

module.exports = router;
