/**
 * qfOAuthConfig.js
 * ─────────────────────────────────────────────────────────────────
 * Step 1 – Quran Foundation OAuth2 client configuration.
 *
 * Reads QF_CLIENT_ID, QF_CLIENT_SECRET, QF_ENV from environment.
 * Maps the environment to the correct auth + API base URLs.
 *
 * CLIENT TYPE:
 *   - Confidential (default for Request Access clients): CLIENT_SECRET
 *     is present and all token exchange / refresh happens on this server.
 *   - Public: CLIENT_SECRET is absent AND Quran Foundation has explicitly
 *     confirmed the client is public. In that case, the app exchanges the
 *     code directly using PKCE only.
 *
 * NEVER log or expose QF_CLIENT_SECRET.
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

/** @type {{ authBaseUrl: string; apiBaseUrl: string }} */
const ENV_URLS = {
  prelive: {
    authBaseUrl: "https://prelive-oauth2.quran.foundation",
    apiBaseUrl: "https://apis-prelive.quran.foundation",
  },
  production: {
    authBaseUrl: "https://oauth2.quran.foundation",
    apiBaseUrl: "https://apis.quran.foundation",
  },
};

/**
 * Returns the resolved Quran Foundation OAuth2 configuration.
 *
 * @returns {{
 *   env: "prelive" | "production",
 *   clientId: string,
 *   clientSecret: string | undefined,
 *   isConfidential: boolean,
 *   authBaseUrl: string,
 *   apiBaseUrl: string,
 * }}
 */
function getQfOAuthConfig() {
  const clientId = process.env.QF_CLIENT_ID;

  if (!clientId) {
    throw new Error(
      "Missing Quran Foundation API credentials. Request access: https://api-docs.quran.foundation/request-access"
    );
  }

  // Accepted values: "prelive" | "production". Default: "prelive".
  const rawEnv = (process.env.QF_ENV || "prelive").toLowerCase();
  const env = rawEnv === "production" ? "production" : "prelive";

  const urls = ENV_URLS[env];

  // clientSecret may be undefined for confirmed public clients.
  const clientSecret = process.env.QF_CLIENT_SECRET || undefined;

  // isConfidential: true when a client_secret exists (the default for
  // Request Access clients). Set to false ONLY when Quran Foundation
  // explicitly confirms the client is public.
  const isConfidential = Boolean(clientSecret);

  return {
    env,
    clientId,
    clientSecret, // undefined for public clients
    isConfidential,
    authBaseUrl: urls.authBaseUrl,
    apiBaseUrl: urls.apiBaseUrl,
  };
}

module.exports = { getQfOAuthConfig };
