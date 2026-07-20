export const environment = {
  production: true,
  apiBaseUrl: 'https://api.hnb.co.za/api', // ← real production backend URL later
  appName: 'H&B E-Commerce',
  version: '1.0.0',
  debug: false,
  // No GA4 property provisioned yet. GoogleAnalyticsService is a complete
  // no-op while this is empty — never commit a real-looking id.
  gaMeasurementId: '',
  // Payment provider config intentionally absent: provider not chosen yet.
  // The API exposes a provider-agnostic payments port; keys live server-side.
};
