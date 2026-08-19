; Custom NSIS hooks for the Ma Banque installer/uninstaller.
; See https://v2.tauri.app/distribute/windows-installer/#hooks

!macro NSIS_HOOK_POSTUNINSTALL
  ; $APPDATA\com.sebviguier.mabanque is where Tauri's app_config_dir() and
  ; app_data_dir() both resolve to on Windows (same identifier-named folder
  ; under Roaming AppData) — it holds the data-folder pointer (config.json)
  ; and the default "saves" folder created on first launch. A save folder
  ; the user explicitly relocated via "move data folder" lives elsewhere and
  ; is intentionally left untouched, since the uninstaller has no reliable
  ; way to know whether that location is still meant to be Ma Banque's.
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Voulez-vous aussi supprimer les paramètres et le dossier de sauvegarde par défaut de Ma Banque ?$\r$\n$\r$\nSi vous avez déplacé votre dossier de sauvegarde ailleurs, il ne sera pas touché." \
    IDNO skip_data_delete
  RMDir /r "$APPDATA\com.sebviguier.mabanque"
  skip_data_delete:
!macroend
