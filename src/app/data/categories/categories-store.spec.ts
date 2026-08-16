import { TestBed } from '@angular/core/testing';

import { CategoriesApi, Category } from './categories-api';
import { CategoriesStore } from './categories-store';

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Alimentation',
    color: '#10b981',
    icon: 'lucideShoppingCart',
    description: '',
    usage_count: 0,
    ...overrides,
  };
}

function createStore(categoriesApi: Partial<CategoriesApi>): CategoriesStore {
  TestBed.configureTestingModule({
    providers: [{ provide: CategoriesApi, useValue: categoriesApi }],
  });
  return TestBed.inject(CategoriesStore);
}

describe('CategoriesStore', () => {
  it('loads the list on construction', async () => {
    const store = createStore({
      listCategories: vi.fn().mockResolvedValue([category({ id: 1 }), category({ id: 2 })]),
    });

    await store.loaded;

    expect(store.categories().map((c) => c.id)).toEqual([1, 2]);
  });

  it('leaves the list empty when the initial load fails', async () => {
    const store = createStore({
      listCategories: vi.fn().mockRejectedValue({ kind: 'Io', message: 'boom' }),
    });

    await store.loaded;

    expect(store.categories()).toEqual([]);
  });

  it('refetches after creating, so every surface sees the new category', async () => {
    const listCategories = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([category({ id: 2, name: 'Cadeaux' })]);
    const store = createStore({
      listCategories,
      createCategory: vi.fn().mockResolvedValue(category({ id: 2, name: 'Cadeaux' })),
    });
    await store.loaded;

    await store.create({ name: 'Cadeaux', color: '#000', icon: 'lucideGift', description: '' });

    expect(store.categories().map((c) => c.name)).toEqual(['Cadeaux']);
    expect(listCategories).toHaveBeenCalledTimes(2);
  });

  it('refetches after updating and after deleting', async () => {
    const categoriesApi = {
      listCategories: vi.fn().mockResolvedValue([]),
      updateCategory: vi.fn().mockResolvedValue(category()),
      deleteCategory: vi.fn().mockResolvedValue(undefined),
    };
    const store = createStore(categoriesApi);
    await store.loaded;

    await store.update(1, { name: 'Alimentation', color: '#000', icon: 'x', description: '' });
    await store.delete(1);

    expect(categoriesApi.updateCategory).toHaveBeenCalledWith(1, expect.any(Object));
    expect(categoriesApi.deleteCategory).toHaveBeenCalledWith(1);
    expect(categoriesApi.listCategories).toHaveBeenCalledTimes(3);
  });

  it('propagates a refused delete instead of swallowing it', async () => {
    const store = createStore({
      listCategories: vi.fn().mockResolvedValue([]),
      deleteCategory: vi.fn().mockRejectedValue({ kind: 'InUse' }),
    });
    await store.loaded;

    await expect(store.delete(1)).rejects.toEqual({ kind: 'InUse' });
  });
});
