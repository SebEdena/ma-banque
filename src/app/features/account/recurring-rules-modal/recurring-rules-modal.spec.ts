import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Category } from '@data/categories/categories-api';
import { RecurringRule, RecurringRulesApi } from '@data/recurring-rules/recurring-rules-api';
import { RecurringRulesModal } from './recurring-rules-modal';

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 1,
    account_id: 1,
    label: 'Loyer',
    category_id: 1,
    amount: -750,
    description: '',
    frequency: 'MONTHLY',
    interval: 1,
    start_date: '2026-03-01',
    end_date: null,
    ...overrides,
  };
}

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Logement',
    color: '#3b82f6',
    icon: 'lucideHouse',
    description: '',
    usage_count: 0,
    ...overrides,
  };
}

interface StubApi {
  listRecurringRules: ReturnType<typeof vi.fn>;
  createRecurringRule: ReturnType<typeof vi.fn>;
  updateRecurringRule: ReturnType<typeof vi.fn>;
  deleteRecurringRule: ReturnType<typeof vi.fn>;
}

function stubApi(rules: RecurringRule[] = [rule()]): StubApi {
  return {
    listRecurringRules: vi.fn().mockResolvedValue(rules),
    createRecurringRule: vi.fn((accountId: number, input: object) =>
      Promise.resolve({ ...input, id: 99, account_id: accountId }),
    ),
    updateRecurringRule: vi.fn((id: number, input: object) =>
      Promise.resolve({ ...input, id, account_id: 1 }),
    ),
    deleteRecurringRule: vi.fn().mockResolvedValue(undefined),
  };
}

async function createModal(
  api: StubApi = stubApi(),
  categories: Category[] = [category()],
): Promise<ComponentFixture<RecurringRulesModal>> {
  await TestBed.configureTestingModule({
    imports: [RecurringRulesModal],
    providers: [{ provide: RecurringRulesApi, useValue: api }],
  }).compileComponents();

  const fixture = TestBed.createComponent(RecurringRulesModal);
  fixture.componentRef.setInput('accountId', 1);
  fixture.componentRef.setInput('accountColor', '#3b82f6');
  fixture.componentRef.setInput('categories', categories);
  fixture.componentRef.setInput('dateFormat', 'DMY');
  fixture.componentRef.setInput('currencyFormat', 'SYMBOL_AFTER');
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

function el<T extends HTMLElement>(fixture: ComponentFixture<unknown>, testId: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`) as T;
}

function all(fixture: ComponentFixture<unknown>, testId: string): HTMLElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testId}"]`),
  );
}

function has(fixture: ComponentFixture<unknown>, testId: string): boolean {
  return el(fixture, testId) !== null;
}

function textIn(root: HTMLElement, testId: string): string {
  return root.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '';
}

async function click(fixture: ComponentFixture<unknown>, testId: string): Promise<void> {
  el<HTMLButtonElement>(fixture, testId).click();
  await settle(fixture);
}

