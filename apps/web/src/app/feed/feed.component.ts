import { Component, ElementRef, OnDestroy, OnInit, computed, effect, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardComponent } from '../shared/ui/card/card.component';
import { BadgeComponent } from '../shared/ui/badge/badge.component';
import { PostDetailModalComponent } from './post-detail-modal/post-detail-modal.component';
import { FeedService, FeedPost } from './feed.service';

const POLL_INTERVAL_MS = 3 * 60 * 1000;
const PAGE_SIZE = 20;

@Component({
  selector: 'app-feed',
  standalone: true,
  imports: [CommonModule, CardComponent, BadgeComponent, PostDetailModalComponent],
  templateUrl: './feed.component.html',
  styleUrl: './feed.component.scss',
})
export class FeedComponent implements OnInit, OnDestroy {
  /** Signal-based query -- unlike a decorator @ViewChild + ngAfterViewInit
   * (which fires exactly once, before the feed has loaded and while the
   * sentinel is still hidden behind the loading skeleton), this re-evaluates
   * whenever the sentinel enters/leaves the DOM, so the effect below
   * correctly attaches the observer once it actually exists. */
  private sentinelRef = viewChild<ElementRef<HTMLElement>>('sentinel');

  /** Just needs a stable length to @for over -- values are never read. */
  readonly skeletonPlaceholders = [0, 1, 2];

  posts = signal<FeedPost[]>([]);
  loading = signal(true);
  loadingMore = signal(false);
  allLoaded = signal(false);
  loadMoreError = signal<string | null>(null);
  hasBreaking = signal(false);
  errorMsg = signal<string | null>(null);
  selectedPost = signal<FeedPost | null>(null);

  /** Only the single most recent MAJOR post gets the badge + tilt treatment — per
   * the design spec, tilt/highlight accents should stay rare or it stops reading
   * as minimal. Posts are already sorted newest-first by the API. */
  topMajorPostId = computed(() => this.posts().find((p) => p.isMajor)?.id ?? null);

  private lastCheck = new Date().toISOString();
  private pollHandle?: ReturnType<typeof setInterval>;
  private observer?: IntersectionObserver;

  constructor(private feed: FeedService) {
    effect(() => {
      const el = this.sentinelRef();
      if (!el || this.observer || typeof IntersectionObserver === 'undefined') return;
      this.observer = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) this.loadMore();
      });
      this.observer.observe(el.nativeElement);
    });
  }

  ngOnInit() {
    this.loadInitial();
    this.pollHandle = setInterval(() => this.checkForUpdates(), POLL_INTERVAL_MS);
  }

  ngOnDestroy() {
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.observer?.disconnect();
  }

  loadInitial() {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.allLoaded.set(false);
    this.feed.getFeed(undefined, PAGE_SIZE).subscribe({
      next: (posts) => {
        this.posts.set(posts);
        this.loading.set(false);
        if (posts.length < PAGE_SIZE) this.markAllLoaded();
      },
      error: () => {
        this.loading.set(false);
        this.errorMsg.set('Could not load the feed. Check your connection and try again.');
      },
    });
  }

  /** Triggered by scrolling near the bottom (via the sentinel + IntersectionObserver),
   * not a manual button click. */
  loadMore() {
    if (this.loadingMore() || this.allLoaded() || this.loading()) return;
    const oldest = this.posts().at(-1)?.publishedAt;
    if (!oldest) return;

    this.loadingMore.set(true);
    this.loadMoreError.set(null);
    this.feed.getFeed(oldest, PAGE_SIZE).subscribe({
      next: (more) => {
        this.posts.update((current) => [...current, ...more]);
        this.loadingMore.set(false);
        if (more.length < PAGE_SIZE) this.markAllLoaded();
      },
      error: () => {
        this.loadingMore.set(false);
        this.loadMoreError.set('Could not load more posts.');
      },
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

  private markAllLoaded() {
    this.allLoaded.set(true);
    this.observer?.disconnect();
    this.observer = undefined;
  }

  refresh() {
    this.hasBreaking.set(false);
    this.lastCheck = new Date().toISOString();
    this.loadInitial();
  }

  openDetail(post: FeedPost) {
    this.selectedPost.set(post);
  }

  closeDetail() {
    this.selectedPost.set(null);
  }
}
