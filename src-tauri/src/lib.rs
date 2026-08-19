//! Ma Banque backend, organized in Clean Architecture layers.
//!
//! Allowed dependency directions: `commands` -> `usecases` -> `domain`,
//! and `infra` -> `domain`. `domain` depends on nothing else in this
//! crate. Business logic belongs in `domain`/`usecases`; `infra` and
//! `commands` are wiring around it, not places to grow business rules.

mod commands;
mod domain;
mod infra;
mod usecases;

use tauri::Manager;

use domain::account::DynAccountRepository;
use domain::category::DynCategoryRepository;
use domain::data_folder_location::{DataFolderLocationRepository, DynDataFolderLocationRepository};
use domain::entry::DynEntryRepository;
use domain::reconciliation::DynReconciliationRepository;
use domain::recurring::DynRecurringRuleRepository;
use domain::settings::DynSettingsRepository;
use infra::account::SqliteAccountRepository;
use infra::category::SqliteCategoryRepository;
use infra::data_folder_location::FsDataFolderLocationRepository;
use infra::db::StartupDbError;
use infra::entry::SqliteEntryRepository;
use infra::reconciliation::SqliteReconciliationRepository;
use infra::recurring::SqliteRecurringRuleRepository;
use infra::settings::SqliteSettingsRepository;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // Must be the first plugin registered (single-instance requirement)
        // so a second launch focuses the existing window instead of
        // spinning up a second process against the same SQLite database.
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_updater::Builder::default().build());

        // tauri-plugin-window-state always persists to the OS-standard
        // app_config_dir() — unlike this app's own data, it has no override
        // for that path — so registering it in debug builds would leak a
        // window-state file into a real user profile, breaking the "debug
        // builds never touch real user directories" guarantee described
        // above. Release-only avoids that; debug windows just always open
        // per `tauri.conf.json`'s static config instead of a remembered one.
        if !cfg!(debug_assertions) {
            builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
        }
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::data_folder_location::get_current_data_folder,
            commands::data_folder_location::set_default_data_folder,
            commands::data_folder_location::open_data_folder,
            commands::data_folder_location::move_data_folder,
            commands::account::list_active_accounts,
            commands::account::list_archived_accounts,
            commands::account::create_account,
            commands::account::update_account,
            commands::account::archive_account,
            commands::account::unarchive_account,
            commands::account::delete_account,
            commands::category::list_categories,
            commands::category::create_category,
            commands::category::update_category,
            commands::category::delete_category,
            commands::entry::list_entries,
            commands::entry::create_entry,
            commands::entry::update_entry,
            commands::entry::delete_entry,
            commands::entry::set_reconciled,
            commands::reconciliation::reconciliation_summary,
            commands::reconciliation::set_bank_balance,
            commands::reconciliation::set_statement_date,
            commands::recurring::list_recurring_rules,
            commands::recurring::create_recurring_rule,
            commands::recurring::update_recurring_rule,
            commands::recurring::delete_recurring_rule,
            commands::recurring::open_account,
            commands::recurring::generate_all_due_entries,
            commands::db::get_startup_db_error,
            commands::settings::get_display_settings,
            commands::settings::update_display_settings,
            commands::statistics::category_breakdown,
            commands::statistics::credit_breakdown,
            commands::statistics::month_bucketed,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
                // Enables the WebdriverIO e2e suite's execute()/mock() API and log
                // forwarding (see wdio.conf.ts). Never registered in release builds.
                app.handle().plugin(tauri_plugin_wdio::init())?;
            }

            let (config_dir, data_dir) = if cfg!(debug_assertions) {
                // Debug builds (`cargo tauri dev`, and the `--debug` build
                // the e2e suite drives) keep their pointer file and default
                // save folder inside the repo instead of the OS-standard
                // user directories, so local runs and e2e tests never touch
                // (or get polluted by) a real user profile — delete
                // `.dev-data/` to reset. Release builds are untouched.
                let dev_data_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .parent()
                    .expect("CARGO_MANIFEST_DIR has a parent")
                    .join(".dev-data");
                (dev_data_dir.join("config"), dev_data_dir.join("data"))
            } else {
                (app.path().app_config_dir()?, app.path().app_data_dir()?)
            };
            let folder_repo = FsDataFolderLocationRepository::new(config_dir, data_dir);

            // No folder configured yet (first launch, or the previously
            // configured folder is unreachable): don't decide unilaterally.
            // The frontend prompts the user (default vs. choose a folder),
            // which then calls back through the data-folder-location
            // commands — those `infra::db::reopen` the placeholder below
            // once a real folder is available, rather than a connection
            // being opened here in that case.
            let mut startup_error = None;
            let shared_conn = match folder_repo.get_current_folder()? {
                Some(folder) => {
                    let db_path = folder.join(infra::DB_FILE_NAME);
                    match infra::db::open_and_migrate(&db_path) {
                        Ok(shared_conn) => shared_conn,
                        Err(err) => {
                            log::error!("failed to open the configured data folder: {err}");
                            startup_error = Some(err);
                            infra::db::placeholder_connection()
                        }
                    }
                }
                None => infra::db::placeholder_connection(),
            };

            // Managed once, for the app's whole lifetime — the data-folder-
            // location commands swap the `Connection` this `Arc<Mutex<_>>`
            // wraps (via `infra::db::reopen`) instead of the app ever
            // re-managing this state, which Tauri doesn't support past the
            // first `manage()` call for a given type.
            let settings_repo = SqliteSettingsRepository::new(shared_conn.clone());
            app.manage(Box::new(settings_repo) as DynSettingsRepository);
            let account_repo = SqliteAccountRepository::new(shared_conn.clone());
            app.manage(Box::new(account_repo) as DynAccountRepository);
            let category_repo = SqliteCategoryRepository::new(shared_conn.clone());
            app.manage(Box::new(category_repo) as DynCategoryRepository);
            let entry_repo = SqliteEntryRepository::new(shared_conn.clone());
            app.manage(Box::new(entry_repo) as DynEntryRepository);
            let reconciliation_repo = SqliteReconciliationRepository::new(shared_conn.clone());
            app.manage(Box::new(reconciliation_repo) as DynReconciliationRepository);
            let recurring_repo = SqliteRecurringRuleRepository::new(shared_conn.clone());
            app.manage(Box::new(recurring_repo) as DynRecurringRuleRepository);
            app.manage(shared_conn);

            app.manage(StartupDbError(std::sync::Mutex::new(startup_error)));
            app.manage(Box::new(folder_repo) as DynDataFolderLocationRepository);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
