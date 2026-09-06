import { Component, ElementRef, HostListener, OnInit, Signal, effect, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { NavItemComponent } from './shared/ui/nav-item/nav-item.component';
import { FabComponent } from './shared/ui/fab/fab.component';
import { FeedComponent } from './feed/feed.component';
import { FeedLayoutService, FeedLayout } from './feed/feed-layout.service';
import { AuthService, AuthUser } from './auth/auth.service';

const SIDEBAR_COLLAPSED_KEY = 'ai-pulse:sidebar-collapsed';
const AUTH_ROUTES = ['/login', '/signup'];

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, NavItemComponent, FabComponent, FeedComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  collapsed = signal(readStoredCollapsed());
  youPanelOpen = signal(false);
  /** Set once from the `?verified=1` GET /auth/verify success redirect,
   * dismissible -- not re-derived from the route on every navigation, so
   * it doesn't reappear if the user navigates away and hits back. */
  justVerified = signal(false);

  private youWrapper = viewChild<ElementRef<HTMLElement>>('youWrapper');

  /** The always-mounted shell (sidebar + feed) hides on the two auth
   * routes instead of the app conditionally routing between "shell" and
   * "auth page" layouts -- this is the one thing that needs to know which
   * mode it's in. Properly unmounts FeedComponent while on /login or
   * /signup (no wasted fetch/poll), unlike a fixed overlay would. */
  isAuthRoute: Signal<boolean>;

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
    private router: Router,
    route: ActivatedRoute,
  ) {
    this.layoutMode = this.layoutService.mode;
    this.currentUser = this.authService.currentUser;

    this.isAuthRoute = toSignal(
      this.router.events.pipe(
        filter((e) => e instanceof NavigationEnd),
        map(() => AUTH_ROUTES.includes(this.router.url.split('?')[0])),
      ),
      { initialValue: AUTH_ROUTES.includes(this.router.url.split('?')[0]) },
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
