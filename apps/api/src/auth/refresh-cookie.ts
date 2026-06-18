import type { CookieOptions } from 'express';

export type RefreshCookieSameSite = 'strict' | 'lax' | 'none';

const VALID_SAME_SITE: readonly RefreshCookieSameSite[] = ['strict', 'lax', 'none'];

/**
 * Resolve the SameSite/secure/httpOnly attributes for the refresh cookie.
 *
 * Topology-driven (see the "Auth & Roles" Obsidian note):
 * - Same-site or same-origin deploys (web + API share a registrable domain, or
 *   the API is reverse-proxied under the web host) keep the default 'strict' —
 *   the strongest CSRF posture. The cookie still rides the same-site refresh XHR.
 * - A genuinely cross-site deploy (web + API on different registrable domains)
 *   must set REFRESH_COOKIE_SAMESITE=none, or the browser drops the cookie on
 *   the `POST /auth/refresh` XHR and every session-resumption flow breaks.
 *
 * 'none' is rejected by browsers without the Secure attribute, so Secure is
 * forced on whenever SameSite=none (and is always on in production regardless).
 * Switching to 'none' opens cookie-authed endpoints (`/auth/refresh`) to CSRF —
 * add CSRF hardening before deploying cross-site.
 *
 * Unknown/empty values fall back to 'strict' so a typo can never silently
 * loosen the cookie.
 */
export function resolveRefreshCookieSecurity(
  sameSiteRaw: string | undefined,
  nodeEnv: string | undefined,
): Pick<CookieOptions, 'httpOnly' | 'secure' | 'sameSite'> {
  const sameSite = normalizeSameSite(sameSiteRaw);
  const secure = nodeEnv === 'production' || sameSite === 'none';
  return { httpOnly: true, secure, sameSite };
}

function normalizeSameSite(raw: string | undefined): RefreshCookieSameSite {
  const value = (raw ?? '').trim().toLowerCase();
  return (VALID_SAME_SITE as readonly string[]).includes(value)
    ? (value as RefreshCookieSameSite)
    : 'strict';
}
