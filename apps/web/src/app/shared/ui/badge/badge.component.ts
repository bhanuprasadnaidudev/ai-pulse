import { Component } from '@angular/core';

@Component({
  selector: 'ui-badge',
  standalone: true,
  template: `<span class="ui-badge"><ng-content></ng-content></span>`,
  styleUrls: ['./badge.component.scss'],
})
export class BadgeComponent {}
