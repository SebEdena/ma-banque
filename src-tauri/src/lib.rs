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

use rusqlite::Connection;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let conn = Connection::open(data_dir.join("ma-banque.sqlite"))?;
            let shared_conn = infra::db::init(conn)?;
            app.manage(shared_conn);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
