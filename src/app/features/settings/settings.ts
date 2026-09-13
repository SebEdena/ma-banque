import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideHouse } from '@ng-icons/lucide';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { filter, map } from 'rxjs';

type SettingsSection = 'categories' | 'display-format' | 'storage';

interface SectionOption {
  value: SettingsSection;
  label: string;
}

const SECTION_OPTIONS: readonly SectionOption[] = [
  { value: 'categories', label: 'Postes' },
  { value: 'display-format', label: 'Affichage' },
  { value: 'storage', label: 'Stockage' },
];

/**
 * The Settings screen's shell: a section switcher (Postes / Affichage /
 * Stockage, per `docs/spec/05-settings-remainder.md`) routing to child
 * routes. Originally a VS Code/GitHub-style sidebar nav; simplified to a
 * standard `hlm-select` — a sidebar list read as heavier chrome than three
 * destinations warrant, and didn't adapt as well at narrow widths as a
 * single dropdown does. "Postes" points at the existing
 * `categories` route/placeholder — its real content is `04-categories.md`'s
 * job.
 *
 * The "Accueil" link is TEMPORARY demo scaffolding paired with `Home`'s
 * sample date/amount — remove both once real app-level navigation exists.
 */
@Component({
  selector: 'app-settings',
  imports: [RouterLink, RouterOutlet, NgIcon, ...HlmSelectImports],
  providers: [provideIcons({ lucideHouse })],
  templateUrl: './settings.html',
})
export class Settings {
  private readonly router = inject(Router);

  protected readonly sectionOptions = SECTION_OPTIONS;

  /** Tracks the active child route, so the control reflects direct/back-forward navigation too, not just its own selections. */
  protected readonly section = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.currentSection()),
    ),
    { initialValue: this.currentSection() },
  );

  protected selectSection(section: SettingsSection | null | undefined): void {
    if (section) {
      void this.router.navigate(['/settings', section]);
    }
  }

  private currentSection(): SettingsSection {
    const segments = this.router.url.split('/');
    return SECTION_OPTIONS.find((option) => segments.includes(option.value))?.value ?? 'categories';
  }
}
