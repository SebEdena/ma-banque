import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Theme } from './core/theme/theme';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly theme = inject(Theme);
}
