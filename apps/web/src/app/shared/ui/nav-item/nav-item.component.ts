import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-nav-item',
  standalone: true,
  template: `<div
    [class]="'ui-nav-item ' + layout + (active ? ' active' : '') + (disabled ? ' disabled' : '')"
  >
    <ng-content></ng-content>
  </div>`,
  styleUrls: ['./nav-item.component.scss'],
})
export class NavItemComponent {
  @Input() active = false;
  @Input() disabled = false;
  /** 'column' (icon over label) for a mobile bottom bar, 'row' (icon beside label) for a sidebar. */
  @Input() layout: 'row' | 'column' = 'column';
}
