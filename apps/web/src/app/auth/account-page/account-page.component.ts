import { Component, Signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService, AuthUser } from '../auth.service';

/** A full page (shell hidden, same family as /login and /signup) rather
 * than another sidebar flyout -- the sidebar's account icon just navigates
 * here, matching how the layout icon opens an in-place flyout but the
 * account icon opens a real page with real content and its own "back to
 * feed" link. Doubles as the landing spot for someone who clicks the
 * account icon while signed out, rather than only being reachable once
 * signed in. */
@Component({
  selector: 'app-account-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './account-page.component.html',
  styleUrl: './account-page.component.scss',
})
export class AccountPageComponent {
  currentUser: Signal<AuthUser | null>;

  constructor(
    private auth: AuthService,
    private router: Router,
  ) {
    this.currentUser = this.auth.currentUser;
  }

  signOut() {
    this.auth.logout();
    this.router.navigateByUrl('/');
  }
}
