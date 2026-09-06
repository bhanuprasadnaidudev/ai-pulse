// Swapped in for environment.ts on production builds (see angular.json's
// fileReplacements under the "production" configuration).
export const environment = {
  production: true,
  apiBaseUrl: 'https://ai-pulse-api-zcyv.onrender.com',
  // Relative, not absolute -- see environment.ts for why this matters.
  authBaseUrl: '/auth',
  // Relative for the same reason as authBaseUrl -- requires a matching
  // /saved/* rewrite rule on the web static site (Render dashboard),
  // proxying to the API exactly like the existing /auth/* rule.
  savedBaseUrl: '/saved',
  // Not a secret, safe to commit -- see environment.ts for why.
  googleClientId: '217954173206-244ddqiehcv0ldgcm41u3ml01svl6n5u.apps.googleusercontent.com',
};
