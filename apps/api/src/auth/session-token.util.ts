import type { Request } from 'express';
import { SESSION_COOKIE_NAME } from './auth.constants.js';

/** Accepts the session either as the httpOnly cookie or as a
 * `Authorization: Bearer <token>` header.
 *
 * The cookie alone isn't enough in production: the API and the web app are
 * separate Render services on unrelated onrender.com subdomains (that
 * domain is on the public suffix list), so the cookie is genuinely
 * third-party there -- Safari and every iOS browser drop it outright, and
 * Chrome is heading the same way. The header is what makes the deployed
 * app work regardless; the cookie stays as the preferred path wherever the
 * browser still honours it (and it's what the email-verification redirect
 * relies on, since that's a plain browser navigation with no JS to attach
 * a header). */
export function extractSessionToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[SESSION_COOKIE_NAME];
  if (fromCookie) return fromCookie;

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim() || undefined;

  return undefined;
}
