import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideBrnCalendarI18n } from '@spartan-ng/brain/calendar';
import { provideNativeDateAdapter } from '@spartan-ng/brain/date-time';

import { FRENCH_CALENDAR_I18N } from '@core/display-settings/calendar-i18n';
import { ReconciliationSummary } from '@data/reconciliation/reconciliation-api';
import '@core/testing/jsdom-polyfills';
import { ReconciliationPanel } from './reconciliation-panel';

/**
 * A summary as the backend hands it over. `is_balanced` is derived here the
 * way `domain::reconciliation` derives it — exactly zero, no tolerance — so a
 * fixture can never claim a delta and a verdict that disagree.
 */
function summary(overrides: Partial<ReconciliationSummary> = {}): ReconciliationSummary {
  const merged: ReconciliationSummary = {
    statement_date: '2026-02-28',
    bank_balance: 1000,
    reconciled_balance: 1000,
    delta: 0,
    is_balanced: true,
    unreconciled_count: 4,
    ...overrides,
  };
  return { ...merged, is_balanced: merged.delta === 0 };
}

async function createPanel(
  overrides: Partial<ReconciliationSummary> = {},
  includeReconciled = true,
): Promise<ComponentFixture<ReconciliationPanel>> {
  const fixture = TestBed.createComponent(ReconciliationPanel);
  fixture.componentRef.setInput('summary', summary(overrides));
  fixture.componentRef.setInput('accountColor', '#6366f1');
  fixture.componentRef.setInput('currencyFormat', 'SYMBOL_AFTER');
  fixture.componentRef.setInput('dateFormat', 'DMY');
  fixture.componentRef.setInput('includeReconciled', includeReconciled);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function one(fixture: ComponentFixture<ReconciliationPanel>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
}

function text(fixture: ComponentFixture<ReconciliationPanel>, testId: string): string {
  return one(fixture, testId)?.textContent?.trim() ?? '';
}

/** The delta figure's colour class, which is the whole red/green verdict. */
function deltaClass(fixture: ComponentFixture<ReconciliationPanel>): string {
  return one(fixture, 'reconciliation-delta')?.className ?? '';
}

async function settle(fixture: ComponentFixture<ReconciliationPanel>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

/** Types into the bank-balance field and commits it, as leaving the field does. */
async function typeBankBalance(
  fixture: ComponentFixture<ReconciliationPanel>,
  value: string,
): Promise<void> {
  const field = one(fixture, 'reconciliation-bank-balance') as HTMLInputElement;
  field.value = value;
  field.dispatchEvent(new Event('input'));
  field.dispatchEvent(new Event('change'));
  await settle(fixture);
}

describe('ReconciliationPanel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReconciliationPanel],
      providers: [provideNativeDateAdapter(), provideBrnCalendarI18n(FRENCH_CALENDAR_I18N)],
    });
  });

  it('renders the reconciled balance, bank balance, statement date and delta', async () => {
    const fixture = await createPanel({
      statement_date: '2026-02-28',
      reconciled_balance: 984.5,
      bank_balance: 1000,
      delta: 15.5,
    });

    expect(text(fixture, 'reconciliation-reconciled-balance')).toBe('984,50 €');
    expect(text(fixture, 'reconciliation-delta')).toBe('15,50 €');
    expect((one(fixture, 'reconciliation-bank-balance') as HTMLInputElement).value).toBe('1000');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        '#reconciliation-statement-date',
      )?.value,
    ).toBe('28/02/2026');
  });

  it('shows the green verdict at exactly zero', async () => {
    const fixture = await createPanel({ bank_balance: 1000, reconciled_balance: 1000, delta: 0 });

    expect(text(fixture, 'reconciliation-delta')).toBe('0,00 €');
    expect(deltaClass(fixture)).toContain('text-(--pointage-ok)');
    expect(deltaClass(fixture)).not.toContain('text-(--pointage-bad)');
    expect(text(fixture, 'reconciliation-verdict')).toContain('Comptes pointés');
    expect(one(fixture, 'reconciliation-verdict')?.className).toContain('bg-(--pointage-ok-soft)');
  });

  it('shows the red verdict one cent over, and one cent under', async () => {
    const over = await createPanel({
      bank_balance: 1000.01,
      reconciled_balance: 1000,
      delta: 0.01,
    });

    expect(text(over, 'reconciliation-delta')).toBe('0,01 €');
    expect(deltaClass(over)).toContain('text-(--pointage-bad)');
    expect(deltaClass(over)).not.toContain('text-(--pointage-ok)');
    expect(text(over, 'reconciliation-verdict')).toContain('Écart détecté');
    expect(one(over, 'reconciliation-verdict')?.className).toContain('bg-(--pointage-bad-soft)');

    const under = await createPanel({
      bank_balance: 999.99,
      reconciled_balance: 1000,
      delta: -0.01,
    });

    expect(text(under, 'reconciliation-delta')).toBe('-0,01 €');
    expect(deltaClass(under)).toContain('text-(--pointage-bad)');
    expect(deltaClass(under)).not.toContain('text-(--pointage-ok)');
  });

  it('renders the delta signed, so a bank holding less is legible as such', async () => {
    const short = await createPanel({
      bank_balance: 984.5,
      reconciled_balance: 1000,
      delta: -15.5,
    });

    // Not "15,50 €": the prototype's Math.abs() loses which side is short,
    // which is the whole point of the figure (docs/spec/08-reconciliation.md).
    expect(text(short, 'reconciliation-delta')).toBe('-15,50 €');

    const over = await createPanel({ bank_balance: 1015.5, reconciled_balance: 1000, delta: 15.5 });

    expect(text(over, 'reconciliation-delta')).toBe('15,50 €');
  });

  it('prompts for a statement date instead of showing figures it would have to guess', async () => {
    const fixture = await createPanel({
      statement_date: null,
      reconciled_balance: null,
      bank_balance: null,
      delta: null,
    });

    expect(one(fixture, 'reconciliation-statement-date-prompt')).not.toBeNull();
    expect(one(fixture, 'reconciliation-reconciled-balance')).toBeNull();
    expect(one(fixture, 'reconciliation-delta')).toBeNull();
    expect(one(fixture, 'reconciliation-verdict')).toBeNull();
  });

  it('leaves the delta out while the bank balance is unset, rather than reading it as zero', async () => {
    const fixture = await createPanel({
      bank_balance: null,
      reconciled_balance: 1000,
      delta: null,
    });

    // fr-FR groups thousands with U+202F, the narrow no-break space.
    expect(text(fixture, 'reconciliation-reconciled-balance')).toBe('1 000,00 €');
    expect((one(fixture, 'reconciliation-bank-balance') as HTMLInputElement).value).toBe('');
    expect(one(fixture, 'reconciliation-delta')).toBeNull();
    expect(one(fixture, 'reconciliation-verdict')).toBeNull();
  });

  it('disables the filter checkbox once nothing is left to reconcile', async () => {
    const fixture = await createPanel({ unreconciled_count: 0 });

    expect((one(fixture, 'reconciliation-filter') as HTMLButtonElement).disabled).toBe(true);
  });

  it('leaves the filter checkbox usable while entries are still unreconciled', async () => {
    const fixture = await createPanel({ unreconciled_count: 1 });

    expect((one(fixture, 'reconciliation-filter') as HTMLButtonElement).disabled).toBe(false);
  });

  it('emits the bank balance it read, in major units', async () => {
    const fixture = await createPanel();
    const emitted: number[] = [];
    fixture.componentInstance.bankBalanceChanged.subscribe((amount) => emitted.push(amount));

    await typeBankBalance(fixture, '1234,56');

    expect(emitted).toEqual([1234.56]);
  });

  it('emits the statement date as ISO when the picker commits one', async () => {
    const fixture = await createPanel();
    const emitted: string[] = [];
    fixture.componentInstance.statementDateChanged.subscribe((date) => emitted.push(date));

    const field = (fixture.nativeElement as HTMLElement).querySelector(
      '#reconciliation-statement-date',
    ) as HTMLInputElement;
    field.focus();
    field.value = '31/03/2026';
    field.dispatchEvent(new Event('input'));
    field.blur();
    await settle(fixture);

    expect(emitted).toEqual(['2026-03-31']);
  });

  it('emits when the filter checkbox is clicked', async () => {
    const fixture = await createPanel();
    let toggles = 0;
    fixture.componentInstance.includeReconciledToggled.subscribe(() => (toggles += 1));

    (one(fixture, 'reconciliation-filter') as HTMLButtonElement).click();
    await settle(fixture);

    expect(toggles).toBe(1);
  });

  it('rejects a bank balance that is not a number inline, without emitting', async () => {
    const fixture = await createPanel();
    const emitted: number[] = [];
    fixture.componentInstance.bankBalanceChanged.subscribe((amount) => emitted.push(amount));

    await typeBankBalance(fixture, '-');

    expect(emitted).toEqual([]);
    expect(one(fixture, 'reconciliation-bank-balance-error')).not.toBeNull();
    // The typo stays put so it can be corrected where it was made.
    expect((one(fixture, 'reconciliation-bank-balance') as HTMLInputElement).value).toBe('-');

    await typeBankBalance(fixture, '-12,40');

    expect(emitted).toEqual([-12.4]);
    expect(one(fixture, 'reconciliation-bank-balance-error')).toBeNull();
  });
});
