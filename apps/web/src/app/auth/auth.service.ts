import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, tap, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { clearStoredToken, storeToken } from './token-storage';
import type { GoogleCredentialResponse } from './google-identity.d.ts';

// Neither of these calls has a server-side operation slow enough to
// justify waiting longer than this -- past it, something is genuinely
// stuck (a network issue, an unreachable dependency), not just a normal
// cold start. Without a client-side cap, a hung request left the UI
// spinning forever with no way out: the initial session check would trap
// the whole app behind its loader, and a Google sign-in would leave that
// specific loader running indefinitely with no error ever surfacing.
const AUTH_CHECK_TIMEOUT_MS = 15_000;
const GOOGLE_SIGNIN_TIMEOUT_MS = 20_000;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  picture: string | null;
  /** True for a Google-only account that has never set a password --
   * App's redirect effect sends this user to /complete-profile until it
   * clears, regardless of which page they arrived from. */
  needsPassword: boolean;
}

const AUTH_BASE = environment.authBaseUrl;

@Injectable({ providedIn: 'root' })
export class AuthService {
  currentUser = signal<AuthUser | null>(null);
  /** False until the initial GET /auth/me (session restore) has resolved,
   * one way or the other. The whole app is gated on this now -- nothing
   * (not even the feed) renders before it's true, so there's never a flash
   * of content that then gets yanked away once we learn there's no session. */
  authChecked = signal(false);
  /** True while a Google credential is being exchanged for a session --
   * the one gap that used to leave the UI looking inert: picking an
   * account in Google's popup/FedCM UI closes it instantly, but the actual
   * POST /auth/google round-trip (plus Render's free-tier cold start) can
   * take a real few seconds with nothing else on screen changing.
   * AppComponent shows a single full-page loader for as long as this is
   * true, from wherever renderGoogleButton's callback fires (login page,
   * signup page, or any future spot). */
  authenticating = signal(false);
  /** Set when a Google sign-in attempt fails -- previously this failed
   * completely silently (the loader just vanished), which is exactly what
   * "I click the button and nothing happens" looks like. Login/signup
   * pages display this next to the Google button. */
  authError = signal<string | null>(null);

  constructor(private http: HttpClient) {}

  /** Called once from AppComponent on startup to restore an existing
   * session (the browser already holds the cookie, if any -- this just
   * asks the API who, if anyone, it belongs to). A 401 here is the normal
   * "not signed in" case, not an error worth surfacing. */
  init() {
    this.http
      .get<{ user: AuthUser }>(`${AUTH_BASE}/me`, { withCredentials: true })
      .pipe(timeout(AUTH_CHECK_TIMEOUT_MS))
      .subscribe({
        next: (res) => {
          this.currentUser.set(res.user);
          this.authChecked.set(true);
        },
        // A real 401 (not signed in) and a timeout both land here and are
        // treated the same way -- signed out. Defaulting to "needs to log
        // in" rather than leaving authChecked false forever is what keeps
        // a hung request from trapping the whole app behind its loader.
        error: () => {
          this.currentUser.set(null);
          this.authChecked.set(true);
        },
      });
  }

  /** Renders the actual Google button into `container`. Google's script
   * (loaded via a <script> tag in index.html, not an npm package) attaches
   * itself to window.google -- guarded in case it hasn't finished loading
   * yet or failed to load (e.g. an ad blocker). */
  renderGoogleButton(container: HTMLElement) {
    if (!window.google) return;
    window.google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response) => this.handleCredential(response),
    });
    window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'medium', shape: 'rectangular' });
  }

  private handleCredential(response: GoogleCredentialResponse) {
    this.authenticating.set(true);
    this.authError.set(null);
    this.http
      .post<{ user: AuthUser; token: string }>(
        `${AUTH_BASE}/google`,
        { credential: response.credential },
        { withCredentials: true },
      )
      .pipe(timeout(GOOGLE_SIGNIN_TIMEOUT_MS))
      .subscribe({
        next: (res) => {
          storeToken(res.token);
          this.currentUser.set(res.user);
          this.authChecked.set(true);
          this.authenticating.set(false);
          // No explicit navigate here -- App's redirect effect is the
          // single place that decides where a signed-in user ends up
          // (home, or /complete-profile if needsPassword is still true),
          // and it reacts to currentUser() the instant this signal changes.
        },
        error: (err: HttpErrorResponse | Error) => {
          this.authenticating.set(false);
          this.authError.set(
            err.name === 'TimeoutError'
              ? 'This is taking too long. Check your connection and try again.'
              : ((err as HttpErrorResponse).error?.message ?? 'Could not sign in with Google. Please try again.'),
          );
        },
      });
  }

  /** Returns the Observable (rather than self-subscribing like the Google/
   * logout flows above) so the signup/login pages can drive their own
   * loading state and show the specific error message the API sends back
   * -- a form needs richer feedback than "stay signed out and try again". */
  signup(name: string, email: string, password: string, confirmPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${AUTH_BASE}/signup`,
      { name, email, password, confirmPassword },
      { withCredentials: true },
    );
  }

  login(email: string, password: string): Observable<{ user: AuthUser; token: string }> {
    return this.http
      .post<{ user: AuthUser; token: string }>(`${AUTH_BASE}/login`, { email, password }, { withCredentials: true })
      .pipe(
        tap((res) => {
          storeToken(res.token);
          this.currentUser.set(res.user);
        }),
      );
  }

  /** The forced "complete your profile" step after a first Google sign-in
   * (see AuthUser.needsPassword) -- confirms/edits the name and sets a
   * password so the account can also log in the normal way afterward. */
  setPassword(name: string, password: string, confirmPassword: string): Observable<{ user: AuthUser }> {
    return this.http
      .post<{ user: AuthUser }>(`${AUTH_BASE}/set-password`, { name, password, confirmPassword }, { withCredentials: true })
      .pipe(tap((res) => this.currentUser.set(res.user)));
  }

  resendVerification(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${AUTH_BASE}/resend-verification`, { email }, { withCredentials: true });
  }

  logout() {
    // Dropped before the request goes out, not after it comes back -- the
    // stored token is what would otherwise keep authenticating requests
    // even if this call fails or never completes.
    clearStoredToken();
    this.http.post(`${AUTH_BASE}/logout`, {}, { withCredentials: true }).subscribe({
      next: () => this.currentUser.set(null),
      // Clear the local state either way -- worst case the cookie outlives
      // this call and /auth/me quietly re-establishes it next load, which
      // is the same failure mode as any logout button when offline.
      error: () => this.currentUser.set(null),
    });
  }
}
