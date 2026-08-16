import { ComponentFixture, TestBed } from '@angular/core/testing';
import { toast } from '@spartan-ng/brain/sonner';

import { CategoriesApi, Category } from '@core/categories-api/categories-api';
import { Categories } from './categories';

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Alimentation',
    color: '#10b981',
    icon: 'lucideShoppingCart',
    description: 'Courses, supermarché, marché',
    usage_count: 0,
    ...overrides,
  };
}

function stubApi(
  categories: Category[],
  overrides: Partial<CategoriesApi> = {},
): Partial<CategoriesApi> {
  return {
    listCategories: vi.fn().mockResolvedValue(categories),
    createCategory: vi.fn().mockResolvedValue(category()),
    updateCategory: vi.fn().mockResolvedValue(category()),
    deleteCategory: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function createCategories(
  categoriesApi: Partial<CategoriesApi>,
): Promise<ComponentFixture<Categories>> {
  await TestBed.configureTestingModule({
    imports: [Categories],
    providers: [{ provide: CategoriesApi, useValue: categoriesApi }],
  }).compileComponents();

  const fixture = TestBed.createComponent(Categories);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function all(fixture: ComponentFixture<Categories>, testId: string): HTMLElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testId}"]`),
  );
}

function one(fixture: ComponentFixture<Categories>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
}

async function click(fixture: ComponentFixture<Categories>, element: HTMLElement): Promise<void> {
  element.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('Categories', () => {
  it('renders one card per category, seeded and created alike', async () => {
    const fixture = await createCategories(
      stubApi([
        category({ id: 1, name: 'Alimentation' }),
        category({ id: 2, name: 'Logement', icon: 'lucideHouse' }),
        category({ id: 13, name: 'Cadeaux', icon: 'lucideGift' }),
      ]),
    );

    const cards = all(fixture, 'category-card');
    expect(cards).toHaveLength(3);
    expect(cards[1].textContent).toContain('Logement');
    expect(cards[2].textContent).toContain('Cadeaux');
  });

  it('shows each category description on its card', async () => {
    const fixture = await createCategories(
      stubApi([category({ description: 'Courses, supermarché, marché' })]),
    );

    expect(all(fixture, 'category-card')[0].textContent).toContain('Courses, supermarché, marché');
  });

  it('re-fetches the list on entering the screen, so usage counts reflect entries saved elsewhere', async () => {
    const api = stubApi([category()]);
    await createCategories(api);

    expect(api.listCategories).toHaveBeenCalledTimes(2);
  });

  it('deletes a category with no entries after a plain confirmation', async () => {
    const api = stubApi([category({ id: 4, usage_count: 0 })]);
    const fixture = await createCategories(api);

    await click(fixture, all(fixture, 'category-delete')[0]);
    expect(one(fixture, 'confirm-accept')).not.toBeNull();
    expect(one(fixture, 'delete-blocked-message')).toBeNull();

    await click(fixture, one(fixture, 'confirm-accept')!);

    expect(api.deleteCategory).toHaveBeenCalledWith(4);
    // Store construction, the screen's own entry reload, then the delete's.
    expect(api.listCategories).toHaveBeenCalledTimes(3);
  });

  it('blocks deletion with the usage count, offering no delete action, when entries use the category', async () => {
    const api = stubApi([category({ id: 4, name: 'Transport', usage_count: 11 })]);
    const fixture = await createCategories(api);

    await click(fixture, all(fixture, 'category-delete')[0]);

    const blocked = one(fixture, 'delete-blocked-message');
    expect(blocked?.textContent).toContain('Transport');
    expect(blocked?.textContent).toContain('11 écritures');
    expect(one(fixture, 'confirm-accept')).toBeNull();
    expect(api.deleteCategory).not.toHaveBeenCalled();
  });

  it('surfaces an InUse rejection as a toast when the usage count was stale', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '');
    const api = stubApi([category({ id: 4, usage_count: 0 })], {
      deleteCategory: vi.fn().mockRejectedValue({ kind: 'InUse' }),
    });
    const fixture = await createCategories(api);

    await click(fixture, all(fixture, 'category-delete')[0]);
    await click(fixture, one(fixture, 'confirm-accept')!);

    expect(error).toHaveBeenCalledWith(
      'ce poste est utilisé par des écritures et ne peut pas être supprimé',
    );
  });

  it('opens the create modal with an empty name and no icon selected', async () => {
    const fixture = await createCategories(stubApi([]));

    await click(fixture, one(fixture, 'category-create')!);

    expect((one(fixture, 'category-name') as HTMLInputElement).value).toBe('');
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="icon-option"][aria-pressed="true"]',
      ),
    ).toHaveLength(0);
  });

  it('opens the edit modal prefilled from the card it was opened from', async () => {
    const fixture = await createCategories(
      stubApi([category({ id: 2, name: 'Logement', description: 'Loyer, charges' })]),
    );

    await click(fixture, all(fixture, 'category-edit')[0]);

    expect((one(fixture, 'category-name') as HTMLInputElement).value).toBe('Logement');
    expect((one(fixture, 'category-description') as HTMLTextAreaElement).value).toBe(
      'Loyer, charges',
    );
  });

  it('refuses to save a nameless, iconless category and says so next to each field', async () => {
    const api = stubApi([]);
    const fixture = await createCategories(api);

    await click(fixture, one(fixture, 'category-create')!);
    await click(fixture, one(fixture, 'category-save')!);

    expect(one(fixture, 'category-name-error')).not.toBeNull();
    expect(one(fixture, 'category-icon-error')).not.toBeNull();
    expect(api.createCategory).not.toHaveBeenCalled();
  });

  it('creates a category and re-fetches the list', async () => {
    const api = stubApi([]);
    const fixture = await createCategories(api);

    await click(fixture, one(fixture, 'category-create')!);

    const name = one(fixture, 'category-name') as HTMLInputElement;
    name.value = 'Cadeaux';
    name.dispatchEvent(new Event('input'));
    await click(fixture, all(fixture, 'icon-option')[0]);
    await click(fixture, one(fixture, 'category-save')!);

    expect(api.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Cadeaux', description: '' }),
    );
    // Store construction, the screen's own entry reload, then the create's.
    expect(api.listCategories).toHaveBeenCalledTimes(3);
    expect(one(fixture, 'category-name')).toBeNull();
  });

  it("filters the icon picker's grid by keyword search", async () => {
    const fixture = await createCategories(stubApi([]));
    await click(fixture, one(fixture, 'category-create')!);

    const before = all(fixture, 'icon-option').length;
    const search = one(fixture, 'icon-search') as HTMLInputElement;
    search.value = 'épargne';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    const after = all(fixture, 'icon-option');
    expect(after.length).toBeGreaterThan(0);
    expect(after.length).toBeLessThan(before);
    expect(after.map((option) => option.dataset['value'])).toContain('lucidePiggyBank');
  });
});
