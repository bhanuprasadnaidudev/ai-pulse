import { Component, Input } from '@angular/core';

/** One consistent, app-wide "something is happening" indicator -- a single
 * minimal spinner centered over the whole page. Exists so an async
 * operation with no other feedback of its own (e.g. exchanging a Google
 * credential for a session, which used to leave the UI looking totally
 * inert between picking an account and landing back in the app) always has
 * *something* visible on screen while it's in flight. */
@Component({
  selector: 'ui-page-loader',
  standalone: true,
  template: `
    <div class="page-loader-backdrop" role="status" aria-live="polite" aria-label="Loading">
      <span class="page-loader-spinner"></span>
      <span class="page-loader-label">{{ label }}</span>
    </div>
  `,
  styleUrl: './page-loader.component.scss',
})
export class PageLoaderComponent {
  /** Says which wait this is, so a slow sign-in doesn't look identical to
   * a slow session check. */
  @Input() label = 'Loading';
}
