import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'ui-fab',
  standalone: true,
  template: `<button class="ui-fab" (click)="pressed.emit()">
    <ng-content></ng-content>
  </button>`,
  styleUrls: ['./fab.component.scss'],
})
export class FabComponent {
  @Output() pressed = new EventEmitter<void>();
}
