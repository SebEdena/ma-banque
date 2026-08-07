import { Service, signal } from '@angular/core';

/** The user's chosen preference — `system` tracks the OS setting live. */
export type ThemeMode = 'light' | 'dark' | 'system';
/** What's actually applied to the DOM — `system` always resolves to one of these. */
type EffectiveTheme = 'light' | 'dark';

const STORAGE_KEY = 'ma-banque:theme';

/**
 * Light/dark/system theme preference (business requirements §4.6,
 * `docs/spec/05-settings-remainder.md`). Persisted client-side
 * (`localStorage`), not in SQLite — it must be readable before any database
 * is opened, since it affects the first-launch prompt's own rendering, and
 * it's a device preference rather than book data (deliberate asymmetry
 * with date/currency format, which do live in SQLite).
 */
@Service()
export class Theme {
  private readonly mediaQuery = this.getMediaQuery();

  private readonly currentMode = signal<ThemeMode>(this.readStoredMode());
  /** The raw preference — including `system` — for UI controls to bind to. */
  readonly mode = this.currentMode.asReadonly();

  private readonly currentTheme = signal<EffectiveTheme>(this.resolveEffective(this.currentMode()));
  /** What's actually applied — `system` resolved to `light`/`dark`. */
  readonly theme = this.currentTheme.asReadonly();

  constructor() {
    this.applyTheme(this.currentTheme());

    this.mediaQuery?.addEventListener('change', (event: MediaQueryListEvent) => {
      if (this.currentMode() !== 'system') {
        return;
      }
      const effective: EffectiveTheme = event.matches ? 'dark' : 'light';
      this.currentTheme.set(effective);
      this.applyTheme(effective);
    });
  }

  setTheme(mode: ThemeMode): void {
    this.currentMode.set(mode);
    this.persist(mode);

    const effective = this.resolveEffective(mode);
    this.currentTheme.set(effective);
    this.applyTheme(effective);
  }

  private resolveEffective(mode: ThemeMode): EffectiveTheme {
    if (mode === 'system') {
      return this.mediaQuery?.matches ? 'dark' : 'light';
    }
    return mode;
  }

  private getMediaQuery(): MediaQueryList | undefined {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return undefined;
    }
    return window.matchMedia('(prefers-color-scheme: dark)');
  }

  private readStoredMode(): ThemeMode {
    if (typeof localStorage === 'undefined') {
      return 'system';
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  }

  private persist(mode: ThemeMode): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(STORAGE_KEY, mode);
  }

  private applyTheme(theme: EffectiveTheme): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}
