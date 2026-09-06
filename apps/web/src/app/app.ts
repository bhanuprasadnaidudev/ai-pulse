import { Component, ElementRef, HostListener, OnInit, Signal, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { NavItemComponent } from './shared/ui/nav-item/nav-item.component';
import { FabComponent } from './shared/ui/fab/fab.component';
import { PageLoaderComponent } from './shared/ui/page-loader/page-loader.component';
import { FeedComponent } from './feed/feed.component';
import { FeedLayoutService, FeedLayout } from './feed/feed-layout.service';
import { ThemeService, Theme } from './shared/theme.service';
import { AuthService, AuthUser } from './auth/auth.service';

const SIDEBAR_COLLAPSED_KEY = 'ai-pulse:sidebar-collapsed';
// Full-page routes that hide the app shell entirely (sidebar + feed) --
// /account joined /login and /signup here rather than getting a flyout,
// since "navigate to my account page" is a real page, not a popover.
const NO_SHELL_ROUTES = ['/login', '/signup', '/account'];

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, NavItemComponent, FabComponent, PageLoaderComponent, FeedComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  collapsed = signal(readStoredCollapsed());
  /** The layout-picker flyout in the sidebar bottom -- same click-outside-
   * closes convention the old "You" flyout used to use, now the only flyout
   * left in the sidebar (theme is a direct toggle, account is a real page). */
  layoutPanelOpen = signal(false);
  /** Set once from the `?verified=1` GET /auth/verify success redirect,
   * dismissible -- not re-derived from the route on every navigation, so
   * it doesn't reappear if the user navigates away and hits back. */
  justVerified = signal(false);

  private layoutWrapper = viewChild<ElementRef<HTMLElement>>('layoutWrapper');

  /** The always-mounted shell (sidebar + feed) hides on the full-page
   * routes instead of the app conditionally routing between "shell" and
   * "full page" layouts -- this is the one thing that needs to know which
   * mode it's in. Properly unmounts FeedComponent while on one of those
   * routes (no wasted fetch/poll), which a fixed overlay would not do. */
  hideShell: Signal<boolean>;

  /** The feed's layout picker, the theme toggle, and the signed-in user all
   * live in the sidebar (AppComponent) rather than inside FeedComponent's
   * own toolbar -- the state each one drives is owned by a shared service
   * since FeedComponent isn't a child of this component, an @Input() can't
   * reach it. Assigned in the constructor body, not as a field initializer:
   * field initializers run before parameter properties are assigned, so
   * `this.layoutService` isn't set yet at that point. */
  layoutMode!: Signal<FeedLayout>;
  theme!: Signal<Theme>;
  currentUser!: Signal<AuthUser | null>;
  /** True while a Google sign-in is being exchanged for a session --
   * drives the single full-page loader, see AuthService.authenticating. */
  authBusy!: Signal<boolean>;

  constructor(
    private layoutService: FeedLayoutService,
    private themeService: ThemeService,
    private authService: AuthService,
    private router: Router,
    route: ActivatedRoute,
  ) {
    this.layoutMode = this.layoutService.mode;
    this.theme = this.themeService.theme;
    this.currentUser = this.authService.currentUser;
    this.authBusy = this.authService.authenticating;

    this.hideShell = toSignal(
      this.router.events.pipe(
        filter((e) => e instanceof NavigationEnd),
        map(() => NO_SHELL_ROUTES.includes(this.router.url.split('?')[0])),
      ),
      { initialValue: NO_SHELL_ROUTES.includes(this.router.url.split('?')[0]) },
    );

    if (route.snapshot.queryParamMap.get('verified') === '1') {
      this.justVerified.set(true);
    }
  }

  ngOnInit() {
    this.authService.init();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const wrapper = this.layoutWrapper()?.nativeElement;
    if (this.layoutPanelOpen() && wrapper && !wrapper.contains(event.target as Node)) {
      this.layoutPanelOpen.set(false);
    }
  }

  toggleLayoutPanel() {
    this.layoutPanelOpen.update((open) => !open);
  }

  toggleTheme() {
    this.themeService.toggle();
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
    this.layoutPanelOpen.set(false);
  }
}
