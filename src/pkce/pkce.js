/**
 * pkce.js
 * ─────────────────────────────────────────────────────────────────
 * Step 2 (part A) – PKCE (Proof Key for Code Exchange) helpers.
 *
 * Generates a cryptographically random code_verifier and derives the
 * corresponding code_challenge = BASE64URL(SHA-256(code_verifier)).
 *
 * The code_verifier MUST be persisted (in a server session or secure
 * httpOnly cookie) BEFORE redirecting to /oauth2/auth, and then sent
 * to the token endpoint as code_verifier.
 *
 * Do NOT log code_verifier – treat it as a short-lived secret.
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

const crypto = require("crypto");

/**
 * Encodes a Buffer as a URL-safe Base64 string (no padding).
 * @param {Buffer} buf
 * @returns {string}
 */
function base64url(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Generates a cryptographically random hex string.
 * @param {number} [bytes=16]
 * @returns {string}
 */
function randomString(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Generates a PKCE code_verifier + code_challenge pair.
 *
 * @returns {{ codeVerifier: string; codeChallenge: string }}
 */
function generatePkcePair() {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const hash = crypto.createHash("sha256").update(codeVerifier).digest();
  const codeChallenge = base64url(hash);
  return { codeVerifier, codeChallenge };
}

module.exports = { generatePkcePair, randomString };
