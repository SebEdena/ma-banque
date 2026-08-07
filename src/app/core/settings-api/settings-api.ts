import { Service } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

import type { DisplaySettings } from '../display-settings/display-settings.types';

/**
 * Wraps `invoke()` for the data-folder-location Tauri commands (built in
 * `01-setup-backend.md`) and the display-settings commands (built in
 * `01-settings-backend.md`) so components never call `invoke()` directly —
 * the seam later tickets' tests mock instead of `invoke()` itself (see
 * `docs/spec/05-settings-remainder.md`).
 */
@Service()
export class SettingsApi {
  getCurrentDataFolder(): Promise<string | null> {
    return invoke<string | null>('get_current_data_folder');
  }

  setDefaultDataFolder(): Promise<string> {
    return invoke<string>('set_default_data_folder');
  }

  openDataFolder(path: string): Promise<string> {
    return invoke<string>('open_data_folder', { path });
  }

  getDisplaySettings(): Promise<DisplaySettings> {
    return invoke<DisplaySettings>('get_display_settings');
  }

  updateDisplaySettings(settings: DisplaySettings): Promise<void> {
    return invoke<void>('update_display_settings', { settings });
  }
}

/**
 * The wire shape of `DataFolderLocationError` (see
 * `src-tauri/src/domain/data_folder_location.rs`), serialized with
 * `#[serde(tag = "kind", content = "message")]` — `message` is only present
 * for the `Io` variant, since the other variants carry no payload.
 */
interface DataFolderLocationErrorWire {
  kind: string;
  message?: string;
}

function isDataFolderLocationErrorWire(error: unknown): error is DataFolderLocationErrorWire {
  return (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    typeof (error as { kind: unknown }).kind === 'string'
  );
}

/**
 * Turns a rejected `DataFolderLocationError` into the toast text to show.
 *
 * The app's shipped UI is French (see `technical-architecture.md` §4 /
 * project memory), and that's the default here too. The one deliberate
 * exception: `docs/spec/05-settings-remainder.md`'s "Error display" section
 * calls out the destination-occupied (move) and invalid-database (open)
 * errors specifically as surfaced **verbatim, no rewording** — so for
 * exactly those two variants this returns the same English text as their
 * Rust `#[error("...")]` attribute, unlike everything else here.
 */
export function parseDataFolderLocationError(error: unknown): string {
  if (!isDataFolderLocationErrorWire(error)) {
    return "une erreur inattendue s'est produite";
  }

  switch (error.kind) {
    case 'NoPointerSet':
      return "aucun dossier de données n'est configuré";
    // Verbatim per docs/spec/05-settings-remainder.md's "Error display"
    // section — not translated, matching the Rust `#[error("...")]` text.
    case 'InvalidExistingSave':
      return 'the folder contains an invalid or incompatible save';
    case 'DestinationOccupied':
      return 'the destination folder already contains a save';
    case 'Io':
      return error.message ?? 'une erreur du système de fichiers est survenue';
    default:
      return "une erreur inattendue s'est produite";
  }
}

/**
 * The wire shape of `SettingsError` (see `src-tauri/src/domain/settings.rs`),
 * serialized the same way as `DataFolderLocationError` above.
 */
interface SettingsErrorWire {
  kind: string;
  message?: string;
}

function isSettingsErrorWire(error: unknown): error is SettingsErrorWire {
  return (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    typeof (error as { kind: unknown }).kind === 'string'
  );
}

/**
 * Turns a rejected `SettingsError` (from `get_display_settings`/
 * `update_display_settings`) into the toast text to show — French, per the
 * shipped UI's language (no "verbatim" carve-out applies to this error
 * type, unlike `parseDataFolderLocationError`'s two named exceptions).
 */
export function parseSettingsError(error: unknown): string {
  if (!isSettingsErrorWire(error)) {
    return "une erreur inattendue s'est produite";
  }

  switch (error.kind) {
    case 'InvalidStoredValue':
      return 'une valeur enregistrée est invalide';
    case 'Io':
      return error.message ?? 'une erreur du système de fichiers est survenue';
    default:
      return "une erreur inattendue s'est produite";
  }
}
