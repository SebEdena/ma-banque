import { TestBed } from '@angular/core/testing';

import { Theme } from './theme';

let mediaQueryListeners: ((event: MediaQueryListEvent) => void)[];

function stubPrefersColorScheme(matchesDark: boolean): void {
  mediaQueryListeners = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: matchesDark,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
        mediaQueryListeners.push(listener);
      }),
      removeEventListener: vi.fn(),
    }),
  );
}

function emitSystemPreferenceChange(matchesDark: boolean): void {
  for (const listener of mediaQueryListeners) {
    listener({ matches: matchesDark } as MediaQueryListEvent);
  }
}

describe('Theme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('defaults to system mode and follows a dark system preference', () => {
    stubPrefersColorScheme(true);

    const service = TestBed.inject(Theme);

    expect(service.mode()).toBe('system');
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('defaults to system mode and follows a light system preference', () => {
    stubPrefersColorScheme(false);

    const service = TestBed.inject(Theme);

    expect(service.mode()).toBe('system');
    expect(service.theme()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('updates the theme and DOM class when setTheme is called with an explicit mode', () => {
    stubPrefersColorScheme(false);
    const service = TestBed.inject(Theme);

    service.setTheme('dark');

    expect(service.mode()).toBe('dark');
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('setTheme("system") switches back to tracking the OS preference', () => {
    stubPrefersColorScheme(true);
    const service = TestBed.inject(Theme);
    service.setTheme('light');

    service.setTheme('system');

    expect(service.mode()).toBe('system');
    expect(service.theme()).toBe('dark');
  });

  it('reacts live to OS preference changes while in system mode', () => {
    stubPrefersColorScheme(false);
    const service = TestBed.inject(Theme);
    expect(service.theme()).toBe('light');

    emitSystemPreferenceChange(true);

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('ignores OS preference changes once an explicit mode is set', () => {
    stubPrefersColorScheme(false);
    const service = TestBed.inject(Theme);
    service.setTheme('light');

    emitSystemPreferenceChange(true);

    expect(service.theme()).toBe('light');
  });

  it('persists the chosen mode across instances via localStorage', () => {
    stubPrefersColorScheme(false);
    const first = TestBed.inject(Theme);
    first.setTheme('dark');

    TestBed.resetTestingModule();
    const second = TestBed.inject(Theme);

    expect(second.mode()).toBe('dark');
    expect(second.theme()).toBe('dark');
  });
});
