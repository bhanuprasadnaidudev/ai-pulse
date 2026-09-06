import { Component, OnInit, Signal, computed, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
  savedLoading = signal(true);

  constructor(
    private auth: AuthService,
    private router: Router,
    private saved: SavedService,
  ) {
    this.currentUser = this.auth.currentUser;
    this.initials = computed(() => initialsFrom(this.currentUser()?.name));
  }

  ngOnInit() {
    this.saved.list().subscribe({
      next: (posts) => {
        this.savedPosts.set(posts);
        this.savedLoading.set(false);
      },
      error: () => this.savedLoading.set(false),
    });
  }

  unsave(postId: string) {
    this.saved.unsave(postId);
    this.savedPosts.update((posts) => posts.filter((p) => p.id !== postId));
  }

  signOut() {
    this.auth.logout();
    this.router.navigateByUrl('/');
  }
}
