import { sanitizeReturnUrl } from './return-url';

describe('sanitizeReturnUrl', () => {
  it('returns same-app absolute paths unchanged', () => {
    expect(sanitizeReturnUrl('/vendor/dashboard')).toBe('/vendor/dashboard');
    expect(sanitizeReturnUrl('/shop?category=books&page=2')).toBe('/shop?category=books&page=2');
    expect(sanitizeReturnUrl('/vendor-dashboard/orders')).toBe('/vendor-dashboard/orders');
  });

  it('returns null for empty or missing values', () => {
    expect(sanitizeReturnUrl(null)).toBeNull();
    expect(sanitizeReturnUrl(undefined)).toBeNull();
    expect(sanitizeReturnUrl('')).toBeNull();
  });

  it('rejects absolute external URLs', () => {
    expect(sanitizeReturnUrl('https://evil.com')).toBeNull();
    expect(sanitizeReturnUrl('http://evil.com/path')).toBeNull();
    expect(sanitizeReturnUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects protocol-relative and backslash open-redirect vectors', () => {
    expect(sanitizeReturnUrl('//evil.com')).toBeNull();
    expect(sanitizeReturnUrl('/\\evil.com')).toBeNull();
    expect(sanitizeReturnUrl('/path\\to\\evil')).toBeNull();
  });

  it('rejects relative paths without a leading slash', () => {
    expect(sanitizeReturnUrl('shop')).toBeNull();
    expect(sanitizeReturnUrl('vendor/dashboard')).toBeNull();
  });
});
