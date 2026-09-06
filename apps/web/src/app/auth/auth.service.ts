import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import type { GoogleCredentialResponse } from './google-identity.d.ts';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  picture: string | null;
}

const AUTH_BASE = environment.authBaseUrl;

@Injectable({ providedIn: 'root' })
export class AuthService {
  currentUser = signal<AuthUser | null>(null);
  /** True while a Google credential is being exchanged for a session --
   * the one gap that used to leave the UI looking inert: picking an
   * account in Google's popup/FedCM UI closes it instantly, but the actual
   * POST /auth/google round-trip (plus Render's free-tier cold start) can
   * take a real few seconds with nothing else on screen changing.
   * AppComponent shows a single full-page loader for as long as this is
   * true, from wherever renderGoogleButton's callback fires (login page,
   * signup page, or any future spot). */
  authenticating = signal(false);

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {}

  /** Called once from AppComponent on startup to restore an existing
   * session (the browser already holds the cookie, if any -- this just
   * asks the API who, if anyone, it belongs to). A 401 here is the normal
   * "not signed in" case, not an error worth surfacing. */
  init() {
    this.http.get<{ user: AuthUser }>(`${AUTH_BASE}/me`, { withCredentials: true }).subscribe({
      next: (res) => this.currentUser.set(res.user),
      error: () => this.currentUser.set(null),
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
    this.http
      .post<{ user: AuthUser }>(`${AUTH_BASE}/google`, { credential: response.credential }, { withCredentials: true })
      .subscribe({
        next: (res) => {
          this.currentUser.set(res.user);
          this.authenticating.set(false);
          // Google sign-in only ever happens from /login or /signup --
          // without this, a successful sign-in silently left the user
          // sitting on that same form with no visible sign anything had
          // happened (the actual bug behind "nothing happens after I pick
          // an account", not just a missing spinner).
          this.router.navigateByUrl('/');
        },
        error: () => {
          // Verification failed server-side (expired/tampered token, or
          // the client ID doesn't match) -- nothing to restore, just stay
          // signed out. The button remains available to try again.
          this.authenticating.set(false);
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

  login(email: string, password: string): Observable<{ user: AuthUser }> {
    return this.http
      .post<{ user: AuthUser }>(`${AUTH_BASE}/login`, { email, password }, { withCredentials: true })
      .pipe(tap((res) => this.currentUser.set(res.user)));
  }

  resendVerification(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${AUTH_BASE}/resend-verification`, { email }, { withCredentials: true });
  }

  logout() {
    this.http.post(`${AUTH_BASE}/logout`, {}, { withCredentials: true }).subscribe({
      next: () => this.currentUser.set(null),
      // Clear the local state either way -- worst case the cookie outlives
      // this call and /auth/me quietly re-establishes it next load, which
      // is the same failure mode as any logout button when offline.
      error: () => this.currentUser.set(null),
    });
  }
}
