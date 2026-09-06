import { Injectable, signal } from '@angular/core';

export type FeedLayout = 'grid' | 'continuous' | 'focus';

const LAYOUT_KEY = 'ai-pulse:feed-layout';

/** Shared between AppComponent (the sidebar's layout picker lives there) and
 * FeedComponent (which actually applies the layout) -- they aren't parent/
 * child, so a plain @Input()/@Output() pair doesn't reach between them. A
 * root-provided service with a signal is the idiomatic Angular way to share
 * this kind of cross-component UI state without prop-drilling it through
 * every component in between. */
@Injectable({ providedIn: 'root' })
export class FeedLayoutService {
  readonly mode = signal<FeedLayout>(this.load());

  private load(): FeedLayout {
    try {
      const stored = localStorage.getItem(LAYOUT_KEY);
      return stored === 'grid' || stored === 'focus' ? stored : 'continuous';
    } catch {
      return 'continuous';
    }
  }

  set(mode: FeedLayout) {
    this.mode.set(mode);
    try {
      localStorage.setItem(LAYOUT_KEY, mode);
    } catch {
      // Private browsing / storage disabled -- the picker still works for this session.
    }
  }
}
