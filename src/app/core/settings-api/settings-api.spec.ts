import { TestBed } from '@angular/core/testing';

import { SettingsApi, parseDataFolderLocationError, parseSettingsError } from './settings-api';

function stubTauriInvoke(invoke: ReturnType<typeof vi.fn>): void {
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke });
}

describe('SettingsApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getCurrentDataFolder invokes get_current_data_folder', async () => {
    const invoke = vi.fn().mockResolvedValue('/home/user/saves');
    stubTauriInvoke(invoke);

    const api = TestBed.inject(SettingsApi);
    const folder = await api.getCurrentDataFolder();

    expect(invoke).toHaveBeenCalledWith('get_current_data_folder', {}, undefined);
    expect(folder).toBe('/home/user/saves');
  });

  it('setDefaultDataFolder invokes set_default_data_folder', async () => {
    const invoke = vi.fn().mockResolvedValue('/home/user/saves');
    stubTauriInvoke(invoke);

    const api = TestBed.inject(SettingsApi);
    const folder = await api.setDefaultDataFolder();

    expect(invoke).toHaveBeenCalledWith('set_default_data_folder', {}, undefined);
    expect(folder).toBe('/home/user/saves');
  });

  it('openDataFolder invokes open_data_folder with the chosen path', async () => {
    const invoke = vi.fn().mockResolvedValue('/chosen/path');
    stubTauriInvoke(invoke);

    const api = TestBed.inject(SettingsApi);
    const folder = await api.openDataFolder('/chosen/path');

    expect(invoke).toHaveBeenCalledWith('open_data_folder', { path: '/chosen/path' }, undefined);
    expect(folder).toBe('/chosen/path');
  });

  it('moveDataFolder invokes move_data_folder with the chosen destination', async () => {
    const invoke = vi.fn().mockResolvedValue('/new/home');
    stubTauriInvoke(invoke);

    const api = TestBed.inject(SettingsApi);
    const folder = await api.moveDataFolder('/new/home');

    expect(invoke).toHaveBeenCalledWith(
      'move_data_folder',
      { destination: '/new/home' },
      undefined,
    );
    expect(folder).toBe('/new/home');
  });

  it('getDisplaySettings invokes get_display_settings', async () => {
    const settings = { date_format: 'DMY', currency_format: 'SYMBOL_AFTER' } as const;
    const invoke = vi.fn().mockResolvedValue(settings);
    stubTauriInvoke(invoke);

    const api = TestBed.inject(SettingsApi);
    const result = await api.getDisplaySettings();

    expect(invoke).toHaveBeenCalledWith('get_display_settings', {}, undefined);
    expect(result).toEqual(settings);
  });

  it('updateDisplaySettings invokes update_display_settings with the new settings', async () => {
    const settings = { date_format: 'YMD', currency_format: 'ISO_CODE' } as const;
    const invoke = vi.fn().mockResolvedValue(undefined);
    stubTauriInvoke(invoke);

    const api = TestBed.inject(SettingsApi);
    await api.updateDisplaySettings(settings);

    expect(invoke).toHaveBeenCalledWith('update_display_settings', { settings }, undefined);
  });
});

describe('parseDataFolderLocationError', () => {
  it('returns the Io variant message verbatim', () => {
    const message = parseDataFolderLocationError({
      kind: 'Io',
      message: 'permission denied',
    });
    expect(message).toBe('permission denied');
  });

  it('returns a French message for InvalidExistingSave', () => {
    const message = parseDataFolderLocationError({ kind: 'InvalidExistingSave' });
    expect(message).toBe('le dossier contient une sauvegarde invalide ou incompatible');
  });

  it('returns a French message for DestinationOccupied', () => {
    const message = parseDataFolderLocationError({ kind: 'DestinationOccupied' });
    expect(message).toBe('le dossier de destination contient déjà une sauvegarde');
  });

  it('returns a French message for NoPointerSet', () => {
    const message = parseDataFolderLocationError({ kind: 'NoPointerSet' });
    expect(message).toBe("aucun dossier de données n'est configuré");
  });

  it('falls back to a French generic message for anything unrecognized', () => {
    expect(parseDataFolderLocationError(new Error('network down'))).toBe(
      "une erreur inattendue s'est produite",
    );
    expect(parseDataFolderLocationError(null)).toBe("une erreur inattendue s'est produite");
  });
});

describe('parseSettingsError', () => {
  it('returns the Io variant message verbatim', () => {
    expect(parseSettingsError({ kind: 'Io', message: 'disk full' })).toBe('disk full');
  });

  it('returns a French message for InvalidStoredValue', () => {
    expect(parseSettingsError({ kind: 'InvalidStoredValue' })).toBe(
      'une valeur enregistrée est invalide',
    );
  });

  it('falls back to a French generic message for anything unrecognized', () => {
    expect(parseSettingsError(new Error('network down'))).toBe(
      "une erreur inattendue s'est produite",
    );
    expect(parseSettingsError(null)).toBe("une erreur inattendue s'est produite");
  });
});
