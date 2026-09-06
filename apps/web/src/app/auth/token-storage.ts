const TOKEN_KEY = 'current:session-token';

/** The session JWT, mirrored out of the httpOnly cookie so it can also be
 * sent as an Authorization header (see auth.interceptor.ts for why that's
 * necessary in production).
 *
 * Trade-off worth naming: unlike the cookie, this is readable by any
 * script on the page, so it's exposed to XSS in a way the cookie isn't.
 * The cookie remains the primary mechanism and is still httpOnly; this is
 * the fallback for the browsers that refuse to send it at all, where the
 * alternative isn't "more secure", it's "cannot sign in". */
export function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // private browsing / storage disabled -- cookie-only, then
  }
}

export function storeToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Same as above -- the cookie still carries the session where it works.
  }
}

export function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear if it was never stored.
  }
}
