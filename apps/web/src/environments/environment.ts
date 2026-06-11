export const environment = {
  production: true,
  apiBaseUrl: 'https://api.hnb.co.za/api', // ← real production backend URL later
  appName: 'H&B E-Commerce',
  version: '1.0.0',
  debug: false,
  // Payment provider config intentionally absent: provider not chosen yet.
  // The API exposes a provider-agnostic payments port; keys live server-side.
};
