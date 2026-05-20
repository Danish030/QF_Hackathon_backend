/**
 * contentTokenCache.js
 * ─────────────────────────────────────────────────────────────────
 * Content API authentication – OAuth2 Client Credentials flow.
 *
 * KEY DIFFERENCES from User APIs (Authorization Code):
 *   • Uses grant_type=client_credentials + scope=content
 *   • No user login, no redirect, no refresh_token
 *   • Token is server-scoped (not per-user), valid 3600 s
 *   • Re-request a new token ~30 s before expiry
 *   • On 401 from Content API: clear + re-request + retry ONCE
 *
 * Token endpoint: {authBaseUrl}/oauth2/token
 * Method: POST with HTTP Basic Auth (client_id:client_secret)
 * Body:   grant_type=client_credentials&scope=content
 *
 * NEVER log access_token or client_secret.
 * NEVER call this from browser or mobile code.
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

const axios = require("axios");
const { getQfOAuthConfig } = require("../config/qfOAuthConfig");

// ── In-memory token store ─────────────────────────────────────────
let _cachedToken = null;
let _expiresAt = 0; // epoch ms
let _inflight = null; // shared Promise while a token fetch is in-flight

/**
 * Returns a valid Content API access token.
 * Fetches a new one if the cache is empty or expiring in <30 s.
 * Only one HTTP request is made at a time (stampede prevention).
 *
 * @returns {Promise<string>} access_token
 */
async function getContentToken() {
  // Fast path: cached token still valid
  if (_cachedToken && Date.now() < _expiresAt - 30_000) {
    return _cachedToken;
  }

  // Slow path: need a new token – share the in-flight promise
  if (!_inflight) {
    _inflight = _fetchToken().finally(() => {
      _inflight = null;
    });
  }

  return _inflight;
}

/**
 * Clears the cached token.
 * Call this on a 401 response before re-requesting.
 */
function clearContentToken() {
  _cachedToken = null;
  _expiresAt = 0;
}

// ── Internal ──────────────────────────────────────────────────────

async function _fetchToken() {
  const { authBaseUrl, clientId, clientSecret } = getQfOAuthConfig();

  if (!clientSecret) {
    throw new Error(
      "QF_CLIENT_SECRET is required for Content API (client_credentials). " +
        "Set it in your .env file (server-side only)."
    );
  }

  const body = new URLSearchParams();
  body.append("grant_type", "client_credentials");
  body.append("scope", "content");

  try {
    const res = await axios.post(
      `${authBaseUrl}/oauth2/token`,
      body.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        // HTTP Basic Auth – keeps client_secret out of the body
        auth: { username: clientId, password: clientSecret },
      }
    );

    const { access_token, expires_in } = res.data;
    _cachedToken = access_token;
    // expires_in is in seconds; subtract 30 s as a safety buffer
    _expiresAt = Date.now() + expires_in * 1000;

    console.log(
      `[contentToken] New token fetched, expires in ${expires_in}s`
    );
    
    return _cachedToken;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const oauthError = err.response?.data?.error || "unknown";
      throw new Error(
        `Content API token request failed [${status} ${oauthError}]`
      );
    }
    throw err;
  }
}

module.exports = { getContentToken, clearContentToken };
