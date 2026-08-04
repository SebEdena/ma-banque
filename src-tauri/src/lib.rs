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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
