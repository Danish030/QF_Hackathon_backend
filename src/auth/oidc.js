/**
 * oidc.js
 * ─────────────────────────────────────────────────────────────────
 * OpenID Connect – id_token verification and nonce validation.
 *
 * Fetches the OIDC Discovery document to resolve the JWKS URI and
 * issuer, then verifies the id_token signature and standard claims
 * (iss, aud, exp, iat). Finally validates the nonce claim to prevent
 * token-replay attacks.
 *
 * Discovery endpoints:
 *   Production:    https://oauth2.quran.foundation/.well-known/openid-configuration
 *   Pre-Production: https://prelive-oauth2.quran.foundation/.well-known/openid-configuration
 *
 * Key id_token claims:
 *   sub         – stable unique user identifier (use as your DB foreign key)
 *   email       – user email (requires "email" scope)
 *   first_name  – given name
 *   last_name   – family name
 *   nonce       – must match the value you generated in Step 2
 *
 * NEVER use id_token as an API access token.
 * NEVER skip nonce validation when you rely on id_token for identity.
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

const { createRemoteJWKSet, jwtVerify } = require("jose");
const { getQfOAuthConfig } = require("../config/qfOAuthConfig");

// Cache JWKS sets per auth base URL to avoid refetching on every request.
const _jwksCache = new Map();

/**
 * Returns (and caches) a RemoteJWKSet for the current environment.
 */
function _getJWKS(authBaseUrl) {
  if (!_jwksCache.has(authBaseUrl)) {
    const jwksUri = new URL(
      `${authBaseUrl}/.well-known/jwks.json`
    );
    _jwksCache.set(authBaseUrl, createRemoteJWKSet(jwksUri));
  }
  return _jwksCache.get(authBaseUrl);
}

/**
 * Fully verifies an id_token:
 *   1. Fetches public keys from the JWKS endpoint.
 *   2. Verifies the JWT signature.
 *   3. Validates iss, aud, exp, iat.
 *   4. Validates the nonce claim (required when relying on id_token).
 *
 * @param {{ idToken: string; expectedNonce: string }} params
 * @returns {Promise<QFIdTokenClaims>}
 *
 * @throws If any validation step fails.
 */
async function verifyIdToken({ idToken, expectedNonce }) {
  const { authBaseUrl, clientId } = getQfOAuthConfig();
  const JWKS = _getJWKS(authBaseUrl);

  // Verify signature + standard claims (iss, aud, exp, iat).
  // Accept issuer with or without a trailing slash because some
  // providers canonicalize it differently in the id_token claim.
  const acceptedIssuers = [authBaseUrl, `${authBaseUrl}/`];
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: acceptedIssuers,
    audience: clientId,
  });

  // Validate nonce to prevent token-replay attacks.
  if (!payload.nonce) {
    throw new Error("id_token is missing the nonce claim.");
  }
  if (payload.nonce !== expectedNonce) {
    throw new Error(
      "id_token nonce mismatch – possible token replay attack. Rejecting."
    );
  }

  return payload;
}

/**
 * Decodes an id_token WITHOUT verifying the signature.
 * Useful for reading claims in trusted server contexts where the token
 * was just obtained directly from the token endpoint.
 *
 * ⚠ Do NOT use this for tokens received from untrusted sources.
 *   Always prefer verifyIdToken() for production identity assertions.
 *
 * @param {string} idToken
 * @returns {QFIdTokenClaims | null}
 */
function decodeIdTokenUnsafe(idToken) {
  try {
    const [, payloadB64] = idToken.split(".");
    const json = Buffer.from(payloadB64, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * @typedef {{
 *   sub: string;
 *   email?: string;
 *   first_name?: string;
 *   last_name?: string;
 *   name?: string;
 *   nonce: string;
 *   iss: string;
 *   aud: string | string[];
 *   exp: number;
 *   iat: number;
 *   auth_time?: number;
 *   sid?: string;
 * }} QFIdTokenClaims
 */

module.exports = { verifyIdToken, decodeIdTokenUnsafe };
