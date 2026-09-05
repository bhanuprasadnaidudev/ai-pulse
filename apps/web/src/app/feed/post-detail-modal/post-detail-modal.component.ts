import { Component, EventEmitter, HostListener, Input, OnInit, Output, computed, signal } from '@angular/core';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { FeedService, FeedPost } from '../feed.service';

interface BreakdownLine {
  label: string;
  text: string;
}

@Component({
  selector: 'app-post-detail-modal',
  standalone: true,
  imports: [BadgeComponent],
  templateUrl: './post-detail-modal.component.html',
  styleUrl: './post-detail-modal.component.scss',
})
export class PostDetailModalComponent implements OnInit {
  @Input({ required: true }) post!: FeedPost;
  @Output() closed = new EventEmitter<void>();

  loading = signal(true);
  error = signal<string | null>(null);
  detail = signal<string | null>(null);

  parsedLines = computed<BreakdownLine[]>(() =>
    (this.detail() ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const idx = line.indexOf(':');
        if (idx > 0 && idx < 30) {
          return { label: line.slice(0, idx), text: line.slice(idx + 1).trim() };
        }
        return { label: '', text: line };
      }),
  );

  constructor(private feed: FeedService) {}

  ngOnInit() {
    this.feed.getDetail(this.post.id).subscribe({
      next: (res) => {
        this.detail.set(res.detail);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load the breakdown. Try the original source below.');
      },
    });
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.close();
  }

  close() {
    this.closed.emit();
  }
}
