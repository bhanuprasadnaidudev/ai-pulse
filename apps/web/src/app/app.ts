import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavItemComponent } from './shared/ui/nav-item/nav-item.component';
import { FabComponent } from './shared/ui/fab/fab.component';
import { FeedComponent } from './feed/feed.component';

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

  toggleSidebar() {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    } catch {
      // Private browsing / storage disabled — not worth surfacing to the user.
    }
  }
}
