import { ICON_CATALOG, DEFAULT_ICON_NAME, searchIcons } from './icon-catalog';

describe('searchIcons', () => {
  it('returns the whole catalogue for a blank query', () => {
    expect(searchIcons('')).toEqual(ICON_CATALOG);
    expect(searchIcons('   ')).toEqual(ICON_CATALOG);
  });

  it('filters by French keyword', () => {
    const names = searchIcons('épargne').map((icon) => icon.name);

    expect(names).toContain('lucidePiggyBank');
    expect(names).toContain('lucideVault');
    expect(names).not.toContain('lucideCar');
  });

  it('ignores accents and case, so a keyboard without accents still finds icons', () => {
    expect(searchIcons('epargne').map((i) => i.name)).toEqual(
      searchIcons('Épargne').map((i) => i.name),
    );
    expect(searchIcons('EPARGNE').map((i) => i.name)).toContain('lucidePiggyBank');
  });

  it('matches the icon name without its lucide prefix', () => {
    expect(searchIcons('wallet').map((i) => i.name)).toEqual(['lucideWallet']);
  });

  it('matches partial words', () => {
    expect(searchIcons('trans').map((i) => i.name)).toContain('lucideBus');
  });

  it('returns nothing when no icon matches', () => {
    expect(searchIcons('zzzzz')).toEqual([]);
  });
});

describe('ICON_CATALOG', () => {
  it('has no duplicate names', () => {
    const names = ICON_CATALOG.map((icon) => icon.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every icon at least one keyword and some SVG', () => {
    for (const icon of ICON_CATALOG) {
      expect(icon.keywords.length).toBeGreaterThan(0);
      expect(icon.svg).toContain('<svg');
    }
  });

  it('offers the default icon a create form starts on', () => {
    expect(ICON_CATALOG.map((icon) => icon.name)).toContain(DEFAULT_ICON_NAME);
  });
});
