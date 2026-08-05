import { TestBed } from '@angular/core/testing';

import { Theme } from './theme';

function stubPrefersColorScheme(matchesDark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: matchesDark,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

describe('Theme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove('dark');
  });

  it('detects a dark system preference and applies the dark class', () => {
    stubPrefersColorScheme(true);

    const service = TestBed.inject(Theme);

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('detects a light system preference and does not apply the dark class', () => {
    stubPrefersColorScheme(false);

    const service = TestBed.inject(Theme);

    expect(service.theme()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('updates the theme and DOM class when setTheme is called', () => {
    stubPrefersColorScheme(false);
    const service = TestBed.inject(Theme);

    service.setTheme('dark');

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
