import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import type { FeedPost } from '../feed/feed.service';

export interface SavedPost extends FeedPost {
  savedAt: string;
}

const SAVED_BASE = environment.savedBaseUrl;

/** The whole app requires being signed in (see App's redirect effect), so
 * every screen that shows posts can assume this is usable -- no separate
 * "are you logged in" branch needed here. */
@Injectable({ providedIn: 'root' })
export class SavedService {
  /** Just the ids -- loaded once (FeedComponent calls loadIds() on init)
   * and kept in sync locally by toggle() rather than refetched on every
   * click, so a card's bookmark icon flips the instant you click it. */
  savedIds = signal<Set<string>>(new Set());

  constructor(private http: HttpClient) {}

  loadIds() {
    this.http.get<string[]>(`${SAVED_BASE}/ids`, { withCredentials: true }).subscribe({
      next: (ids) => this.savedIds.set(new Set(ids)),
      // A missed load isn't worth surfacing -- bookmark icons just default
      // to "unsaved" until the next page load, same tolerance as the
      // feed's own missed-poll handling.
      error: () => {},
    });
  }

  isSaved(postId: string): boolean {
    return this.savedIds().has(postId);
  }

  /** Optimistic -- the icon flips immediately and only rolls back if the
   * request actually fails, instead of waiting on a round-trip for a
   * click to visibly do anything. */
  save(postId: string) {
    this.savedIds.update((ids) => new Set(ids).add(postId));
    this.http.post(`${SAVED_BASE}/${postId}`, {}, { withCredentials: true }).subscribe({
      error: () =>
        this.savedIds.update((ids) => {
          const next = new Set(ids);
          next.delete(postId);
          return next;
        }),
    });
  }

  /** Unconditional (not "toggle off") -- used both by the feed's toggle
   * button and the account page's explicit "remove" action. The account
   * page can be reached without the feed ever having mounted (so
   * savedIds may still be empty/stale there), which is exactly why this
   * doesn't route through isSaved() to decide what to do -- it always
   * deletes. */
  unsave(postId: string) {
    this.savedIds.update((ids) => {
      const next = new Set(ids);
      next.delete(postId);
      return next;
    });
    this.http.delete(`${SAVED_BASE}/${postId}`, { withCredentials: true }).subscribe({
      error: () => this.savedIds.update((ids) => new Set(ids).add(postId)),
    });
  }

  toggle(postId: string) {
    if (this.isSaved(postId)) this.unsave(postId);
    else this.save(postId);
  }

  /** Full post data for the account page's "Saved posts" section --
   * unlike loadIds()/toggle(), fetched fresh each time that section opens
   * rather than cached, since it's viewed far less often than the feed.
   * `total` is separate from `posts.length` because the API caps how many
   * it returns, so the UI can say what it isn't showing. */
  list(): Observable<{ posts: SavedPost[]; total: number }> {
    return this.http.get<{ posts: SavedPost[]; total: number }>(SAVED_BASE, { withCredentials: true });
  }
}
