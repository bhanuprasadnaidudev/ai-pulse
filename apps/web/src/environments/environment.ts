// Default (dev) environment -- used by `ng serve` and plain `ng build`.
// Swapped for environment.prod.ts on production builds via angular.json's
// fileReplacements, so a deployed build points at the deployed API without
// any runtime configuration or env vars needed on the static host.
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000',
};
