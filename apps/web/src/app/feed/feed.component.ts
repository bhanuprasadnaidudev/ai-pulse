import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardComponent } from '../shared/ui/card/card.component';
import { BadgeComponent } from '../shared/ui/badge/badge.component';
import { ButtonComponent } from '../shared/ui/button/button.component';
import { FeedService, FeedPost } from './feed.service';

const POLL_INTERVAL_MS = 3 * 60 * 1000;

@Component({
  selector: 'app-feed',
  standalone: true,
  imports: [CommonModule, FormsModule, CardComponent, BadgeComponent, ButtonComponent],
  templateUrl: './feed.component.html',
  styleUrl: './feed.component.scss',
})
export class FeedComponent implements OnInit, OnDestroy {
  posts = signal<FeedPost[]>([]);
  loading = signal(true);
  loadingMore = signal(false);
  hasBreaking = signal(false);
  errorMsg = signal<string | null>(null);
  dateFilter = '';

  private lastCheck = new Date().toISOString();
  private pollHandle?: ReturnType<typeof setInterval>;

  constructor(private feed: FeedService) {}

  ngOnInit() {
    this.loadInitial();
    this.pollHandle = setInterval(() => this.checkForUpdates(), POLL_INTERVAL_MS);
  }

  ngOnDestroy() {
    if (this.pollHandle) clearInterval(this.pollHandle);
  }

  loadInitial() {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.feed.getFeed().subscribe({
      next: (posts) => {
        this.posts.set(posts);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMsg.set('Could not load the feed. Check your connection and try again.');
      },
    });
  }

  loadMore() {
    const oldest = this.posts().at(-1)?.publishedAt;
    if (!oldest || this.loadingMore()) return;

    this.loadingMore.set(true);
    this.feed.getFeed(oldest).subscribe({
      next: (more) => {
        this.posts.update((current) => [...current, ...more]);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  checkForUpdates() {
    this.feed.hasUpdates(this.lastCheck).subscribe({
      next: (res) => {
        if (res.major) this.hasBreaking.set(true);
      },
      error: () => {
        // A missed poll isn't worth surfacing to the user — it'll just retry next interval.
      },
    });
  }

  refresh() {
    this.hasBreaking.set(false);
    this.lastCheck = new Date().toISOString();
    this.loadInitial();
  }

  jumpToDate(date: string) {
    if (!date) {
      this.loadInitial();
      return;
    }
    this.loading.set(true);
    this.errorMsg.set(null);
    this.feed.getByDate(date).subscribe({
      next: (posts) => {
        this.posts.set(posts);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMsg.set('Could not load posts for that date.');
      },
    });
  }

  clearDateFilter() {
    this.dateFilter = '';
    this.loadInitial();
  }
}
