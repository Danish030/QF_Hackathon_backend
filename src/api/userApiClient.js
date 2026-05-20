/**
 * userApiClient.js
 * ─────────────────────────────────────────────────────────────────
 * Step 4 – Authenticated HTTP client for Quran Foundation User APIs.
 *
 * Injects the two required headers on every request:
 *   x-auth-token: <access_token>
 *   x-client-id:  <client_id>
 *
 * Auto-refresh: on a 401 response, refreshes the access token once
 * and retries. If the retry also fails, the error is surfaced.
 * No infinite loops.
 *
 * User API base: {apiBaseUrl}/auth/v1/...
 *
 * Available endpoints (non-exhaustive):
 *   GET  /auth/v1/bookmarks
 *   POST /auth/v1/bookmarks
 *   GET  /auth/v1/collections
 *   POST /auth/v1/collections
 *   GET  /auth/v1/reading-sessions
 *   GET  /auth/v1/preferences
 *   PUT  /auth/v1/preferences
 *
 * Scope requirements:
 *   bookmark         → bookmark endpoints
 *   collection       → collection endpoints
 *   reading_session  → reading session endpoints
 *   preference       → preference endpoints
 *   user             → user profile endpoint
 *
 * NEVER log access_token, refresh_token, id_token, or client_secret.
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

const axios = require("axios");
const { getQfOAuthConfig } = require("../config/qfOAuthConfig");
const { refreshAccessToken } = require("../auth/tokenRefresh");

/**
 * Creates an authenticated Quran Foundation User API client
 * bound to a specific user session.
 *
 * @param {{
 *   getAccessToken: () => string;
 *   getRefreshToken: () => string | undefined;
 *   onTokensRefreshed?: (tokens: { access_token: string; refresh_token?: string; expires_in: number }) => void;
 *   sessionKey?: string;
 * }} options
 */
function createUserApiClient({
  getAccessToken,
  getRefreshToken,
  onTokensRefreshed,
  sessionKey = "default",
}) {
  const { apiBaseUrl, clientId } = getQfOAuthConfig();

  /**
   * Makes an authenticated GET request to a User API path.
   *
   * @param {string} path  e.g. "/auth/v1/bookmarks"
   * @param {object} [params]  query params
   * @returns {Promise<unknown>}
   */
  async function get(path, params = {}) {
    return _request("GET", path, { params });
  }

  /**
   * Makes an authenticated POST request to a User API path.
   *
   * @param {string} path
   * @param {object} [data]  request body
   * @returns {Promise<unknown>}
   */
  async function post(path, data = {}) {
    return _request("POST", path, { data });
  }

  /**
   * Makes an authenticated PUT request to a User API path.
   *
   * @param {string} path
   * @param {object} [data]  request body
   * @returns {Promise<unknown>}
   */
  async function put(path, data = {}) {
    return _request("PUT", path, { data });
  }

  /**
   * Makes an authenticated DELETE request to a User API path.
   *
   * @param {string} path
   * @returns {Promise<unknown>}
   */
  async function del(path) {
    return _request("DELETE", path, {});
  }

  // ── Internals ───────────────────────────────────────────────────

  async function _request(method, path, options, isRetry = false) {
    const url = `${apiBaseUrl}${path}`;
    const accessToken = getAccessToken();

    try {
      const res = await axios.request({
        method,
        url,
        ...options,
        headers: {
          "x-auth-token": accessToken,
          "x-client-id": clientId,
          ...(options.headers || {}),
        },
      });
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;

        // 401: try to refresh once then retry.
        if (status === 401 && !isRetry) {
          const refreshToken = getRefreshToken?.();
          if (refreshToken) {
            try {
              const newTokens = await refreshAccessToken({
                refreshToken,
                sessionKey,
              });
              // Notify the caller so they can persist the new tokens.
              onTokensRefreshed?.({
                access_token: newTokens.access_token,
                refresh_token: newTokens.refresh_token,
                expires_in: newTokens.expires_in,
              });
              return _request(method, path, options, true /* isRetry */);
            } catch {
              throw new Error(
                `User API request failed: session expired and token refresh failed. Re-authentication required.`
              );
            }
          }
          throw new Error(
            `User API request failed: 401 Unauthorized. Re-authentication required.`
          );
        }

        // 403: scope not granted.
        if (status === 403) {
          throw new Error(
            `User API request failed: 403 Forbidden. ` +
              `The access token may be missing the required scope for ${path}.`
          );
        }

        throw new Error(
          `User API request failed: ${status} ${err.response?.data?.error || "unknown_error"}`
        );
      }
      throw err;
    }
  }

  return { get, post, put, del };
}

// ── Convenience – standalone bookmark / collection / preferences helpers ──

/**
 * Fetches the user's bookmarks.
 * Requires the "bookmark" scope.
 */
async function getBookmarks({ accessToken, first = 10, last_cursor } = {}) {
  const { apiBaseUrl, clientId } = getQfOAuthConfig();
  const params = { first };
  if (last_cursor) params.last_cursor = last_cursor;

  const res = await axios.get(`${apiBaseUrl}/auth/v1/bookmarks`, {
    headers: { "x-auth-token": accessToken, "x-client-id": clientId },
    params,
  });
  return res.data;
}

/**
 * Fetches the user's collections.
 * Requires the "collection" scope.
 */
async function getCollections({ accessToken, first = 10 } = {}) {
  const { apiBaseUrl, clientId } = getQfOAuthConfig();

  const res = await axios.get(`${apiBaseUrl}/auth/v1/collections`, {
    headers: { "x-auth-token": accessToken, "x-client-id": clientId },
    params: { first },
  });
  return res.data;
}

/**
 * Fetches the user's reading preferences.
 * Requires the "preference" scope.
 */
async function getPreferences({ accessToken } = {}) {
  const { apiBaseUrl, clientId } = getQfOAuthConfig();

  const res = await axios.get(`${apiBaseUrl}/auth/v1/preferences`, {
    headers: { "x-auth-token": accessToken, "x-client-id": clientId },
  });
  return res.data;
}

module.exports = {
  createUserApiClient,
  getBookmarks,
  getCollections,
  getPreferences,
};
