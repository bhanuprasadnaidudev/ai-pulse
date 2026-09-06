import { Component, ElementRef, HostListener, OnInit, Signal, effect, signal, viewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavItemComponent } from './shared/ui/nav-item/nav-item.component';
import { FabComponent } from './shared/ui/fab/fab.component';
import { FeedComponent } from './feed/feed.component';
import { FeedLayoutService, FeedLayout } from './feed/feed-layout.service';
import { AuthService, AuthUser } from './auth/auth.service';

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
export class App implements OnInit {
  collapsed = signal(readStoredCollapsed());
  youPanelOpen = signal(false);

  /** Signal-based query, not @ViewChild + ngAfterViewInit -- the container
   * only exists in the DOM once youPanelOpen() is true, and this needs to
   * re-fire every time it (re)appears so the Google button actually gets
   * rendered into it, not just the first time. Same pattern already used
   * for the search box in FeedFiltersComponent. */
  private googleButtonContainer = viewChild<ElementRef<HTMLElement>>('googleButtonContainer');
  private youWrapper = viewChild<ElementRef<HTMLElement>>('youWrapper');

  /** The feed's layout picker lives here in the sidebar rather than in the
   * feed's own toolbar, so the state it drives is owned by a shared service
   * -- FeedComponent isn't a child of this component, an @Input() can't
   * reach it. Assigned in the constructor body, not as a field initializer:
   * field initializers run before parameter properties are assigned, so
   * `this.layoutService` isn't set yet at that point. */
  layoutMode!: Signal<FeedLayout>;
  currentUser!: Signal<AuthUser | null>;

  constructor(
    private layoutService: FeedLayoutService,
    private authService: AuthService,
  ) {
    this.layoutMode = this.layoutService.mode;
    this.currentUser = this.authService.currentUser;

    effect(() => {
      const el = this.googleButtonContainer();
      if (el) this.authService.renderGoogleButton(el.nativeElement);
    });
  }

  ngOnInit() {
    this.authService.init();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const wrapper = this.youWrapper()?.nativeElement;
    if (this.youPanelOpen() && wrapper && !wrapper.contains(event.target as Node)) {
      this.youPanelOpen.set(false);
    }
  }

  toggleYouPanel() {
    this.youPanelOpen.update((open) => !open);
  }

  signOut() {
    this.authService.logout();
    this.youPanelOpen.set(false);
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
