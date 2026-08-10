import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ICON_CATALOG } from '../icon-catalog';
import { IconPicker } from './icon-picker';

async function createIconPicker(
  value: string | null = null,
): Promise<ComponentFixture<IconPicker>> {
  await TestBed.configureTestingModule({ imports: [IconPicker] }).compileComponents();

  const fixture = TestBed.createComponent(IconPicker);
  fixture.componentRef.setInput('value', value);
  fixture.detectChanges();
  return fixture;
}

function options(fixture: ComponentFixture<IconPicker>): HTMLButtonElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="icon-option"]'),
  );
}

function search(fixture: ComponentFixture<IconPicker>, query: string): void {
  const input = (fixture.nativeElement as HTMLElement).querySelector(
    '[data-testid="icon-search"]',
  ) as HTMLInputElement;
  input.value = query;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('IconPicker', () => {
  it('renders the whole catalogue before anything is searched', async () => {
    const fixture = await createIconPicker();

    expect(options(fixture)).toHaveLength(ICON_CATALOG.length);
  });

  it('filters the grid down to the icons matching the search', async () => {
    const fixture = await createIconPicker();

    search(fixture, 'épargne');

    const names = options(fixture).map((button) => button.dataset['value']);
    expect(names).toContain('lucidePiggyBank');
    expect(names).not.toContain('lucideCar');
    expect(names.length).toBeLessThan(ICON_CATALOG.length);
  });

  it('restores the full grid when the search is cleared', async () => {
    const fixture = await createIconPicker();
    search(fixture, 'épargne');

    search(fixture, '');

    expect(options(fixture)).toHaveLength(ICON_CATALOG.length);
  });

  it('explains itself instead of showing an empty grid when nothing matches', async () => {
    const fixture = await createIconPicker();

    search(fixture, 'zzzzz');

    expect(options(fixture)).toHaveLength(0);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="icon-empty"]'),
    ).not.toBeNull();
  });

  it('emits the icon that was clicked', async () => {
    const fixture = await createIconPicker();
    const emitted: string[] = [];
    fixture.componentInstance.selected.subscribe((name) => emitted.push(name));

    options(fixture)[0].click();

    expect(emitted).toEqual([ICON_CATALOG[0].name]);
  });

  it('marks the current value as pressed', async () => {
    const fixture = await createIconPicker('lucidePiggyBank');

    const pressed = options(fixture).filter(
      (button) => button.getAttribute('aria-pressed') === 'true',
    );

    expect(pressed).toHaveLength(1);
    expect(pressed[0].dataset['value']).toBe('lucidePiggyBank');
  });
});
