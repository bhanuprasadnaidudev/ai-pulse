import { Component, ElementRef, HostListener, OnInit, Signal, computed, effect, signal, viewChild } from '@angular/core';
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
import { AccountPageComponent } from './auth/account-page/account-page.component';

const SIDEBAR_COLLAPSED_KEY = 'ai-pulse:sidebar-collapsed';
// Full-page routes that hide the app shell entirely (sidebar + feed) --
// rendered through the app's one <router-outlet>. /account is deliberately
// NOT here: it shows the shell (see app.routes.ts's comment on why it's
// swapped into .content directly instead of being a routed component).
const NO_SHELL_ROUTES = ['/login', '/signup', '/complete-profile'];
const ACCOUNT_ROUTE = '/account';

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function currentPath(router: Router): string {
  return router.url.split('?')[0];
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, NavItemComponent, FabComponent, PageLoaderComponent, FeedComponent, AccountPageComponent],
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

  /** The always-mounted shell (sidebar + feed/account) hides on the
   * full-page routes (login/signup/complete-profile) instead of the app
   * conditionally routing between "shell" and "full page" layouts -- this
   * is the one thing that needs to know which mode it's in. Properly
   * unmounts FeedComponent while on one of those routes (no wasted
   * fetch/poll), which a fixed overlay would not do. */
  hideShell: Signal<boolean>;
  /** True on /account specifically -- swaps .content's child between
   * AccountPageComponent and FeedComponent while the shell stays visible
   * for both (see app.routes.ts for why this isn't router-outlet driven). */
  isAccountRoute: Signal<boolean>;
  /** Everything actually needed to safely show the shell: we know whether
   * there's a session (authChecked), there is one (currentUser), and it
   * doesn't still need the forced password step. Gating the template on
   * this (rather than just hideShell) means there's never a frame where
   * the feed/account page flashes before the redirect effect below sends
   * an unauthenticated visitor to /login. */
  readyForShell: Signal<boolean>;

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
  authChecked!: Signal<boolean>;
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
    this.authChecked = this.authService.authChecked;
    this.authBusy = this.authService.authenticating;

    this.hideShell = toSignal(
      this.router.events.pipe(
        filter((e) => e instanceof NavigationEnd),
        map(() => NO_SHELL_ROUTES.includes(currentPath(this.router))),
      ),
      { initialValue: NO_SHELL_ROUTES.includes(currentPath(this.router)) },
    );

    this.isAccountRoute = toSignal(
      this.router.events.pipe(
        filter((e) => e instanceof NavigationEnd),
        map(() => currentPath(this.router) === ACCOUNT_ROUTE),
      ),
      { initialValue: currentPath(this.router) === ACCOUNT_ROUTE },
    );

    this.readyForShell = computed(
      () => this.authChecked() && !!this.currentUser() && !this.currentUser()!.needsPassword,
    );

    // The whole app requires being signed in -- this is the single place
    // that decides where any given combination of (session state, current
    // route) actually belongs, so every entry point (a fresh visit with no
    // cookie, a successful Google/email sign-in, a still-incomplete Google
    // signup, an already-signed-in user opening /login directly) converges
    // on the same rules instead of each page having to know all of them.
    effect(() => {
      if (!this.authChecked()) return; // don't redirect on the very first, still-unresolved tick
      const user = this.currentUser();
      const path = currentPath(this.router);

      if (!user) {
        if (path !== '/login' && path !== '/signup') this.router.navigateByUrl('/login');
        return;
      }
      if (user.needsPassword) {
        if (path !== '/complete-profile') this.router.navigateByUrl('/complete-profile');
        return;
      }
      // Fully signed in -- these three only ever make sense when you
      // aren't, so bounce back into the app instead of leaving them
      // reachable (e.g. by typing the URL) once signed in.
      if (path === '/login' || path === '/signup' || path === '/complete-profile') {
        this.router.navigateByUrl('/');
      }
    });

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