function type(fixture: ComponentFixture<unknown>, testId: string, value: string): void {
  const field = el<HTMLInputElement>(fixture, testId);
  field.value = value;
  field.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function select(fixture: ComponentFixture<unknown>, testId: string, value: string): void {
  const field = el<HTMLSelectElement>(fixture, testId);
  field.value = value;
  field.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

describe('RecurringRulesModal', () => {
  describe('list', () => {
    it('renders one row per rule the Api reports', async () => {
      const fixture = await createModal(stubApi([rule({ id: 1 }), rule({ id: 2 })]));

      expect(all(fixture, 'recurring-row')).toHaveLength(2);
    });

    it('shows what a rule generates and how often', async () => {
      const fixture = await createModal(stubApi([rule({ label: 'Loyer', amount: -750 })]));
      const row = all(fixture, 'recurring-row')[0];

      expect(textIn(row, 'recurring-row-label')).toBe('Loyer');
      expect(textIn(row, 'recurring-row-amount')).toContain('750');
      expect(textIn(row, 'recurring-row-schedule')).toContain('Tous les mois');
      expect(textIn(row, 'recurring-row-schedule')).toContain('depuis le 01/03/2026');
    });

    it.each([
      ['MONTHLY' as const, 1, 'Tous les mois'],
      ['MONTHLY' as const, 2, 'Tous les 2 mois'],
      ['WEEKLY' as const, 1, 'Toutes les semaines'],
      ['WEEKLY' as const, 3, 'Toutes les 3 semaines'],
      ['YEARLY' as const, 1, 'Tous les ans'],
      ['YEARLY' as const, 2, 'Tous les 2 ans'],
    ])('says %s every %i period(s) as "%s"', async (frequency, interval, expected) => {
      const fixture = await createModal(stubApi([rule({ frequency, interval })]));

      expect(textIn(all(fixture, 'recurring-row')[0], 'recurring-row-schedule')).toContain(
        expected,
      );
    });

    it('names both bounds of a rule that ends', async () => {
      const fixture = await createModal(
        stubApi([rule({ start_date: '2026-03-01', end_date: '2026-12-31' })]),
      );

      expect(textIn(all(fixture, 'recurring-row')[0], 'recurring-row-schedule')).toContain(
        'du 01/03/2026 au 31/12/2026',
      );
    });

    it('shows an empty state and the create affordance when there are no rules', async () => {
      const fixture = await createModal(stubApi([]));

      expect(has(fixture, 'recurring-empty')).toBe(true);
      expect(has(fixture, 'recurring-row')).toBe(false);
      expect(has(fixture, 'recurring-new')).toBe(true);
    });

    it('labels the create-rule button exactly "Nouvelle"', async () => {
      const fixture = await createModal();

      expect(el(fixture, 'recurring-new').textContent?.trim()).toBe('Nouvelle');
    });

    it('emits closed from the header’s close button', async () => {
      const fixture = await createModal();
      let closed = 0;
      fixture.componentInstance.closed.subscribe(() => (closed += 1));

      await click(fixture, 'recurring-close');

      expect(closed).toBe(1);
    });
  });

  describe('creating', () => {
    it('calls createRecurringRule with the form’s values', async () => {
      const api = stubApi([]);
      const fixture = await createModal(api);

      await click(fixture, 'recurring-new');
      type(fixture, 'recurring-form-label', 'Salaire');
      select(fixture, 'recurring-form-category', '1');
      await click(fixture, 'recurring-form-credit');
      type(fixture, 'recurring-form-amount', '2100');
      type(fixture, 'recurring-form-description', 'Virement employeur');
      select(fixture, 'recurring-form-frequency', 'MONTHLY');
      type(fixture, 'recurring-form-interval', '1');
      type(fixture, 'recurring-form-start-date', '2026-03-01');
      await click(fixture, 'recurring-save');

      expect(api.createRecurringRule).toHaveBeenCalledWith(1, {
        label: 'Salaire',
        category_id: 1,
        amount: 2100,
        description: 'Virement employeur',
        frequency: 'MONTHLY',
        interval: 1,
        start_date: '2026-03-01',
        end_date: null,
      });
    });

    it('never asks about scope when creating', async () => {
      const api = stubApi([]);
      const fixture = await createModal(api);

      await click(fixture, 'recurring-new');
      type(fixture, 'recurring-form-label', 'Salaire');
      type(fixture, 'recurring-form-amount', '2100');
      type(fixture, 'recurring-form-start-date', '2026-03-01');
      await click(fixture, 'recurring-save');

      expect(has(fixture, 'recurring-scope-dialog')).toBe(false);
      expect(api.createRecurringRule).toHaveBeenCalled();
    });

    it('returns to the list showing the rule it just created', async () => {
      const api = stubApi([]);
      const fixture = await createModal(api);
      api.listRecurringRules.mockResolvedValue([rule({ label: 'Salaire' })]);

      await click(fixture, 'recurring-new');
      type(fixture, 'recurring-form-label', 'Salaire');
      type(fixture, 'recurring-form-amount', '2100');
      type(fixture, 'recurring-form-start-date', '2026-03-01');
      await click(fixture, 'recurring-save');

      expect(has(fixture, 'recurring-form')).toBe(false);
      expect(textIn(all(fixture, 'recurring-row')[0], 'recurring-row-label')).toBe('Salaire');
    });
  });

  describe('editing', () => {
    it('fills the form from the rule being edited', async () => {
      const fixture = await createModal(
        stubApi([rule({ label: 'Loyer', amount: -750, interval: 2, end_date: '2026-12-31' })]),
      );

      await click(fixture, 'recurring-edit');

      expect(el<HTMLInputElement>(fixture, 'recurring-form-label').value).toBe('Loyer');
      expect(el<HTMLInputElement>(fixture, 'recurring-form-amount').value).toBe('-750');
      expect(el<HTMLInputElement>(fixture, 'recurring-form-interval').value).toBe('2');
      expect(el<HTMLInputElement>(fixture, 'recurring-form-end-date').value).toBe('2026-12-31');
    });

    it('opens both selects on the rule’s own poste and frequency', async () => {
      const fixture = await createModal(stubApi([rule({ category_id: 2, frequency: 'YEARLY' })]), [
        category({ id: 1, name: 'Alimentation' }),
        category({ id: 2, name: 'Logement' }),
      ]);

      await click(fixture, 'recurring-edit');

      expect(el<HTMLSelectElement>(fixture, 'recurring-form-category').value).toBe('2');
      expect(el<HTMLSelectElement>(fixture, 'recurring-form-frequency').value).toBe('YEARLY');
    });

    it('saves an untouched rule unchanged, without asking about scope', async () => {
      const api = stubApi([rule({ id: 7, category_id: 2, frequency: 'YEARLY', interval: 2 })]);
      const fixture = await createModal(api, [category({ id: 2, name: 'Logement' })]);

      await click(fixture, 'recurring-edit');
      await click(fixture, 'recurring-save');

      expect(has(fixture, 'recurring-scope-dialog')).toBe(false);
      expect(api.updateRecurringRule).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ category_id: 2, frequency: 'YEARLY', interval: 2 }),
        'ALL_FUTURE',
      );
    });

    it('asks about scope when a template field changed and sends the chosen one', async () => {
      const api = stubApi([rule({ id: 7 })]);
      const fixture = await createModal(api);

      await click(fixture, 'recurring-edit');
      type(fixture, 'recurring-form-amount', '-800');
      await click(fixture, 'recurring-save');

      expect(has(fixture, 'recurring-scope-dialog')).toBe(true);
      expect(api.updateRecurringRule).not.toHaveBeenCalled();

      await click(fixture, 'recurring-scope-next');

      expect(api.updateRecurringRule).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ amount: -800 }),
        'NEXT_OCCURRENCE_ONLY',
      );
    });

    it('sends ALL_FUTURE when that is the scope chosen', async () => {
      const api = stubApi([rule({ id: 7 })]);
      const fixture = await createModal(api);

      await click(fixture, 'recurring-edit');
      type(fixture, 'recurring-form-label', 'Loyer révisé');
      await click(fixture, 'recurring-save');
      await click(fixture, 'recurring-scope-all');

      expect(api.updateRecurringRule).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ label: 'Loyer révisé' }),
        'ALL_FUTURE',
      );
    });

    it('writes nothing when the scope question is cancelled', async () => {
      const api = stubApi([rule({ id: 7 })]);
      const fixture = await createModal(api);

      await click(fixture, 'recurring-edit');
      type(fixture, 'recurring-form-amount', '-800');
      await click(fixture, 'recurring-save');
      await click(fixture, 'recurring-scope-cancel');

      expect(api.updateRecurringRule).not.toHaveBeenCalled();
      expect(has(fixture, 'recurring-form')).toBe(true);
    });

    it('skips the scope question when only a schedule field changed', async () => {
      const api = stubApi([rule({ id: 7, interval: 1 })]);
      const fixture = await createModal(api);

      await click(fixture, 'recurring-edit');
      type(fixture, 'recurring-form-interval', '3');
      await click(fixture, 'recurring-save');

      expect(has(fixture, 'recurring-scope-dialog')).toBe(false);
      expect(api.updateRecurringRule).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ interval: 3 }),
        'ALL_FUTURE',
      );
    });

    it('skips the scope question when both a template and a schedule field changed', async () => {
      const api = stubApi([rule({ id: 7, interval: 1 })]);
      const fixture = await createModal(api);

      await click(fixture, 'recurring-edit');
      type(fixture, 'recurring-form-amount', '-800');
      type(fixture, 'recurring-form-interval', '3');
      await click(fixture, 'recurring-save');

      expect(has(fixture, 'recurring-scope-dialog')).toBe(false);
      expect(api.updateRecurringRule).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ amount: -800, interval: 3 }),
        'ALL_FUTURE',
      );
    });
  });

  describe('deleting', () => {
    it('deletes only once the confirmation is accepted', async () => {
      const api = stubApi([rule({ id: 7, label: 'Loyer' })]);
      const fixture = await createModal(api);

      await click(fixture, 'recurring-delete');

      expect(api.deleteRecurringRule).not.toHaveBeenCalled();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loyer');

      await click(fixture, 'confirm-accept');

      expect(api.deleteRecurringRule).toHaveBeenCalledWith(7);
    });

    it('keeps the rule when the confirmation is dismissed', async () => {
      const api = stubApi([rule({ id: 7 })]);
      const fixture = await createModal(api);

      await click(fixture, 'recurring-delete');
      await click(fixture, 'confirm-cancel');

      expect(api.deleteRecurringRule).not.toHaveBeenCalled();
      expect(all(fixture, 'recurring-row')).toHaveLength(1);
    });
  });

  describe('validation', () => {
    async function openFormWith(
      changes: Record<string, string>,
    ): Promise<[ComponentFixture<RecurringRulesModal>, StubApi]> {
      const api = stubApi([]);
      const fixture = await createModal(api);

      await click(fixture, 'recurring-new');
      type(fixture, 'recurring-form-label', 'Loyer');
      type(fixture, 'recurring-form-amount', '-750');
      type(fixture, 'recurring-form-start-date', '2026-03-01');
      for (const [testId, value] of Object.entries(changes)) {
        type(fixture, testId, value);
      }
      await click(fixture, 'recurring-save');
      return [fixture, api];
    }

    it('rejects a blank label inline, without calling the Api', async () => {
      const [fixture, api] = await openFormWith({ 'recurring-form-label': '   ' });

      expect(el(fixture, 'recurring-form-label-error').textContent).toContain('Libellé');
      expect(api.createRecurringRule).not.toHaveBeenCalled();
    });

    it('rejects an unreadable amount inline, without calling the Api', async () => {
      const [fixture, api] = await openFormWith({ 'recurring-form-amount': 'beaucoup' });

      expect(el(fixture, 'recurring-form-amount-error').textContent).toContain('Montant');
      expect(api.createRecurringRule).not.toHaveBeenCalled();
    });

    it('rejects an interval below 1 inline, without calling the Api', async () => {
      const [fixture, api] = await openFormWith({ 'recurring-form-interval': '0' });

      expect(el(fixture, 'recurring-form-interval-error').textContent).toContain('1');
      expect(api.createRecurringRule).not.toHaveBeenCalled();
    });

    it.each(['', 'deux', '1,5'])(
      'rejects the unreadable interval %o inline, without calling the Api',
      async (interval) => {
        const [fixture, api] = await openFormWith({ 'recurring-form-interval': interval });

        expect(has(fixture, 'recurring-form-interval-error')).toBe(true);
        expect(api.createRecurringRule).not.toHaveBeenCalled();
      },
    );

    it('rejects an end date before the start date inline, without calling the Api', async () => {
      const [fixture, api] = await openFormWith({ 'recurring-form-end-date': '2026-02-01' });

      expect(el(fixture, 'recurring-form-end-date-error').textContent).toContain('début');
      expect(api.createRecurringRule).not.toHaveBeenCalled();
    });

    it('accepts an end date equal to the start date', async () => {
      const [fixture, api] = await openFormWith({ 'recurring-form-end-date': '2026-03-01' });

      expect(has(fixture, 'recurring-form-end-date-error')).toBe(false);
      expect(api.createRecurringRule).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ end_date: '2026-03-01' }),
      );
    });

    it('shows no error before a save has been attempted', async () => {
      const fixture = await createModal(stubApi([]));

      await click(fixture, 'recurring-new');

      expect(has(fixture, 'recurring-form-label-error')).toBe(false);
      expect(has(fixture, 'recurring-form-amount-error')).toBe(false);
    });

    it('does not carry a refused save’s errors into the next form opened', async () => {
      const fixture = await createModal(stubApi([rule()]));

      await click(fixture, 'recurring-new');
      await click(fixture, 'recurring-save');
      expect(has(fixture, 'recurring-form-label-error')).toBe(true);

      await click(fixture, 'recurring-cancel');
      await click(fixture, 'recurring-new');

      expect(has(fixture, 'recurring-form-label-error')).toBe(false);
      expect(has(fixture, 'recurring-form-amount-error')).toBe(false);
    });

    it('does not carry a refused save’s errors into an edited rule', async () => {
      const fixture = await createModal(stubApi([rule()]));

      await click(fixture, 'recurring-new');
      await click(fixture, 'recurring-save');

      await click(fixture, 'recurring-cancel');
      await click(fixture, 'recurring-edit');

      expect(has(fixture, 'recurring-form-label-error')).toBe(false);
    });

    it('clears the end date back to open-ended', async () => {
      const api = stubApi([rule({ end_date: '2026-12-31' })]);
      const fixture = await createModal(api);

      await click(fixture, 'recurring-edit');
      await click(fixture, 'recurring-form-end-date-clear');
      await click(fixture, 'recurring-save');

      expect(api.updateRecurringRule).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ end_date: null }),
        'ALL_FUTURE',
      );
    });
  });

  it('wears the account’s accent colour', async () => {
    const fixture = await createModal(stubApi([]), []);

    expect(el(fixture, 'recurring-modal').style.getPropertyValue('--account-color')).toBe(
      '#3b82f6',
    );
  });
});
