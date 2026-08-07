import { TestBed } from '@angular/core/testing';

import { SettingsApi } from '../settings-api/settings-api';
import { DisplaySettingsService } from './display-settings';
import { formatAmount } from './format';

vi.mock('@spartan-ng/brain/sonner', () => ({
  toast: { error: vi.fn() },
}));

function configure(settingsApi: Partial<SettingsApi>): void {
  TestBed.configureTestingModule({
    providers: [{ provide: SettingsApi, useValue: settingsApi }],
  });
}

describe('DisplaySettingsService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the current display settings on construction', async () => {
    configure({
      getDisplaySettings: vi
        .fn()
        .mockResolvedValue({ date_format: 'YMD', currency_format: 'ISO_CODE' }),
    });

    const service = TestBed.inject(DisplaySettingsService);
    await Promise.resolve();
    await Promise.resolve();

    expect(service.dateFormat()).toBe('YMD');
    expect(service.currencyFormat()).toBe('ISO_CODE');
  });

  it('defaults to DMY/SYMBOL_AFTER before the initial load resolves', () => {
    configure({ getDisplaySettings: vi.fn().mockResolvedValue(undefined) });

    const service = TestBed.inject(DisplaySettingsService);

    expect(service.dateFormat()).toBe('DMY');
    expect(service.currencyFormat()).toBe('SYMBOL_AFTER');
  });

  it('update persists via SettingsApi and applies the change locally', async () => {
    const updateDisplaySettings = vi.fn().mockResolvedValue(undefined);
    configure({
      getDisplaySettings: vi
        .fn()
        .mockResolvedValue({ date_format: 'DMY', currency_format: 'SYMBOL_AFTER' }),
      updateDisplaySettings,
    });
    const service = TestBed.inject(DisplaySettingsService);

    await service.update({ date_format: 'MDY', currency_format: 'SYMBOL_BEFORE' });

    expect(updateDisplaySettings).toHaveBeenCalledWith({
      date_format: 'MDY',
      currency_format: 'SYMBOL_BEFORE',
    });
    expect(service.dateFormat()).toBe('MDY');
    expect(service.currencyFormat()).toBe('SYMBOL_BEFORE');
  });

  it('update surfaces a toast and leaves signals unchanged when the command rejects', async () => {
    const { toast } = await import('@spartan-ng/brain/sonner');
    const updateDisplaySettings = vi.fn().mockRejectedValue(new Error('boom'));
    configure({
      getDisplaySettings: vi
        .fn()
        .mockResolvedValue({ date_format: 'DMY', currency_format: 'SYMBOL_AFTER' }),
      updateDisplaySettings,
    });
    const service = TestBed.inject(DisplaySettingsService);

    await service.update({ date_format: 'YMD', currency_format: 'ISO_CODE' });

    expect(toast.error).toHaveBeenCalled();
    expect(service.dateFormat()).toBe('DMY');
    expect(service.currencyFormat()).toBe('SYMBOL_AFTER');
  });

  it('formatAmount uses the currently loaded currency format', async () => {
    configure({
      getDisplaySettings: vi
        .fn()
        .mockResolvedValue({ date_format: 'DMY', currency_format: 'ISO_CODE' }),
    });
    const service = TestBed.inject(DisplaySettingsService);
    await Promise.resolve();
    await Promise.resolve();

    // The formatting itself is covered by format.spec.ts — this only
    // checks the service forwards the loaded currency format correctly.
    expect(service.formatAmount(1234.56)).toBe(formatAmount(1234.56, 'ISO_CODE'));
  });
});
