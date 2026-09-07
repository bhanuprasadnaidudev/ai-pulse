// Single source of truth for how long a session lasts -- both the JWT's own
// expiry (auth.module.ts) and the cookie's maxAge (auth.controller.ts) are
// derived from this so they can't silently drift out of sync.
export const SESSION_MAX_AGE_DAYS = 30;
export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = 'session';

export const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h
// Shorter than the verification window on purpose: a reset link is a
// live credential for taking over an account, so it should stop working
// well before a signup link would.
export const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1h
// bcrypt/bcryptjs silently truncate past 72 bytes -- without this cap, two
// different long passwords sharing the first 72 bytes hash identically.
export const MAX_PASSWORD_BYTES = 72;
export const MIN_PASSWORD_LENGTH = 8;
