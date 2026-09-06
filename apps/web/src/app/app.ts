import { Component, Signal, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavItemComponent } from './shared/ui/nav-item/nav-item.component';
import { FabComponent } from './shared/ui/fab/fab.component';
import { FeedComponent } from './feed/feed.component';
import { FeedLayoutService, FeedLayout } from './feed/feed-layout.service';

const SIDEBAR_COLLAPSED_KEY = 'ai-pulse:sidebar-collapsed';

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavItemComponent, FabComponent, FeedComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  collapsed = signal(readStoredCollapsed());

  /** The feed's layout picker lives here in the sidebar rather than in the
   * feed's own toolbar, so the state it drives is owned by a shared service
   * -- FeedComponent isn't a child of this component, an @Input() can't
   * reach it. Assigned in the constructor body, not as a field initializer:
   * field initializers run before parameter properties are assigned, so
   * `this.layoutService` isn't set yet at that point. */
  layoutMode!: Signal<FeedLayout>;

  constructor(private layoutService: FeedLayoutService) {
    this.layoutMode = this.layoutService.mode;
  }

  toggleSidebar() {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    } catch {
      // Private browsing / storage disabled — not worth surfacing to the user.
    }
  }

  setLayout(mode: FeedLayout) {
    this.layoutService.set(mode);
  }
}
