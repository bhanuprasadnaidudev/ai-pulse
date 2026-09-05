import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'ui-button',
  standalone: true,
  template: `<button [class]="'ui-btn ' + variant" (click)="pressed.emit($event)">
    <ng-content></ng-content>
  </button>`,
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent {
  @Input() variant: 'ink' | 'acid' = 'ink';
  @Output() pressed = new EventEmitter<Event>();
}
