// Swapped in for environment.ts on production builds (see angular.json's
// fileReplacements under the "production" configuration).
export const environment = {
  production: true,
  apiBaseUrl: 'https://ai-pulse-api-zcyv.onrender.com',
  // Absolute, straight to the API -- same as dev, and deliberately no
  // longer relative.
  //
  // These used to be relative ('/auth', '/saved') so they'd resolve
  // against the web app's own domain and get proxied to the API by a
  // Render static-site rewrite rule, which made the session cookie look
  // first-party. That approach depended on a hand-configured dashboard
  // rule proxying POST requests through a static-site host, and it did
  // not work: sign-in worked locally (absolute URL, direct to the API)
  // and failed on the deployed site every time.
  //
  // The cookie's first-party-ness is now handled properly instead of
  // structurally: the API also returns the session token in the response
  // body, and the web app sends it back as an Authorization: Bearer
  // header (see auth.interceptor.ts), so auth no longer depends on
  // cross-site cookies being allowed -- or on any proxy existing.
  authBaseUrl: 'https://ai-pulse-api-zcyv.onrender.com/auth',
  savedBaseUrl: 'https://ai-pulse-api-zcyv.onrender.com/saved',
  // Not a secret, safe to commit -- see environment.ts for why.
  googleClientId: '217954173206-244ddqiehcv0ldgcm41u3ml01svl6n5u.apps.googleusercontent.com',
};
