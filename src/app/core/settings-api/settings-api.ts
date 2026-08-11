import { Service } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

import type { DisplaySettings } from '@core/display-settings/display-settings.types';

/**
 * Wraps `invoke()` for the data-folder-location Tauri commands (built in
 * `01-setup-backend.md`) and the display-settings commands (built in
 * `01-settings-backend.md`), plus the native folder-picker dialog, so
 * components never import from `@tauri-apps/*` directly — the seam later
 * tickets' tests mock instead of Tauri itself (see
 * `docs/spec/05-settings-remainder.md`), and the only seam an in-memory
 * backend (`settings-api.mock.ts`) needs to replace.
 */
@Service()
export class SettingsApi {
  getCurrentDataFolder(): Promise<string | null> {
    return invoke<string | null>('get_current_data_folder');
  }

  /** Opens the native folder picker; resolves `null` if the user cancels. */
  async pickFolder(): Promise<string | null> {
    const picked = await open({ directory: true, multiple: false });
    return typeof picked === 'string' ? picked : null;
  }

  setDefaultDataFolder(): Promise<string> {
    return invoke<string>('set_default_data_folder');
  }

  openDataFolder(path: string): Promise<string> {
    return invoke<string>('open_data_folder', { path });
  }

  moveDataFolder(destination: string): Promise<string> {
    return invoke<string>('move_data_folder', { destination });
  }

  getDisplaySettings(): Promise<DisplaySettings> {
    return invoke<DisplaySettings>('get_display_settings');
  }

  updateDisplaySettings(settings: DisplaySettings): Promise<void> {
    return invoke<void>('update_display_settings', { settings });
  }
}

/**
 * The `kind` discriminants `DataFolderLocationError` serializes to (see
 * `src-tauri/src/domain/data_folder_location.rs`'s
 * `#[serde(tag = "kind", content = "message")]`) — kept as a named union
 * rather than inline string literals so every call site (the wire
 * interface, the type guard, the switch below) shares one source of truth.
 */
type DataFolderLocationErrorKind =
  'NoPointerSet' | 'InvalidExistingSave' | 'DestinationOccupied' | 'Io';

/**
 * The wire shape of `DataFolderLocationError` — `message` is only present
 * for the `Io` variant, since the other variants carry no payload.
 */
interface DataFolderLocationErrorWire {
  kind: DataFolderLocationErrorKind;
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
 * Turns a rejected `DataFolderLocationError` into the toast text to show —
 * French throughout, matching the shipped UI's language (see
 * `technical-architecture.md` §4 / project memory). User-facing error text
 * is never left in English, including the two folder-action errors
 * (destination-occupied, invalid-database) that `docs/spec/05-settings-remainder.md`'s
 * "Error display" section originally called out as verbatim-English
 * exceptions — that carve-out was reversed on PR review (see
 * https://github.com/SebEdena/ma-banque/pull/2 review comments); the spec
 * doc should be updated to match.
 */
export function parseDataFolderLocationError(error: unknown): string {
  if (!isDataFolderLocationErrorWire(error)) {
    return "une erreur inattendue s'est produite";
  }

  switch (error.kind) {
    case 'NoPointerSet':
      return "aucun dossier de données n'est configuré";
    case 'InvalidExistingSave':
      return 'le dossier contient une sauvegarde invalide ou incompatible';
    case 'DestinationOccupied':
      return 'le dossier de destination contient déjà une sauvegarde';
    case 'Io':
      return error.message ?? 'une erreur du système de fichiers est survenue';
    default:
      return "une erreur inattendue s'est produite";
  }
}

/**
 * The `kind` discriminants `SettingsError` serializes to (see
 * `src-tauri/src/domain/settings.rs`).
 */
type SettingsErrorKind = 'InvalidStoredValue' | 'Io';

/**
 * The wire shape of `SettingsError` (from `get_display_settings`/
 * `update_display_settings`), serialized the same way as
 * `DataFolderLocationError` above.
 */
interface SettingsErrorWire {
  kind: SettingsErrorKind;
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
 * Turns a rejected `SettingsError` into the toast text to show — French,
 * per the shipped UI's language; this error type never had a
 * verbatim-English carve-out.
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
