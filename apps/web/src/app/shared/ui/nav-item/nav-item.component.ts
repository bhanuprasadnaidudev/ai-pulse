import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-nav-item',
  standalone: true,
  template: `<div [class]="'ui-nav-item' + (active ? ' active' : '')">
    <ng-content></ng-content>
  </div>`,
  styleUrls: ['./nav-item.component.scss'],
})
export class NavItemComponent {
  @Input() active = false;
}
