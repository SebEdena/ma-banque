import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReconciliationFilter } from './reconciliation-filter';

function createFilter(checked = true, disabled = false): ComponentFixture<ReconciliationFilter> {
  const fixture = TestBed.createComponent(ReconciliationFilter);
  fixture.componentRef.setInput('checked', checked);
  fixture.componentRef.setInput('disabled', disabled);
  fixture.componentRef.setInput('accountColor', '#6366f1');
  fixture.detectChanges();
  return fixture;
}

function checkbox(fixture: ComponentFixture<ReconciliationFilter>): HTMLButtonElement {
  return (fixture.nativeElement as HTMLElement).querySelector(
    '[data-testid="reconciliation-filter"]',
  ) as HTMLButtonElement;
}

describe('ReconciliationFilter', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ReconciliationFilter] });
  });

  it('reflects the checked value it is given', () => {
    const checkedFixture = createFilter(true);
    expect(checkbox(checkedFixture).getAttribute('aria-checked')).toBe('true');

    const uncheckedFixture = createFilter(false);
    expect(checkbox(uncheckedFixture).getAttribute('aria-checked')).toBe('false');
  });

  it('disables the checkbox once nothing is left to reconcile', () => {
    const fixture = createFilter(true, true);
    expect(checkbox(fixture).disabled).toBe(true);
  });

  it('leaves the checkbox usable while entries are still unreconciled', () => {
    const fixture = createFilter(true, false);
    expect(checkbox(fixture).disabled).toBe(false);
  });

  it('emits toggled when clicked, without acting itself', () => {
    const fixture = createFilter(false);
    let toggles = 0;
    fixture.componentInstance.toggled.subscribe(() => (toggles += 1));

    checkbox(fixture).click();

    expect(toggles).toBe(1);
    // Whether the checkbox reads as checked is the parent's to decide.
    expect(checkbox(fixture).getAttribute('aria-checked')).toBe('false');
  });
});
