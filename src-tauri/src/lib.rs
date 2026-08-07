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

use domain::data_folder_location::{DataFolderLocationRepository, DynDataFolderLocationRepository};
use domain::settings::DynSettingsRepository;
use infra::data_folder_location::FsDataFolderLocationRepository;
use infra::db::StartupDbError;
use infra::settings::SqliteSettingsRepository;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::data_folder_location::get_current_data_folder,
            commands::data_folder_location::set_default_data_folder,
            commands::data_folder_location::open_data_folder,
            commands::data_folder_location::move_data_folder,
            commands::db::get_startup_db_error,
            commands::settings::get_display_settings,
            commands::settings::update_display_settings,
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
                let dev_data_dir =
                    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.dev-data");
                (dev_data_dir.join("config"), dev_data_dir.join("data"))
            } else {
                (app.path().app_config_dir()?, app.path().app_data_dir()?)
            };
            let folder_repo = FsDataFolderLocationRepository::new(config_dir, data_dir);

            // No folder configured yet (first launch, or the previously
            // configured folder is unreachable): don't decide unilaterally.
            // The frontend prompts the user (default vs. choose a folder),
            // which then calls back through the commands above — no
            // connection is opened here in that case.
            let mut startup_error = None;
            if let Some(folder) = folder_repo.get_current_folder()? {
                let db_path = folder.join(infra::DB_FILE_NAME);
                match infra::db::open_and_migrate(&db_path) {
                    Ok(shared_conn) => {
                        let settings_repo = SqliteSettingsRepository::new(shared_conn.clone());
                        app.manage(Box::new(settings_repo) as DynSettingsRepository);
                        app.manage(shared_conn);
                    }
                    Err(err) => {
                        log::error!("failed to open the configured data folder: {err}");
                        startup_error = Some(err);
                    }
                }
            }

            app.manage(StartupDbError(std::sync::Mutex::new(startup_error)));
            app.manage(Box::new(folder_repo) as DynDataFolderLocationRepository);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
