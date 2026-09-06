import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** FeedComponent's ngOnInit fires three requests (the feed itself, the
   * source-filter list, trending suggestions), and App's own ngOnInit fires
   * a fourth to restore any existing session -- flushed here as a 401
   * (not logged in), the default/normal case for a fresh test run. */
  function flushFeedRequests() {
    httpMock.expectOne((req) => req.url.endsWith('/feed')).flush([]);
    httpMock.expectOne((req) => req.url.endsWith('/feed/sources')).flush([]);
    httpMock.expectOne((req) => req.url.endsWith('/feed/trending')).flush([]);
    httpMock
      .expectOne((req) => req.url.endsWith('/auth/me'))
      .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
  }

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
    flushFeedRequests();
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushFeedRequests();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Current');
  });
});
