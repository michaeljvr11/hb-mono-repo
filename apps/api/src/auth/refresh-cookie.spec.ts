import { resolveRefreshCookieSecurity } from './refresh-cookie';

describe('resolveRefreshCookieSecurity', () => {
  it("defaults to strict + httpOnly when unset (today's behaviour)", () => {
    expect(resolveRefreshCookieSecurity(undefined, 'development')).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
    });
  });

  it('keeps secure tied to production for the default strict cookie', () => {
    expect(resolveRefreshCookieSecurity('strict', 'production')).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
    });
  });

  it('honours an explicit lax setting', () => {
    expect(resolveRefreshCookieSecurity('lax', 'development').sameSite).toBe('lax');
  });

  it('forces secure on when sameSite=none, even outside production', () => {
    // Browsers reject SameSite=None without Secure, so it must never ship insecure.
    expect(resolveRefreshCookieSecurity('none', 'development')).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
  });

  it('is case- and whitespace-insensitive', () => {
    expect(resolveRefreshCookieSecurity('  None  ', 'development').sameSite).toBe('none');
  });

  it('falls back to strict on an unknown value so a typo cannot loosen the cookie', () => {
    expect(resolveRefreshCookieSecurity('laxx', 'production')).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
    });
  });
});
