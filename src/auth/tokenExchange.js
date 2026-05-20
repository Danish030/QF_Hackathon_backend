/**
 * tokenExchange.js
 * ─────────────────────────────────────────────────────────────────
 * Step 3 – Exchange the authorization code for tokens.
 *
 * Two variants:
 *   exchangeCodeConfidential  – default for Request Access clients.
 *     Keeps CLIENT_SECRET on the server and authenticates the request
 *     via HTTP Basic Auth. Returns { access_token, refresh_token,
 *     id_token, expires_in, scope, token_type }.
 *
 *   exchangeCodePublic        – only when Quran Foundation explicitly
 *     confirms the client is public. Sends client_id in the body with
 *     PKCE only; no client_secret.
 *
 * Token endpoint: {authBaseUrl}/oauth2/token
 * Method: POST
 * Content-Type: application/x-www-form-urlencoded
 *
 * NEVER log: authorization code, code_verifier, access_token,
 *            refresh_token, id_token, or client_secret.
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

const axios = require("axios");
const { getQfOAuthConfig } = require("../config/qfOAuthConfig");

/**
 * Confidential-client code exchange (default).
 * Authenticates via HTTP Basic (client_id:client_secret).
 * Always run this on the backend; never expose client_secret.
 *
 * @param {{ code: string; redirectUri: string; codeVerifier: string }} params
 * @returns {Promise<QFTokenResponse>}
 */
async function exchangeCodeConfidential({ code, redirectUri, codeVerifier }) {
  const { authBaseUrl, clientId, clientSecret } = getQfOAuthConfig();

  if (!clientSecret) {
    throw new Error(
      "Client secret is required for confidential client token exchange. " +
        "If your client is public, use exchangeCodePublic() instead."
    );
  }

  const body = new URLSearchParams();
  body.append("grant_type", "authorization_code");
  body.append("code", code);
  body.append("redirect_uri", redirectUri);
  body.append("code_verifier", codeVerifier);

  try {
    const res = await axios.post(
      `${authBaseUrl}/oauth2/token`,
      body.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        // HTTP Basic Auth – keeps client_secret out of the request body
        auth: { username: clientId, password: clientSecret },
      }
    );
    return res.data;
  } catch (err) {
    throw _tokenError("Failed to exchange authorization code for tokens", err);
  }
}

/**
 * Public-client code exchange.
 * Only use when Quran Foundation explicitly confirms the client is public.
 * Sends client_id in the body; no client_secret.
 *
 * @param {{ code: string; redirectUri: string; codeVerifier: string }} params
 * @returns {Promise<QFTokenResponse>}
 */
async function exchangeCodePublic({ code, redirectUri, codeVerifier }) {
  const { authBaseUrl, clientId } = getQfOAuthConfig();

  const body = new URLSearchParams();
  body.append("grant_type", "authorization_code");
  body.append("client_id", clientId);
  body.append("code", code);
  body.append("redirect_uri", redirectUri);
  body.append("code_verifier", codeVerifier);

  try {
    const res = await axios.post(
      `${authBaseUrl}/oauth2/token`,
      body.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    return res.data;
  } catch (err) {
    throw _tokenError("Failed to exchange authorization code for tokens", err);
  }
}

/**
 * Convenience wrapper: routes to the correct variant based on whether
 * a CLIENT_SECRET is configured (isConfidential).
 *
 * For mobile/SPA apps using the backend-proxy pattern, the app sends
 * { code, codeVerifier, redirectUri } to your /api/auth/qf/exchange
 * endpoint, which calls this function.
 *
 * @param {{ code: string; redirectUri: string; codeVerifier: string }} params
 * @returns {Promise<QFTokenResponse>}
 */
async function exchangeAuthorizationCode({ code, redirectUri, codeVerifier }) {
  const { isConfidential } = getQfOAuthConfig();
  if (isConfidential) {
    return exchangeCodeConfidential({ code, redirectUri, codeVerifier });
  }
  return exchangeCodePublic({ code, redirectUri, codeVerifier });
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Wraps an Axios error into a safe, non-leaking Error.
 * @param {string} message
 * @param {unknown} err
 */
function _tokenError(message, err) {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const oauthError = err.response?.data?.error || "unknown_error";
    // Sanitize: log only status + oauth error code, never tokens or secrets.
    return new Error(`${message} [${status} ${oauthError}]`);
  }
  return new Error(message);
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

module.exports = {
  exchangeAuthorizationCode,
  exchangeCodeConfidential,
  exchangeCodePublic,
};
