# Final Production Readiness Audit Report

This document contains the findings of the Phase 3.5 Production Readiness Audit for the Kaktus platform.

## 1. Findings and Recommendations

| Area | Severity | File/Component | Finding | Evidence | Recommended Action |
|---|---|---|---|---|---|
| **Deploy** | High | `tsconfig.json`, `next.config.ts` | The TypeScript compiler traces the unmerged `kaktus2/` reference folder, causing build warnings/errors. | `npm run build` logs show `kaktus2/src/... error TS2339`. | Add `"kaktus2"` to the `exclude` array in `tsconfig.json`. |
| **Deploy** | High | `src/components/Terminal.tsx` | The Terminal component relies on a raw `WebSocket` connection. | `new WebSocket(wsUrl)` at line 81. | Vercel Serverless Functions do not support persistent WebSocket connections. Must deploy the terminal backend as a separate persistent service (e.g., Node.js on Railway/Render) or use a Serverless WS provider (e.g., Pusher). |
| **Quota** | Low | `src/app/api/user/quota/route.ts` | The API faithfully reports `runsRemaining` from Supabase (or Firestore fallback), but does not distinguish between standard usage and unlimited standard usage if standard runs are ever billed. | Lines 17-37 fetch the correct `quota_remaining`. | No immediate action required, but document that `quotaRemaining` strictly tracks *Pro Runs*. |
| **Auth** | Low | `src/app/api/support/tickets/[id]/route.ts` | Cross-user access control is robust. | `if (!isStaff && ticket.user_uid !== user.uid) return 403;` | None. Security boundary is solid. |
| **Payments**| Low | `src/app/api/cashfree/webhook/route.ts` | Webhook idempotency and recovery logic is robust. | `db.runTransaction(...)` effectively mitigates concurrent webhooks, and `skipSupabase` handles partial Supabase provision failures. | None. |

---

## 2. Testing Execution and Results

I executed the following checks without modifying production services:

1. **Type Checking (`npx tsc --noEmit`)**:
   - **Result:** Failed.
   - **Reason:** The compiler attempted to validate the `kaktus2` reference folder, which contains un-ported code (e.g., `planExpiresAt` missing from Kaktus 1's secure `AuthContextType`). The active `src/` tree is fully typed and sound.

2. **Unit Tests (`npx vitest run tests/cashfree-webhook.test.ts`)**:
   - **Result:** Passed (3/3 tests).
   - **Reason:** Cashfree webhook idempotency, amount mismatch rejection, and unknown order rejection work perfectly.

3. **Next.js Production Build (`npm run build`)**:
   - **Result:** Build succeeded despite TS warnings in `kaktus2/`.
   - **Reason:** Turbopack correctly built the `src/` directory, though it flagged a dynamic filesystem access warning in `firebase-admin.ts` (pre-existing, acceptable for Next.js API routes retrieving service accounts).

---

## 3. Required Environment Variables

The following environment variables must be configured in Vercel. **(Values are NOT shown for security.)**

**Public (Exposed to Browser):**
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_CASHFREE_ENV`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_SUPABASE_URL`

**Server-Only (Secrets):**
- `ADMIN_EMAILS`
- `API_RATE_LIMIT_REQUESTS`
- `API_RATE_LIMIT_WINDOW_SECONDS`
- `CASHFREE_APP_ID`
- `CASHFREE_ENV`
- `CASHFREE_SECRET_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_KEY`
- `GEMINI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPER_ADMIN_EMAIL`

---

## 4. Vercel Compatibility and Database Architecture

- **Supabase RLS:** Kaktus utilizes `adminSupabase` with the `SUPABASE_SERVICE_ROLE_KEY` for all server-side operations (Quota, Support, API Usage). This correctly bypasses RLS on the database layer because Next.js API routes (`src/app/api/...`) enforce authentication (`requireAuthenticatedUser`) and authorization (`requireRole`) *before* issuing database queries.
- **Vercel Serverless Limit:** The Next.js API routes (Gemini, Cashfree, Support) will run perfectly on Vercel. However, **the `Terminal` component (`src/components/Terminal.tsx`) which attempts to establish a raw `WebSocket` connection will fail.** Vercel Serverless Functions drop idle connections and do not support the WebSocket protocol.
- **Solution for Terminal:** The terminal WebSocket backend (which presumably runs via `server.js` or `backend/main.py`) must be deployed as a separate persistent service on a platform like Render, Railway, or an EC2 instance.

---

## 5. Proposed Code Changes Requiring Approval

I propose the following minor fixes to ensure a pristine Vercel deployment:

1. **`tsconfig.json`**: Add `"kaktus2"` to the `"exclude"` array to prevent the unmerged reference code from failing the Vercel build step.
2. **Terminal Configuration**: Determine where the Terminal backend will be hosted, and update the hardcoded WebSocket URL in `Terminal.tsx` to an environment variable (e.g., `process.env.NEXT_PUBLIC_TERMINAL_WS_URL`).

Please approve these changes, and I will implement them to finalize the repository.
