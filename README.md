# Quran Foundation APIs Integration – User APIs (OAuth2 + OIDC) + Content API (Client Credentials)

Authorization Code with PKCE + OpenID Connect for confidential clients (User APIs) and Client Credentials flow for server-side access (Content API).  
Built from the [official QF documentation](https://api-docs.quran.foundation/docs/tutorials/oidc/user-apis-quickstart) and [Content API docs](https://api-docs.quran.foundation/docs/category/content-apis).

---

## Architecture

### User APIs (OAuth2 + OIDC)
```
┌─────────────────────────────────────────────────────────────────────┐
│                        BROWSER / MOBILE APP                         │
│                                                                     │
│  1. Open /auth/login                                                │
│  2. ← Redirected to QF hosted login page                           │
│  3. User authenticates on QF servers                               │
│  4. Receive ?code=…&state=… at /auth/callback                      │
│                                                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ code + state (via redirect)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND (this app)                          │
│                                                                     │
│  ✓ Validate state (CSRF protection)                                 │
│  ✓ Exchange code + code_verifier → access_token, refresh_token,    │
│    id_token  (using CLIENT_SECRET via HTTP Basic)                  │
│  ✓ Verify id_token signature + nonce (OIDC replay protection)      │
│  ✓ Store tokens in httpOnly session cookie (never to browser JS)   │
│  ✓ Refresh tokens server-side on 401                               │
│                                                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ x-auth-token + x-client-id headers
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│               QURAN FOUNDATION USER APIs                            │
│                                                                     │
│  GET  /auth/v1/bookmarks          (scope: bookmark)                │
│  GET  /auth/v1/collections        (scope: collection)              │
│  GET  /auth/v1/preferences        (scope: preference)              │
│  GET  /auth/v1/reading-sessions   (scope: reading_session)         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Content API (Client Credentials)
```
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND (this app)                          │
│                                                                     │
│  ✓ Fetch client credentials token (server-side)                    │
│  ✓ Cache and refresh tokens automatically                          │
│                                                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ x-auth-token + x-client-id headers
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│              QURAN FOUNDATION CONTENT APIs                          │
│                                                                     │
│  GET  /content/api/v4/chapters                                     │
│  GET  /content/api/v4/verses/by_chapter/1                          │
│  GET  /content/api/v4/resources/translations                       │
│  ...                                                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Edit `.env`:

```env
QF_CLIENT_ID=your_client_id        # from Request Access
QF_CLIENT_SECRET=your_secret        # backend only, never expose
QF_ENV=prelive                      # or "production"
SESSION_SECRET=long-random-string
APP_BASE_URL=http://localhost:3000
```

Get credentials at: https://api-docs.quran.foundation/request-access

Register this redirect URI: `http://localhost:3000/auth/callback`

### 3. Run

```bash
npm start
# or for development:
npm run dev
```

Open http://localhost:3000

---

## File Structure

```
src/
├── server.js                    # Express entry point
├── config/
│   └── qfOAuthConfig.js         # Step 1: env + credentials + URLs
├── pkce/
│   └── pkce.js                  # PKCE helpers (code_verifier, code_challenge)
├── auth/
│   ├── buildAuthUrl.js          # Step 2: authorization URL builder
│   ├── tokenExchange.js         # Step 3: code → token exchange
│   ├── tokenRefresh.js          # Step 5: refresh_token → new access_token
│   ├── oidc.js                  # id_token verification + nonce validation
│   └── authRoutes.js            # Express route handlers
├── api/
│   ├── userApiClient.js         # Step 4: authenticated User API client
│   └── userRoutes.js            # Protected API proxy routes
└── content/
    ├── contentApi.js            # Typed wrappers for Content API endpoints
    ├── contentApiClient.js      # Client Credentials token management
    ├── contentRoutes.js         # Public Content API proxy routes
    └── contentTokenCache.js     # Token caching for Content API
public/
├── index.html                   # Login page
└── dashboard.html               # Post-auth dashboard
```

---

## API Routes

### User APIs (require authentication)
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/auth/login` | Start OAuth2 flow → redirect to QF login |
| `GET`  | `/auth/callback` | Receive code, validate state, exchange tokens |
| `POST` | `/auth/logout` | Clear session |
| `GET`  | `/auth/me` | Current user identity (safe, no tokens) |
| `POST` | `/api/auth/qf/exchange` | Mobile/SPA backend proxy exchange |
| `GET`  | `/api/user/bookmarks` | User bookmarks (scope: bookmark) |
| `GET`  | `/api/user/collections` | User collections (scope: collection) |
| `GET`  | `/api/user/preferences` | User preferences (scope: preference) |
| `GET`  | `/api/user/reading-sessions` | Reading sessions (scope: reading_session) |

### Content APIs (public, server-side auth)
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/content/chapters` | List all chapters |
| `GET`  | `/api/content/chapters/:id` | Get chapter by number |
| `GET`  | `/api/content/chapters/:id/info` | Get chapter info |
| `GET`  | `/api/content/verses/by_chapter/:chapterNumber` | Get verses by chapter |
| `GET`  | `/api/content/verses/by_page/:pageNumber` | Get verses by page |
| `GET`  | `/api/content/verses/by_juz/:juzNumber` | Get verses by Juz |
| `GET`  | `/api/content/verses/by_key/:verseKey` | Get verse by key (e.g. 1:1) |
| `GET`  | `/api/content/verses/random` | Get random verse |
| `GET`  | `/api/content/audio/chapter-reciters` | List chapter reciters |
| `GET`  | `/api/content/audio/chapter/:reciterId/:chapterNumber` | Get chapter audio |
| `GET`  | `/api/content/audio/chapter/:reciterId` | Get all chapter audios for reciter |
| `GET`  | `/api/content/audio/recitations` | List recitations |
| `GET`  | `/api/content/audio/ayahs/:recitationId/chapter/:chapterNumber` | Get ayah recitations for chapter |
| `GET`  | `/api/content/audio/ayahs/:recitationId/juz/:juzNumber` | Get ayah recitations for Juz |
| `GET`  | `/api/content/audio/ayah/:recitationId/:verseKey` | Get ayah recitation |
| `GET`  | `/api/content/resources/translations` | List translations |
| `GET`  | `/api/content/resources/tafsirs` | List tafsirs |
| `GET`  | `/api/content/resources/juzs` | List Juzs |
| `GET`  | `/api/content/quran/script/:script` | Get Quran by script |

---

## OAuth2 Endpoints

| Environment | Auth URL | API Base URL |
|-------------|----------|--------------|
| Pre-Production | `https://prelive-oauth2.quran.foundation` | `https://apis-prelive.quran.foundation` |
| Production | `https://oauth2.quran.foundation` | `https://apis.quran.foundation` |

---

## Scopes

| Scope | Access |
|-------|--------|
| `openid` | OIDC id_token (always include) |
| `offline_access` | Refresh tokens |
| `user` | User profile |
| `bookmark` | Bookmarked verses |
| `collection` | Saved collections |
| `reading_session` | Reading progress |
| `preference` | User preferences |
| `goal` | Reading goals |
| `streak` | Reading streaks |

---

## Content API (Client Credentials)

The Content API provides access to Quran text, translations, audio, and resources without requiring user authentication. It uses Client Credentials OAuth2 flow for server-side token management.

### Features
- Quran verses in multiple scripts (Uthmani, Imlaei, etc.)
- Translations and Tafsirs
- Audio recitations (chapter-level and verse-level)
- Chapter and Juz information
- Public resources (no user login required)

### Authentication
- Server-side Client Credentials flow
- Tokens cached and refreshed automatically
- No user interaction needed

### Usage
All content endpoints are available at `/api/content/*` and proxy to the Quran Foundation Content API v4.

Example:
```bash
curl http://localhost:3000/api/content/chapters
curl http://localhost:3000/api/content/verses/by_chapter/1
```

---

For React Native, iOS, or Android apps using the backend-exchange pattern:

1. App generates PKCE + state + nonce
2. App opens the QF hosted login URL
3. App receives `code` at its custom redirect URI
4. App POSTs to your backend:

```json
POST /api/auth/qf/exchange
{
  "code": "auth_code_from_callback",
  "codeVerifier": "your_code_verifier",
  "redirectUri": "myapp://callback",
  "expectedState": "state_you_generated",
  "state": "state_received_in_callback",
  "expectedNonce": "nonce_you_generated"
}
```

5. Backend validates, exchanges, returns:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "expiresIn": 3600,
  "scope": "openid offline_access bookmark ...",
  "user": { "sub": "...", "email": "...", "firstName": "..." }
}
```

Store `accessToken` and `refreshToken` in iOS Keychain / Android Keystore.

---

## Security Checklist

- ✅ `CLIENT_SECRET` never sent to browser or mobile app
- ✅ `state` validated on callback (CSRF protection)
- ✅ `nonce` validated in `id_token` (replay protection)
- ✅ PKCE `code_verifier` never logged
- ✅ Tokens stored in httpOnly session cookie, not localStorage
- ✅ Token refresh on 401 — one retry, no loops
- ✅ Environments isolated (prelive ≠ production)
- ✅ Redirect URI matched exactly

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid_client` | Using public-client flow with a confidential client | Ensure `QF_CLIENT_SECRET` is set and `exchangeCodeConfidential` is used |
| `invalid_grant` | Code expired, already used, or clock skew | One-time use only; check system time (NTP) |
| `redirect_uri_mismatch` | URI not registered exactly | Match scheme + host + path + trailing slash exactly |
| `401` on User APIs | Token expired | Refresh token (auto-handled by `createUserApiClient`) |
| `403` on User APIs | Missing scope | Re-authenticate with the required scope |

---

## References

- [User APIs Quickstart](https://api-docs.quran.foundation/docs/tutorials/oidc/user-apis-quickstart)
- [OAuth2 Tutorial](https://api-docs.quran.foundation/docs/tutorials/oidc/getting-started-with-oauth2)
- [OpenID Connect Guide](https://api-docs.quran.foundation/docs/tutorials/oidc/openid-connect)
- [Web Integration Example](https://api-docs.quran.foundation/docs/tutorials/oidc/example-integration)
- [User APIs Reference](https://api-docs.quran.foundation/docs/category/user-related-apis)
- [OAuth2 Scopes](https://api-docs.quran.foundation/docs/user_related_apis_versioned/scopes)
- [Content APIs Reference](https://api-docs.quran.foundation/docs/category/content-apis)
- [Client Credentials Flow](https://api-docs.quran.foundation/docs/tutorials/oauth2/client-credentials)
