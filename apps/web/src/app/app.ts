import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavItemComponent } from './shared/ui/nav-item/nav-item.component';
import { FabComponent } from './shared/ui/fab/fab.component';
import { FeedComponent } from './feed/feed.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavItemComponent, FabComponent, FeedComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
