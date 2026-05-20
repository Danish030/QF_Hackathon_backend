/**
 * buildAuthUrl.js
 * ─────────────────────────────────────────────────────────────────
 * Step 2 (part B) – Build the Quran Foundation /oauth2/auth URL.
 *
 * Generates PKCE, OAuth2 state, and OIDC nonce, then assembles the
 * authorization redirect URL.
 *
 * Caller MUST persist { state, nonce, codeVerifier, redirectUri } in
 * a server-side session BEFORE sending the redirect to the browser.
 * On callback, state and nonce are validated against these stored values.
 *
 * Authorization endpoint: {authBaseUrl}/oauth2/auth
 * Required params: response_type, client_id, redirect_uri, scope,
 *                  state, nonce, code_challenge, code_challenge_method=S256
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

const { getQfOAuthConfig } = require("../config/qfOAuthConfig");
const { generatePkcePair, randomString } = require("../pkce/pkce");

/**
 * Builds the Quran Foundation authorization URL and returns the
 * PKCE / security values that must be stored server-side before redirect.
 *
 * @param {{
 *   redirectUri: string;
 *   scope?: string;
 * }} options
 *
 * @returns {{
 *   url: string;
 *   pkce: { state: string; nonce: string; codeVerifier: string; redirectUri: string };
 * }}
 */
function buildAuthorizationUrl({
  redirectUri,
  scope = "openid offline_access user collection bookmark reading_session preference",
}) {
  const { authBaseUrl, clientId } = getQfOAuthConfig();
  const { codeVerifier, codeChallenge } = generatePkcePair();

  // state: random value validated on callback to prevent CSRF.
  const state = randomString(16);

  // nonce: random value embedded in the id_token and verified on callback
  // to prevent token-replay attacks. Required when requesting "openid".
  const nonce = randomString(16);

  const params = new URLSearchParams();
  params.set("response_type", "code");
  params.set("client_id", clientId);
  params.set("redirect_uri", redirectUri);
  params.set("scope", scope);
  params.set("state", state);
  params.set("nonce", nonce);
  params.set("code_challenge", codeChallenge);
  params.set("code_challenge_method", "S256");

  const url = `${authBaseUrl}/oauth2/auth?${params.toString()}`;

  return {
    url,
    // Store these server-side (session / httpOnly cookie) before redirect.
    // Never return codeVerifier to the browser directly.
    pkce: { state, nonce, codeVerifier, redirectUri },
  };
}

module.exports = { buildAuthorizationUrl };
