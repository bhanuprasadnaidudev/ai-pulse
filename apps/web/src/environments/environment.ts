// Default (dev) environment -- used by `ng serve` and plain `ng build`.
// Swapped for environment.prod.ts on production builds via angular.json's
// fileReplacements, so a deployed build points at the deployed API without
// any runtime configuration or env vars needed on the static host.
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000',
  // Absolute in dev (no same-origin proxy needed locally), but relative in
  // production (see environment.prod.ts) -- that's the part that actually
  // matters: a relative path resolves against the web app's own origin,
  // which is what makes the deployed static site's /auth/* rewrite rule
  // (proxying to the API) actually get exercised, which in turn is what
  // makes the session cookie look first-party to Safari/iOS instead of a
  // third-party cookie it blocks outright.
  authBaseUrl: 'http://localhost:3000/auth',
  // Not a secret -- Google's Sign-In client ID is public by design (it
  // identifies the app, same idea as an OAuth "client key"). Needed here
  // too, not just in environment.prod.ts, since `ng serve` runs against
  // localhost:4200, one of the Authorized JavaScript origins on the OAuth
  // client. REPLACE_ME until the Google Cloud OAuth client exists.
  googleClientId: 'REPLACE_ME_WITH_REAL_GOOGLE_OAUTH_CLIENT_ID',
};
