use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let handle = app.handle();

            // Build macOS app menu with standard items
            #[cfg(target_os = "macos")]
            let settings_item = MenuItemBuilder::with_id("settings", "Settings...")
                .accelerator("CmdOrCtrl+,")
                .build(handle)?;

            #[cfg(target_os = "macos")]
            let app_menu = {
                SubmenuBuilder::new(handle, "yuzu.shot")
                    .about(None)
                    .separator()
                    .item(&settings_item)
                    .separator()
                    .services()
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .quit()
                    .build()?
            };

            // Build File menu
            let new_project = MenuItemBuilder::with_id("new-project", "New Project")
                .accelerator("CmdOrCtrl+N")
                .build(handle)?;
            let import_project = MenuItemBuilder::with_id("import-project", "Import Project...")
                .accelerator("CmdOrCtrl+Shift+O")
                .build(handle)?;
            let export_project = MenuItemBuilder::with_id("export-project", "Export Project...")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(handle)?;
            let import_screenshots =
                MenuItemBuilder::with_id("import-screenshots", "Import Screenshots...")
                    .accelerator("CmdOrCtrl+O")
                    .build(handle)?;
            let export_current = MenuItemBuilder::with_id("export-current", "Export Current")
                .accelerator("CmdOrCtrl+E")
                .build(handle)?;
            let export_all = MenuItemBuilder::with_id("export-all", "Export All")
                .accelerator("CmdOrCtrl+Shift+E")
                .build(handle)?;

            let file_menu = SubmenuBuilder::new(handle, "File")
                .item(&new_project)
                .separator()
                .item(&import_project)
                .item(&export_project)
                .separator()
                .item(&import_screenshots)
                .separator()
                .item(&export_current)
                .item(&export_all)
                .separator()
                .close_window()
                .build()?;

            // Build Edit menu
            let edit_menu = SubmenuBuilder::new(handle, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .separator()
                .select_all()
                .build()?;

            // Build View menu
            let view_menu = SubmenuBuilder::new(handle, "View")
                .fullscreen()
                .build()?;

            // Build Window menu
            let window_menu = SubmenuBuilder::new(handle, "Window")
                .minimize()
                .maximize()
                .separator()
                .close_window()
                .build()?;

            // Build Help menu
            let documentation = MenuItemBuilder::with_id("documentation", "Documentation")
                .build(handle)?;
            let report_issue =
                MenuItemBuilder::with_id("report-issue", "Report Issue").build(handle)?;
            let visit_website =
                MenuItemBuilder::with_id("visit-website", "Visit yuzuhub.com").build(handle)?;

            let help_menu = SubmenuBuilder::new(handle, "Help")
                .item(&documentation)
                .item(&report_issue)
                .separator()
                .item(&visit_website)
                .build()?;

            // Build the full menu bar
            let mut builder = MenuBuilder::new(handle);
            #[cfg(target_os = "macos")]
            {
                builder = builder.item(&app_menu);
            }
            let menu = builder
                .items(&[
                    &file_menu,
                    &edit_menu,
                    &view_menu,
                    &window_menu,
                    &help_menu,
                ])
                .build()?;

            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(move |app_handle, event| {
                let id = event.id().0.as_str();
                match id {
                    // Help links open directly in system browser
                    "documentation" => {
                        let _ = tauri_plugin_opener::open_url(
                            "https://github.com/YUZU-Hub/appscreen",
                            None::<&str>,
                        );
                    }
                    "report-issue" => {
                        let _ = tauri_plugin_opener::open_url(
                            "https://github.com/YUZU-Hub/appscreen/issues",
                            None::<&str>,
                        );
                    }
                    "visit-website" => {
                        let _ = tauri_plugin_opener::open_url(
                            "https://yuzuhub.com/en",
                            None::<&str>,
                        );
                    }
                    // All other menu actions are forwarded to the frontend
                    _ => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("menu-action", id);
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
