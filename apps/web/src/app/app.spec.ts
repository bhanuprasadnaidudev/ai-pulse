import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

const TEST_USER = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  picture: null,
  needsPassword: false,
};

describe('App', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // Real routes, not an empty array -- the app-wide auth redirect (see
      // App's constructor effect) navigates to /login for a signed-out
      // visitor, which needs an actual matching route to resolve cleanly.
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();

    // No session -- the app-wide guard redirects to /login rather than
    // ever mounting the feed, so /auth/me is the only request to flush.
    httpMock
      .expectOne((req) => req.url.endsWith('/auth/me'))
      .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('should render the shell once a session is restored', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    httpMock.expectOne((req) => req.url.endsWith('/auth/me')).flush({ user: TEST_USER });
    // FeedComponent (and its own requests) only mount once readyForShell()
    // flips true from that response -- needs a render pass in between.
    fixture.detectChanges();

    httpMock.expectOne((req) => req.url.endsWith('/feed')).flush([]);
    httpMock.expectOne((req) => req.url.endsWith('/feed/sources')).flush([]);
    httpMock.expectOne((req) => req.url.endsWith('/feed/trending')).flush([]);
    httpMock.expectOne((req) => req.url.endsWith('/saved/ids')).flush([]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Current');
  });
});
