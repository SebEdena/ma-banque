import { Service, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

@Service()
export class Theme {
  private readonly currentTheme = signal<ThemeMode>(this.detectSystemTheme());

  readonly theme = this.currentTheme.asReadonly();

  constructor() {
    this.applyTheme(this.currentTheme());
  }

  setTheme(theme: ThemeMode): void {
    this.currentTheme.set(theme);
    this.applyTheme(theme);
  }

  private detectSystemTheme(): ThemeMode {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return 'light';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private applyTheme(theme: ThemeMode): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}
