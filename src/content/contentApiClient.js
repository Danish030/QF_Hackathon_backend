/**
 * contentApiClient.js
 * ─────────────────────────────────────────────────────────────────
 * Authenticated HTTP client for Quran Foundation Content APIs v4.
 *
 * Auth model: Client Credentials (server-only, no user login needed).
 * Headers required on every request:
 *   x-auth-token: <content access_token>
 *   x-client-id:  <your client_id>
 *
 * Base path: {apiBaseUrl}/content/api/v4/
 *
 * 401 handling: clear cached token → re-fetch → retry ONCE.
 *               No loops.
 *
 * NEVER log access_token or client_secret.
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

const axios = require("axios");
const { getQfOAuthConfig } = require("../config/qfOAuthConfig");
const { getContentToken, clearContentToken } = require("./contentTokenCache");

const CONTENT_BASE = "/content/api/v4";

/**
 * Makes an authenticated GET request to the Content API.
 *
 * @param {string} path  e.g. "/chapters" or "/verses/by_chapter/1"
 * @param {object} [params]  query parameters
 * @returns {Promise<unknown>}
 */
async function contentGet(path, params = {}) {
  return _request(path, params, false);
}

// ── Internal ──────────────────────────────────────────────────────

async function _request(path, params, isRetry) {
  const { apiBaseUrl, clientId } = getQfOAuthConfig();
  const token = await getContentToken();
  const url = `${apiBaseUrl}${CONTENT_BASE}${path}`;

  try {
    const res = await axios.get(url, {
      params,
      headers: {
        "x-auth-token": token,
        "x-client-id": clientId,
      },
    });
    return res.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;

      // 401: clear cached token, re-fetch, retry once
      if (status === 401 && !isRetry) {
        console.warn(`[contentApi] 401 on ${path} – clearing token and retrying once`);
        clearContentToken();
        return _request(path, params, true);
      }

      const errType = err.response?.data?.type || "unknown";
      const errMsg = err.response?.data?.message || err.message;
      throw new Error(
        `Content API error [${status} ${errType}]: ${errMsg}`
      );
    }
    throw err;
  }
}

module.exports = { contentGet };
