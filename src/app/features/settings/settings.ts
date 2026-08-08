import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFolder, lucideHouse, lucideLayoutGrid, lucideList } from '@ng-icons/lucide';

/**
 * The Settings screen's shell: a left sub-nav (Postes / Affichage /
 * Stockage, matching the prototype) routing to child routes. "Postes"
 * points at the existing `categories` route/placeholder — its real content
 * is `04-categories.md`'s job. See `docs/spec/05-settings-remainder.md`.
 *
 * The "Accueil" entry is TEMPORARY demo scaffolding paired with `Home`'s
 * sample date/amount — remove both once real app-level navigation exists.
 */
@Component({
  selector: 'app-settings',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, NgIcon],
  providers: [provideIcons({ lucideLayoutGrid, lucideList, lucideFolder, lucideHouse })],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {}
