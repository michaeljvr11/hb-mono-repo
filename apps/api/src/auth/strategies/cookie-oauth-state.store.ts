import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

const STATE_COOKIE = 'g_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — one consent round-trip
const COOKIE_PATH = '/api/auth';

type StoreCallback = (err: Error | null, state?: string) => void;
type VerifyCallback = (err: Error | null, ok?: boolean, info?: { message: string }) => void;

/**
 * Stateless CSRF-state store for the Google OAuth flow (see docs/security M2).
 *
 * passport-oauth2's default state store requires express-session, which this API
 * deliberately does not run. Instead we bind the OAuth `state` to a short-lived,
 * httpOnly cookie on the API origin:
 *
 *  - `store` generates a random state, sets it as a cookie, and hands the same
 *    value to Google as the `state` query param.
 *  - `verify` (on the callback) compares the returned `state` against the cookie
 *    in constant time and clears it.
 *
 * Both `/auth/google` and `/auth/google/callback` are top-level navigations to the
 * API origin, so a `SameSite=Lax` first-party cookie rides both legs regardless of
 * the web/API deploy topology. A forged callback without the matching cookie fails.
 *
 * The method arities matter: passport-oauth2 dispatches on `store.length` (2) and
 * `verify.length` (3) — do not add parameters.
 */
export class CookieOAuthStateStore {
  constructor(private readonly secure: boolean) {}

  store(req: Request, callback: StoreCallback): void {
    const state = randomBytes(24).toString('hex');
    req.res?.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      path: COOKIE_PATH,
      maxAge: STATE_TTL_MS,
    });
    callback(null, state);
  }

  verify(req: Request, providedState: string, callback: VerifyCallback): void {
    const cookies = req.cookies as Record<string, string> | undefined;
    const cookieState = cookies?.[STATE_COOKIE];
    // Single-use: clear it whether or not verification succeeds.
    req.res?.clearCookie(STATE_COOKIE, { path: COOKIE_PATH });

    if (!cookieState || !providedState || !this.constantTimeEqual(cookieState, providedState)) {
      return callback(null, false, { message: 'Invalid OAuth state.' });
    }
    callback(null, true);
  }

  private constantTimeEqual(a: string, b: string): boolean {
    const ha = createHash('sha256').update(a).digest();
    const hb = createHash('sha256').update(b).digest();
    return timingSafeEqual(ha, hb);
  }
}
