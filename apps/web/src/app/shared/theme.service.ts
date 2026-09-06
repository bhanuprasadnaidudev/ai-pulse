import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'ai-pulse:theme';

/** Root-provided so the sidebar's theme toggle (AppComponent) and every
 * component that renders in either theme (everything, via the CSS custom
 * properties in styles.scss) share one source of truth -- same shape as
 * FeedLayoutService. The click-based toggle the user asked for is literal:
 * light -> dark -> light on each click, no in-between "system" state once
 * someone has actually clicked it (system preference only applies before
 * that, as the initial value -- see load()). */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.load());

  constructor() {
    // Runs the moment App's constructor injects this service -- before the
    // first real paint -- so the <html data-theme> attribute is already
    // correct by the time any component's styles apply, instead of
    // flashing the light palette first.
    effect(() => {
      document.documentElement.setAttribute('data-theme', this.theme());
    });
  }

  toggle() {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme) {
    this.theme.set(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Private browsing / storage disabled -- the toggle still works for this session.
    }
  }

  private load(): Theme {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      // Fall through to system preference.
    }
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
}
