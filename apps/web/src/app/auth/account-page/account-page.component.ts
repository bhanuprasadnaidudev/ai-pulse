import { Component, OnInit, Signal, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService, AuthUser } from '../auth.service';
import { SavedService, SavedPost } from '../../saved/saved.service';
import { initialsFrom } from '../../shared/initials';

/** Reachable only while signed in -- App's redirect effect sends anyone
 * without a session to /login before this ever mounts, so the "not signed
 * in" branch that used to live here is gone; the @else fallback below is
 * just a defensive sliver for the instant before that redirect lands. */
@Component({
  selector: 'app-account-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './account-page.component.html',
  styleUrl: './account-page.component.scss',
})
export class AccountPageComponent implements OnInit {
  currentUser: Signal<AuthUser | null>;
  /** Avatar fallback for an account with no Google picture. */
  initials: Signal<string>;
  savedPosts = signal<SavedPost[]>([]);
  savedTotal = signal(0);
  savedLoading = signal(true);

  constructor(
    private auth: AuthService,
    private saved: SavedService,
  ) {
    this.currentUser = this.auth.currentUser;
    this.initials = computed(() => initialsFrom(this.currentUser()?.name));
  }

  ngOnInit() {
    this.saved.list().subscribe({
      next: (res) => {
        this.savedPosts.set(res.posts);
        this.savedTotal.set(res.total);
        this.savedLoading.set(false);
      },
      error: () => this.savedLoading.set(false),
    });
  }

  unsave(postId: string) {
    this.saved.unsave(postId);
    this.savedPosts.update((posts) => posts.filter((p) => p.id !== postId));
    this.savedTotal.update((n) => Math.max(0, n - 1));
  }

  signOut() {
    // No navigation here on purpose. AuthService.logout() clears the user
    // synchronously, and App's redirect effect is the single place that
    // decides where a given (session, route) pair belongs -- it sends a
    // signed-out visitor on /account to /login. Navigating to '/' as well
    // just raced that, showing the feed for a frame first.
    this.auth.logout();
  }
}
