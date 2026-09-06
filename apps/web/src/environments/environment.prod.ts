// Swapped in for environment.ts on production builds (see angular.json's
// fileReplacements under the "production" configuration).
export const environment = {
  production: true,
  apiBaseUrl: 'https://ai-pulse-api-zcyv.onrender.com',
  // Relative, not absolute -- see environment.ts for why this matters.
  authBaseUrl: '/auth',
  // Not a secret, safe to commit -- see environment.ts for why.
  googleClientId: 'REPLACE_ME_WITH_REAL_GOOGLE_OAUTH_CLIENT_ID',
};
