import { AfterViewInit, Directive, ElementRef, Input, OnDestroy } from '@angular/core';

/** Height of one grid row track, in px. Cards span a whole number of
 * these, so the unit is also the worst-case rounding error on the gap
 * below each card: at 8px the gaps measured 16-23px, which is visible.
 * 4px halves that to 16-19px, for the cost of twice as many (empty,
 * cheap) implicit row tracks. */
const ROW_UNIT_PX = 4;
/** Vertical space between stacked cards. Baked into each card's span
 * rather than set as row-gap, because row-gap would apply between every
 * one of the many small row tracks a card spans, not between cards. */
const VERTICAL_GAP_PX = 16;

/** True masonry for the grid layout: each card starts directly under the
 * one above it in its own column, instead of every card in a row waiting
 * for the tallest one to finish.
 *
 * CSS can't do this on its own yet. `grid-template-rows: masonry` is still
 * behind a flag in one browser, and CSS multi-column -- the other way to
 * get this packing -- fills each column top-to-bottom, which puts the
 * second-newest story at the *bottom left* rather than next to the newest.
 * Reading order was the whole reason that got replaced.
 *
 * So: a grid of many tiny row tracks, with each card spanning as many as
 * its own height needs. DOM order is preserved, so the feed still reads
 * left-to-right, and cards pack upward with no dead space. */
@Directive({
  selector: '[appMasonry]',
  standalone: true,
})
export class MasonryDirective implements AfterViewInit, OnDestroy {
  /** Off in the timeline layouts, which aren't a grid at all. */
  @Input({ alias: 'appMasonry' }) enabled = false;

  private resizeObserver?: ResizeObserver;
  private mutationObserver?: MutationObserver;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit() {
    if (typeof ResizeObserver === 'undefined') return; // no layout, rather than a crash

    // Each card is measured individually, so text reflowing at a new width
    // (or a late-loading font changing line counts) re-packs just that
    // card rather than needing a full recalculation pass.
    this.resizeObserver = new ResizeObserver(() => this.layout());
    // Cards arrive asynchronously and keep arriving as more pages load,
    // so new children have to be picked up as they appear.
    this.mutationObserver = new MutationObserver(() => this.observeChildren());

    this.mutationObserver.observe(this.host.nativeElement, { childList: true });
    this.observeChildren();
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
  }

  private observeChildren() {
    if (!this.resizeObserver) return;
    this.resizeObserver.disconnect();
    for (const child of Array.from(this.host.nativeElement.children)) {
      this.resizeObserver.observe(child);
    }
    this.layout();
  }

  private layout() {
    const grid = this.host.nativeElement;

    for (const child of Array.from(grid.children) as HTMLElement[]) {
      if (!this.enabled) {
        child.style.removeProperty('grid-row-end');
        continue;
      }
      // offsetHeight, not getBoundingClientRect(): the "major" card is
      // rotated a degree, and a rotated element's bounding box is taller
      // than the card actually is, which would leave a gap under it.
      const span = Math.ceil((child.offsetHeight + VERTICAL_GAP_PX) / ROW_UNIT_PX);
      child.style.gridRowEnd = `span ${span}`;
    }
  }
}
