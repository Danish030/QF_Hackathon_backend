# Quran Foundation API Proxy Server: Reverse Engineering

This document reverse-engineers the API request flow and authorization mechanisms in the Quran Foundation OAuth2 + OIDC Express server project.

## 1. Overall Architecture
- **Client** → Makes HTTP requests to `/api/user/*` or `/api/content/*`
- **Server** → Proxies requests to Quran Foundation APIs, injecting auth headers
- **Secrets**: Loaded from .env (QF_CLIENT_ID, QF_CLIENT_SECRET, etc.) – never logged or exposed
- **Sessions**: User tokens stored server-side (httpOnly cookies) for security

## 2. Content APIs (No User Login Required)
These are public endpoints like chapters, verses, audio. Auth uses **client credentials** (server-side OAuth2 flow).

### Request Flow:
1. **Client Request**: `GET http://localhost:3000/api/content/chapters`
2. **Server Proxy**: Routes to contentRoutes.js → calls contentApi.js function
3. **Auth Injection**: contentApiClient.js adds headers:
   - `x-auth-token`: Server-side access token
   - `x-client-id`: Client ID
4. **API Call**: Forwards to `https://apis.quran.foundation/content/api/v4/chapters`
5. **Response**: Returns JSON data to client

### Key Code Chunks:
- **contentTokenCache.js** (lines 40-80): Fetches/caches server token
  ```javascript
  async function _fetchToken() {
    const { authBaseUrl, clientId, clientSecret } = getQfOAuthConfig();
    const body = new URLSearchParams();
    body.append("grant_type", "client_credentials");
    body.append("scope", "content");
    
    const res = await axios.post(`${authBaseUrl}/oauth2/token`, body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      auth: { username: clientId, password: clientSecret },  // HTTP Basic Auth
    });
    
    _cachedToken = res.data.access_token;
    _expiresAt = Date.now() + res.data.expires_in * 1000;
  }
  ```
  - Uses `client_credentials` grant type
  - Token cached in memory, refreshed before expiry
  - On 401 error: Clears cache → re-fetches → retries once

- **contentApiClient.js** (lines 25-45): Makes authenticated requests
  ```javascript
  async function _request(path, params, isRetry) {
    const { apiBaseUrl, clientId } = getQfOAuthConfig();
    const token = await getContentToken();  // From cache
    const url = `${apiBaseUrl}${CONTENT_BASE}${path}`;
    
    const res = await axios.get(url, {
      params,
      headers: {
        "x-auth-token": token,  // Injected token
        "x-client-id": clientId,
      },
    });
  }
  ```

## 3. User APIs (Requires User Login)
These are protected endpoints like bookmarks, reading sessions. Auth uses **user access tokens** from OAuth2 login.

### Request Flow:
1. **User Login**: OAuth2 PKCE flow → tokens stored in session
2. **Client Request**: `GET http://localhost:3000/api/user/bookmarks`
3. **Server Proxy**: Routes to userRoutes.js → calls userApiClient.js
4. **Auth Injection**: Adds headers from session:
   - `x-auth-token`: User's access token
   - `x-client-id`: Client ID
5. **API Call**: Forwards to `https://apis.quran.foundation/auth/v1/bookmarks`
6. **Response**: Returns JSON data to client
7. **Auto-Refresh**: On 401, refreshes token using refresh_token and retries

### Key Code Chunks:
- **userApiClient.js** (lines 50-80): Creates per-session client
  ```javascript
  function createUserApiClient({ getAccessToken, getRefreshToken, onTokensRefreshed, sessionKey }) {
    return {
      async get(path, params) {
        const { apiBaseUrl, clientId } = getQfOAuthConfig();
        const token = getAccessToken();  // From session
        const url = `${apiBaseUrl}/auth/v1${path}`;
        
        try {
          return await axios.get(url, {
            params,
            headers: {
              "x-auth-token": token,
              "x-client-id": clientId,
            },
          });
        } catch (err) {
          if (err.response?.status === 401) {
            // Refresh and retry
            const newTokens = await refreshAccessToken({ refreshToken: getRefreshToken(), sessionKey });
            onTokensRefreshed(newTokens);
            // Retry with new token
          }
        }
      }
    };
  }
  ```

- **tokenRefresh.js** (lines 50-90): Refreshes user tokens
  ```javascript
  async function _doRefresh(refreshToken) {
    const { authBaseUrl, clientId, clientSecret, isConfidential } = getQfOAuthConfig();
    const body = new URLSearchParams();
    body.append("grant_type", "refresh_token");
    body.append("refresh_token", refreshToken);
    
    if (isConfidential) {
      const res = await axios.post(`${authBaseUrl}/oauth2/token`, body.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        auth: { username: clientId, password: clientSecret },  // Basic Auth for confidential
      });
      return res.data;
    } else {
      // Public client: client_id in body, no secret
      body.append("client_id", clientId);
      // ...
    }
  }
  ```
  - Uses `refresh_token` grant type
  - Concurrency guard prevents multiple refreshes for same session

## 4. Security Notes
- **Secrets**: `QF_CLIENT_SECRET` only used server-side, never sent to browser
- **Tokens**: User tokens in httpOnly sessions; content tokens cached server-side
- **Errors**: 401s trigger retry logic, but no infinite loops
- **Logging**: Tokens/secrets never logged

This setup ensures secure proxying without exposing credentials to the client. Content APIs work without login, while user APIs require authenticated sessions.