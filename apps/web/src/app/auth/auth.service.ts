import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../api-config';
import { environment } from '../../environments/environment';
import type { GoogleCredentialResponse } from './google-identity.d.ts';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  picture: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  currentUser = signal<AuthUser | null>(null);

  constructor(private http: HttpClient) {}

  /** Called once from AppComponent on startup to restore an existing
   * session (the browser already holds the cookie, if any -- this just
   * asks the API who, if anyone, it belongs to). A 401 here is the normal
   * "not signed in" case, not an error worth surfacing. */
  init() {
    this.http.get<{ user: AuthUser }>(`${API_BASE_URL}/auth/me`, { withCredentials: true }).subscribe({
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
    this.http
      .post<{ user: AuthUser }>(
        `${API_BASE_URL}/auth/google`,
        { credential: response.credential },
        { withCredentials: true },
      )
      .subscribe({
        next: (res) => this.currentUser.set(res.user),
        error: () => {
          // Verification failed server-side (expired/tampered token, or
          // the client ID doesn't match) -- nothing to restore, just stay
          // signed out. The button remains available to try again.
        },
      });
  }

  logout() {
    this.http.post(`${API_BASE_URL}/auth/logout`, {}, { withCredentials: true }).subscribe({
      next: () => this.currentUser.set(null),
      // Clear the local state either way -- worst case the cookie outlives
      // this call and /auth/me quietly re-establishes it next load, which
      // is the same failure mode as any logout button when offline.
      error: () => this.currentUser.set(null),
    });
  }
}
