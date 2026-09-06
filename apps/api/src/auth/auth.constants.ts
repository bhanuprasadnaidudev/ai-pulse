// Single source of truth for how long a session lasts -- both the JWT's own
// expiry (auth.module.ts) and the cookie's maxAge (auth.controller.ts) are
// derived from this so they can't silently drift out of sync.
export const SESSION_MAX_AGE_DAYS = 30;
export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = 'session';
