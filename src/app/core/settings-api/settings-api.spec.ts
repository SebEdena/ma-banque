import { TestBed } from '@angular/core/testing';

import { SettingsApi, parseDataFolderLocationError } from './settings-api';

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
});

describe('parseDataFolderLocationError', () => {
  it('returns the Io variant message verbatim', () => {
    const message = parseDataFolderLocationError({
      kind: 'Io',
      message: 'permission denied',
    });
    expect(message).toBe('permission denied');
  });

  it('returns a fixed message for InvalidExistingSave, matching the backend text verbatim', () => {
    const message = parseDataFolderLocationError({ kind: 'InvalidExistingSave' });
    expect(message).toBe('the folder contains an invalid or incompatible save');
  });

  it('returns a fixed message for DestinationOccupied, matching the backend text verbatim', () => {
    const message = parseDataFolderLocationError({ kind: 'DestinationOccupied' });
    expect(message).toBe('the destination folder already contains a save');
  });

  it('returns a French message for NoPointerSet (not one of the two verbatim-required errors)', () => {
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
