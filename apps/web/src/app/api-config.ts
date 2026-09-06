import { environment } from '../environments/environment';

// Single source of truth for the API base URL -- comes from the
// environment file, which angular.json swaps per build configuration
// (environment.ts for dev, environment.prod.ts for production builds).
export const API_BASE_URL = environment.apiBaseUrl;
