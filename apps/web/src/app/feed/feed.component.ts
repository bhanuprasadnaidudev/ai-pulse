import { Component, ElementRef, OnDestroy, OnInit, Signal, computed, effect, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { PostDetailModalComponent } from './post-detail-modal/post-detail-modal.component';
import { FeedFiltersComponent } from './feed-filters/feed-filters.component';
import { FeedLayoutService, FeedLayout } from './feed-layout.service';
import { FeedService, FeedPost, TrendingPost } from './feed.service';
import { SavedService } from '../saved/saved.service';
import { MasonryDirective } from './masonry.directive';

const POLL_INTERVAL_MS = 3 * 60 * 1000;
const PAGE_SIZE = 20;

@Component({
  selector: 'app-feed',
  standalone: true,
  imports: [CommonModule, PostDetailModalComponent, FeedFiltersComponent, MasonryDirective],
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
  activeSources = signal<string[]>([]);
  activeDate = signal<string | null>(null);
  activeQuery = signal<string | null>(null);

  /** Only the single most recent MAJOR post gets the badge treatment — per the
   * design spec, highlight accents should stay rare or it stops reading as
   * minimal. Posts are already sorted newest-first by the API. */
  topMajorPostId = computed(() => this.posts().find((p) => p.isMajor)?.id ?? null);

  private readonly todayKey = new Date().toDateString();

  isToday(publishedAt: string): boolean {
    return new Date(publishedAt).toDateString() === this.todayKey;
  }

  /** Cheap membership check against the small trending list (top 6, already
   * loaded) rather than a per-post API flag. */
  isTrending(id: string): boolean {
    return this.trending().some((t) => t.id === id);
  }

  isSaved(id: string): boolean {
    return this.saved.isSaved(id);
  }

  toggleSave(id: string) {
    this.saved.toggle(id);
  }

  /** Owned by FeedLayoutService, not this component -- the picker that sets
   * it now lives in the sidebar (AppComponent), which isn't a parent/child
   * of this component. Exposed as a plain property so the template can still
   * call layoutMode() exactly as if it were a local signal. Assigned in the
   * constructor body: field initializers run before parameter properties
   * are assigned, so `this.layoutService` isn't set yet up here. */
  layoutMode!: Signal<FeedLayout>;

  private lastCheck = new Date().toISOString();
  private pollHandle?: ReturnType<typeof setInterval>;
  private observer?: IntersectionObserver;
  /** Cancels the previous in-flight fetch whenever a new one starts -- without
   * this, rapid filter changes (two checkboxes ticked in quick succession, a
   * new search fired before the last one resolved) can have an earlier
   * request's response land *after* a later one's and silently overwrite the
   * feed with stale, filter-mismatched results. */
  private fetchSub?: Subscription;

  constructor(
    private feed: FeedService,
    private layoutService: FeedLayoutService,
    private saved: SavedService,
  ) {
    this.layoutMode = this.layoutService.mode;

    effect(() => {
      const el = this.sentinelRef();
      if (!el || this.observer || typeof IntersectionObserver === 'undefined') return;
      this.observer = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) this.loadMore();
      });
      this.observer.observe(el.nativeElement);
    });

    // Scroll-snap has to live on the real scrolling element -- the whole
    // document, since .content has no overflow of its own -- so it's toggled
    // globally rather than on some wrapper inside this component's template.
    effect(() => {
      document.documentElement.classList.toggle('feed-focus-scroll', this.layoutMode() === 'focus');
    });
  }

  ngOnInit() {
    this.loadInitial();
    this.pollHandle = setInterval(() => this.checkForUpdates(), POLL_INTERVAL_MS);
    this.feed.getSources().subscribe({ next: (s) => this.sources.set(s), error: () => {} });
    this.feed.getTrending().subscribe({ next: (t) => this.trending.set(t), error: () => {} });
    // Safe to always call now -- FeedComponent only ever mounts once the
    // app-level auth guard has confirmed a signed-in user.
    this.saved.loadIds();
  }

  ngOnDestroy() {
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.observer?.disconnect();
    this.fetchSub?.unsubscribe();
    document.documentElement.classList.remove('feed-focus-scroll');
  }

  /** Routes to the right endpoint for whichever filter mode is active.
   * Search and date-jump are mutually exclusive views; source narrows
   * whichever one is active. */
  private fetchPage(before?: string): Observable<FeedPost[]> {
    const sources = this.activeSources();
    const query = this.activeQuery();
    const date = this.activeDate();

    if (query) return this.feed.search(query, before, PAGE_SIZE, sources);
    if (date) return this.feed.getByDate(date, sources);
    return this.feed.getFeed(before, PAGE_SIZE, sources);
  }

  loadInitial() {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.allLoaded.set(false);
    this.fetchSub?.unsubscribe();
    this.fetchSub = this.fetchPage().subscribe({
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
    this.fetchSub?.unsubscribe();
    this.fetchSub = this.fetchPage(oldest).subscribe({
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

  /** Reads and writes this.activeSources() directly (a real signal, not an
   * @Input() that only refreshes on Angular's next change-detection pass) --
   * so even two toggles fired back-to-back in the same JS task each see the
   * other's result, instead of both computing "next" from the same stale
   * starting array and one silently clobbering the other. */
  onSourceToggle(source: string) {
    const current = this.activeSources();
    const next = current.includes(source) ? current.filter((s) => s !== source) : [...current, source];
    this.activeSources.set(next);
    this.resetAndReload();
  }

  onSourcesCleared() {
    this.activeSources.set([]);
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

  removeSource(source: string) {
    this.activeSources.set(this.activeSources().filter((s) => s !== source));
    this.resetAndReload();
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
