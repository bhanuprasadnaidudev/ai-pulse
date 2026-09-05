import { Component, ElementRef, EventEmitter, Input, Output, effect, signal, viewChild } from '@angular/core';
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
  @Input() activeSource: string | null = null;
  @Input() activeDate: string | null = null;

  @Output() sourceChange = new EventEmitter<string | null>();
  @Output() dateChange = new EventEmitter<string | null>();
  @Output() search = new EventEmitter<string>();

  private searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  searchOpen = signal(false);
  searchText = '';

  constructor() {
    // Reactive query -- the input only exists in the DOM while searchOpen()
    // is true, so this fires (and focuses) each time it actually appears.
    effect(() => {
      this.searchBox()?.nativeElement.focus();
    });
  }

  toggleSearch() {
    this.searchOpen.update((open) => !open);
    if (!this.searchOpen()) this.searchText = '';
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

  selectSource(source: string | null) {
    this.sourceChange.emit(source);
  }

  onDateInput(value: string) {
    this.dateChange.emit(value || null);
  }
}
