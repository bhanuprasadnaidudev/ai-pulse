import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-card',
  standalone: true,
  template: `<div class="ui-card" [style.transform]="tilt ? 'rotate(' + tilt + 'deg)' : null">
    <ng-content></ng-content>
  </div>`,
  styleUrls: ['./card.component.scss'],
})
export class CardComponent {
  @Input() tilt: number | null = null; // e.g. 0.8, -1.2 — use on at most one card per screen
}
