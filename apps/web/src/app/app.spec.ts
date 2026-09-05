import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';

describe('App', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** FeedComponent's ngOnInit fires three requests: the feed itself, the
   * source-filter list, and trending suggestions. */
  function flushFeedRequests() {
    httpMock.expectOne((req) => req.url.endsWith('/feed')).flush([]);
    httpMock.expectOne((req) => req.url.endsWith('/feed/sources')).flush([]);
    httpMock.expectOne((req) => req.url.endsWith('/feed/trending')).flush([]);
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
    expect(compiled.querySelector('h1')?.textContent).toContain('AI');
  });
});
