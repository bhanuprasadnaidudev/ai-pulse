import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ButtonComponent } from './shared/ui/button/button.component';
import { CardComponent } from './shared/ui/card/card.component';
import { BadgeComponent } from './shared/ui/badge/badge.component';
import { NavItemComponent } from './shared/ui/nav-item/nav-item.component';
import { FabComponent } from './shared/ui/fab/fab.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ButtonComponent, CardComponent, BadgeComponent, NavItemComponent, FabComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('AI Pulse');
  protected readonly activeTab = signal('feed');
}
