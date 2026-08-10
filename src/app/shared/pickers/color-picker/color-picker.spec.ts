import { ComponentFixture, TestBed } from '@angular/core/testing';

import { COLOR_SWATCHES, DEFAULT_COLOR } from '../color-swatches';
import { ColorPicker } from './color-picker';

async function createColorPicker(
  value: string | null = null,
): Promise<ComponentFixture<ColorPicker>> {
  await TestBed.configureTestingModule({ imports: [ColorPicker] }).compileComponents();

  const fixture = TestBed.createComponent(ColorPicker);
  fixture.componentRef.setInput('value', value);
  fixture.detectChanges();
  return fixture;
}

function swatches(fixture: ComponentFixture<ColorPicker>): HTMLButtonElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="color-swatch"]'),
  );
}

describe('ColorPicker', () => {
  it('renders one swatch per palette colour', async () => {
    const fixture = await createColorPicker();

    expect(swatches(fixture).map((button) => button.dataset['value'])).toEqual(
      COLOR_SWATCHES.map((swatch) => swatch.value),
    );
  });

  it('labels each swatch with its French colour name', async () => {
    const fixture = await createColorPicker();

    expect(swatches(fixture)[0].getAttribute('aria-label')).toBe(COLOR_SWATCHES[0].label);
  });

  it('emits the colour that was clicked', async () => {
    const fixture = await createColorPicker();
    const emitted: string[] = [];
    fixture.componentInstance.selected.subscribe((color) => emitted.push(color));

    swatches(fixture)[2].click();

    expect(emitted).toEqual([COLOR_SWATCHES[2].value]);
  });

  it('marks the current value as pressed and the others as not', async () => {
    const fixture = await createColorPicker(COLOR_SWATCHES[3].value);

    const pressed = swatches(fixture).filter(
      (button) => button.getAttribute('aria-pressed') === 'true',
    );

    expect(pressed).toHaveLength(1);
    expect(pressed[0].dataset['value']).toBe(COLOR_SWATCHES[3].value);
  });

  it('marks nothing as pressed when no colour is set yet', async () => {
    const fixture = await createColorPicker();

    expect(
      swatches(fixture).every((button) => button.getAttribute('aria-pressed') === 'false'),
    ).toBe(true);
  });

  it('offers the default colour a create form starts on', () => {
    expect(COLOR_SWATCHES.map((swatch) => swatch.value)).toContain(DEFAULT_COLOR);
  });
});
