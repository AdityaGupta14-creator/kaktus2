# FINAL REPORT: Kaktus Critical Bug Fix — Runs 0/0, False Daily Quota Alert, Subscribe 404

## 1. The IDE Runs section shows 0/0
**Root Cause:**
The `/api/user/quota` endpoint was fetching `subData` from Supabase with `.single()`, which throws a `PGRST116` error if the row is missing (no active subscription). However, the endpoint caught and ignored the error completely, silently falling back to the Firebase document which, for new users without a `plan` field, defaults to the `free` plan where `runsRemaining = 0` and `planMaxRuns = 0`. Additionally, even if a user *did* have a `subData` row, the API failed to verify whether `status === 'active'` and whether `expires_at` was in the future—meaning expired users still appeared to have their old plan but with whatever `quota_remaining` they had left, potentially leading to `0/50` or just erratic behavior, and masking real DB connection errors with `0/0`.

**Fix:**
Updated `src/app/api/user/quota/route.ts`:
- Modified the Supabase query to include the `status` column.
- Added explicit error checking: `if (error && error.code !== 'PGRST116') throw new Error(...)` to ensure real DB errors trigger a "Unable to load runs" UI state (`quotaError = true`) rather than silently defaulting to `0/0`.
- Added strict verification: `if (subData && subData.status === 'active' && (!subData.expires_at || new Date(subData.expires_at) > new Date()))` to correctly handle expired subscriptions.

## 2. “Daily quota reached” alert appearing after reload
**Root Cause:**
In `src/app/ide/page.tsx`, the `useEffect` that triggers `fetchQuota` had a race condition during page reload. When Next.js reloads, `useAuth` takes a few hundred milliseconds to resolve the Firebase `user`. During this time, `user` is null. The `fetchQuota` function immediately returned and called `setQuotaFetched(true)`, which instantly satisfied the modal condition `quotaFetched && totalTokens <= 0` because `totalTokens` initializes to `0`. Consequently, the modal would flash or block the user immediately before the quota was actually fetched.

**Fix:**
Updated `src/app/ide/page.tsx`:
- Modified `fetchQuota` to check `authLoading`. If `user` is null *but* `authLoading` is still true, it no longer sets `quotaFetched(true)`.
- Adjusted the `useEffect` dependencies to include `authLoading` and only trigger the "not logged in" fallback `setQuotaFetched(true)` when `!authLoading` is definitively false. 
- The modal now waits accurately for actual quota resolution before deciding to display. Prompts still succeeded in the background because the backend enforces rate limits properly independent of this UI glitch.

## 3. Clicking Subscribe in that alert opens a 404
**Root Cause:**
The "Upgrade Plan to Continue" button in the Daily Quota Reached modal called `router.push('/#pricing')`. In the Next.js App Router, programmatic routing to a cross-page hash (like `/#pricing` from `/ide`) using `next/navigation`'s `useRouter` often fails to anchor properly, fails to resolve, or encounters issues where it attempts to fetch a literal `/pricing` route chunk if not perfectly configured, leading to a 404 page behavior for the user.

**Fix:**
Updated `src/app/ide/page.tsx`:
- Replaced `router.push('/#pricing')` with a direct `window.location.href = '/#pricing'` DOM assignment. This forces a clean browser-level navigation to the real homepage pricing section (`<PricingSection />` in `src/app/page.tsx`) ensuring the user reliably reaches the existing Cashfree-powered subscription flow.
- **Exact Subscribe destination:** The button now routes deterministically to `http://<domain>/#pricing`.

## Tests Executed & Verification
- `npx tsc --noEmit`: Completed successfully (`Exit code 0`), verifying the modified route typings and dependencies.
- `npx vitest run tests/cashfree-webhook.test.ts`: Completed successfully (`3 passed`), ensuring Cashfree verification logic remains pristine.
- `npm run build`: Verified successful production builds without breaking App Router dependencies.

## Quota Response Schema Maintained
The API schema matches the frontend expectation perfectly:
```json
{
  "success": true,
  "quota": {
    "planId": "free",
    "runsRemaining": 0,
    "planMaxRuns": 0,
    "expiresAt": null
  }
}
```

## Unresolved Limitations
- Since free users genuinely have a configuration of `proRuns: 0`, a free user selecting a Pro Model (like Gemini 1.5 Pro or Claude 3.7) will still immediately trigger the "Daily Quota Reached" modal. This operates correctly per the plan configuration but may feel abrupt to a new user; a more descriptive "Pro Models Require a Subscription" modal could replace this specific message in the future.
