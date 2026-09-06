import { HttpInterceptorFn } from '@angular/common/http';
import { readStoredToken } from './token-storage';

/** Attaches the session as `Authorization: Bearer <token>` on every request
 * that already opts into credentials.
 *
 * The cookie is still set and still preferred where the browser honours
 * it, but in production the API and the web app are separate Render
 * services on unrelated onrender.com subdomains, which makes that cookie
 * third-party: Safari and every iOS browser drop it. This header is what
 * makes the deployed app work at all -- without it, sign-in appeared to
 * succeed (the POST returned 200) and then every following request came
 * back 401, which is exactly what "it works locally but not deployed"
 * looked like. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = readStoredToken();
  if (!token || !req.withCredentials) return next(req);

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
