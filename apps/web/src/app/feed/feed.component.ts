import { Component, ElementRef, OnDestroy, OnInit, computed, effect, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { CardComponent } from '../shared/ui/card/card.component';
import { BadgeComponent } from '../shared/ui/badge/badge.component';
import { PostDetailModalComponent } from './post-detail-modal/post-detail-modal.component';
import { FeedFiltersComponent } from './feed-filters/feed-filters.component';
import { FeedService, FeedPost, TrendingPost } from './feed.service';

const POLL_INTERVAL_MS = 3 * 60 * 1000;
const PAGE_SIZE = 20;

@Component({
  selector: 'app-feed',
  standalone: true,
  imports: [CommonModule, CardComponent, BadgeComponent, PostDetailModalComponent, FeedFiltersComponent],
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

  /** Varying line counts so the skeleton set has some of the same height
   * variety real (masonry) cards do, instead of every placeholder being an
   * identical short block that visibly jumps once real content swaps in. */
  readonly skeletonCards: ReadonlyArray<{ bodyLines: number[] }> = [
    { bodyLines: [1, 2, 3] },
    { bodyLines: [1, 2, 3, 4] },
    { bodyLines: [1, 2] },
    { bodyLines: [1, 2, 3, 4] },
    { bodyLines: [1, 2, 3] },
    { bodyLines: [1, 2] },
  ];

  posts = signal<FeedPost[]>([]);
  loading = signal(true);
  loadingMore = signal(false);
  allLoaded = signal(false);
  loadMoreError = signal<string | null>(null);
  hasBreaking = signal(false);
  errorMsg = signal<string | null>(null);
  selectedPost = signal<FeedPost | null>(null);

  sources = signal<string[]>([]);
  trending = signal<TrendingPost[]>([]);
  activeSource = signal<string | null>(null);
  activeDate = signal<string | null>(null);
  activeQuery = signal<string | null>(null);

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
    this.feed.getSources().subscribe({ next: (s) => this.sources.set(s), error: () => {} });
    this.feed.getTrending().subscribe({ next: (t) => this.trending.set(t), error: () => {} });
  }

  ngOnDestroy() {
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.observer?.disconnect();
  }

  /** Routes to the right endpoint for whichever filter mode is active.
   * Search and date-jump are mutually exclusive views; source narrows
   * whichever one is active. */
  private fetchPage(before?: string): Observable<FeedPost[]> {
    const source = this.activeSource();
    const query = this.activeQuery();
    const date = this.activeDate();

    if (query) return this.feed.search(query, before, PAGE_SIZE, source);
    if (date) return this.feed.getByDate(date, source);
    return this.feed.getFeed(before, PAGE_SIZE, source);
  }

  loadInitial() {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.allLoaded.set(false);
    this.fetchPage().subscribe({
      next: (posts) => {
        this.posts.set(posts);
        this.loading.set(false);
        // Date-jump returns the whole day in one shot -- nothing to page through.
        if (this.activeDate() || posts.length < PAGE_SIZE) this.markAllLoaded();
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
    this.fetchPage(oldest).subscribe({
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

  private markAllLoaded() {
    this.allLoaded.set(true);
    this.observer?.disconnect();
    this.observer = undefined;
  }

  private resetAndReload() {
    this.posts.set([]);
    this.allLoaded.set(false);
    this.loadMoreError.set(null);
    this.loadInitial();
  }

  onSourceChange(source: string | null) {
    this.activeSource.set(source);
    this.resetAndReload();
  }

  onDateChange(date: string | null) {
    this.activeDate.set(date);
    this.activeQuery.set(null);
    this.resetAndReload();
  }

  onSearch(query: string) {
    this.activeQuery.set(query);
    this.activeDate.set(null);
    this.resetAndReload();
  }

  clearSource() {
    this.onSourceChange(null);
  }

  clearDate() {
    this.onDateChange(null);
  }

  clearSearch() {
    this.activeQuery.set(null);
    this.resetAndReload();
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

  openDetail(post: FeedPost) {
    this.selectedPost.set(post);
  }

  closeDetail() {
    this.selectedPost.set(null);
  }
}
