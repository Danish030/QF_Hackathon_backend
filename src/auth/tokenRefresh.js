/**
 * tokenRefresh.js
 * ─────────────────────────────────────────────────────────────────
 * Step 5 – Refresh the access token using a refresh_token.
 *
 * Requires the "offline_access" scope to have been granted in Step 2.
 * Access tokens expire after 1 hour (3,600 s).
 *
 * Client-type rules mirror Step 3:
 *   - Confidential (default): refresh on the backend via HTTP Basic Auth.
 *   - Public (only if QF confirmed): include client_id in body; no secret.
 *
 * Concurrency guard: refreshInProgress prevents stampedes – if multiple
 * callers try to refresh the same session token simultaneously, only one
 * request is fired; the rest await its result.
 *
 * NEVER log: refresh_token, access_token, id_token, or client_secret.
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

const axios = require("axios");
const { getQfOAuthConfig } = require("../config/qfOAuthConfig");

// Per-session in-flight refresh promise to prevent stampedes.
// Key: a stable per-session string (e.g., session ID). Value: Promise.
const _inflight = new Map();

/**
 * Refreshes the access token.
 * For confidential clients (default), this MUST run on the backend server.
 *
 * @param {{ refreshToken: string; sessionKey?: string }} params
 *   sessionKey is optional but recommended: prevents concurrent refreshes
 *   for the same user session.
 *
 * @returns {Promise<QFTokenResponse>}
 */
async function refreshAccessToken({ refreshToken, sessionKey = "default" }) {
  // If a refresh is already in flight for this session, wait for it.
  if (_inflight.has(sessionKey)) {
    return _inflight.get(sessionKey);
  }

  const promise = _doRefresh(refreshToken).finally(() => {
    _inflight.delete(sessionKey);
  });

  _inflight.set(sessionKey, promise);
  return promise;
}

async function _doRefresh(refreshToken) {
  const { authBaseUrl, clientId, clientSecret, isConfidential } =
    getQfOAuthConfig();

  const body = new URLSearchParams();
  body.append("grant_type", "refresh_token");
  body.append("refresh_token", refreshToken);

  try {
    let res;

    if (isConfidential) {
      // Confidential: authenticate via HTTP Basic, keep secret on server.
      res = await axios.post(
        `${authBaseUrl}/oauth2/token`,
        body.toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          auth: { username: clientId, password: clientSecret },
        }
      );
    } else {
      // Public: only if Quran Foundation explicitly confirmed the client is public.
      body.append("client_id", clientId);
      res = await axios.post(
        `${authBaseUrl}/oauth2/token`,
        body.toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
    }

    return res.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const oauthError = err.response?.data?.error || "unknown_error";
      throw new Error(`Failed to refresh access token [${status} ${oauthError}]`);
    }
    throw new Error("Failed to refresh access token");
  }
}

/**
 * @typedef {{
 *   access_token: string;
 *   token_type: string;
 *   expires_in: number;
 *   refresh_token?: string;
 *   id_token?: string;
 *   scope: string;
 * }} QFTokenResponse
 */

module.exports = { refreshAccessToken };
