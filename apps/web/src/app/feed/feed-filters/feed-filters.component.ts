import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  effect,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TrendingPost } from '../feed.service';

@Component({
  selector: 'app-feed-filters',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './feed-filters.component.html',
  styleUrl: './feed-filters.component.scss',
})
export class FeedFiltersComponent {
  @Input() sources: string[] = [];
  @Input() trending: TrendingPost[] = [];
  @Input() activeSources: string[] = [];
  @Input() activeDate: string | null = null;

  /** Emits just the source that was toggled, not the computed next array --
   * this.activeSources is an @Input(), only refreshed by Angular's next
   * change-detection pass, so computing "next" here from a rapid back-to-
   * back series of toggles (two checkboxes clicked in the same JS task) can
   * read a stale value and silently drop one of them. The parent owns a
   * real signal() and can compute "next" from its own always-current value
   * instead. */
  @Output() sourceToggle = new EventEmitter<string>();
  @Output() sourcesCleared = new EventEmitter<void>();
  @Output() dateChange = new EventEmitter<string | null>();
  @Output() search = new EventEmitter<string>();

  private searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  filterPanelOpen = signal(false);
  searchOpen = signal(false);
  searchText = '';

  constructor(private host: ElementRef<HTMLElement>) {
    // Reactive query -- the input only exists in the DOM while searchOpen()
    // is true, so this fires (and focuses) each time it actually appears.
    effect(() => {
      this.searchBox()?.nativeElement.focus();
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.filterPanelOpen.set(false);
      this.searchOpen.set(false);
    }
  }

  toggleFilterPanel() {
    this.filterPanelOpen.update((open) => !open);
    this.searchOpen.set(false);
  }

  toggleSearch() {
    this.searchOpen.update((open) => !open);
    this.filterPanelOpen.set(false);
    if (!this.searchOpen()) this.searchText = '';
  }

  isSourceChecked(source: string): boolean {
    return this.activeSources.includes(source);
  }

  toggleSource(source: string) {
    this.sourceToggle.emit(source);
  }

  clearSources() {
    this.sourcesCleared.emit();
  }

  onSearchKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    const query = this.searchText.trim();
    if (query) this.search.emit(query);
  }

  pickTrending(item: TrendingPost) {
    this.searchText = item.title;
    this.search.emit(item.title);
  }

  onDateInput(value: string) {
    this.dateChange.emit(value || null);
  }
}
