/**
 * Sanitise a `returnUrl` query param before it is fed to `Router.navigateByUrl`.
 *
 * The guards (`authGuard`/`roleGuard`) attach the attempted in-app URL as `returnUrl`
 * when bouncing to `/login`, but the value reaching `login`/`register` arrives from the
 * URL bar and is attacker-controllable. Only same-app, absolute relative paths are safe
 * to navigate to — anything that could leave the app (absolute URLs, protocol-relative
 * `//host`, or backslash tricks that browsers normalise to `//`) is an open-redirect
 * vector and is rejected. Callers fall back to their own default destination on `null`.
 *
 * @returns the URL if it is a safe same-app path, otherwise `null`.
 */
export function sanitizeReturnUrl(returnUrl: string | null | undefined): string | null {
  if (!returnUrl) {
    return null;
  }

  // Must be an absolute in-app path: a single leading slash, never `//` or `/\`
  // (both resolve to protocol-relative external navigations once normalised).
  if (!returnUrl.startsWith('/') || returnUrl.startsWith('//') || returnUrl.startsWith('/\\')) {
    return null;
  }

  // A backslash anywhere is suspect — browsers can rewrite `\` to `/`, turning a path that
  // passed the prefix check into a protocol-relative external navigation. Legitimate in-app
  // routes never contain backslashes.
  if (returnUrl.includes('\\')) {
    return null;
  }

  return returnUrl;
}
