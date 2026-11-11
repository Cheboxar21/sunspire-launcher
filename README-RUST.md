# Sunspire — Rust / Tauri build

The launcher UI is the existing React app. The desktop shell and backend are written in Rust
(Tauri 2), so the shipped executable is a native `sunspire.exe`, not Electron.

## What is implemented

- **Rust backend** — state store, instances, mods, Modrinth catalog/install, Microsoft and offline
  auth, Java detection, Minecraft launching (LightyLauncher), skins, task/launch events.
- **Discord Rich Presence** — shows `В лаунчере`, `Запускает <сборку>`, `Одиночная игра` or
  `Сервер: <host>`. The bundled default is the Sunspire Discord app `1570081050732793906`, so the
  activity uses the Sunspire icon. Discord takes the icon from the registered app, not from the
  launcher process; if you switch the Client ID to another app, that app's icon is shown.
- **Tray / background** — closing the window hides it to the system tray (configurable). The tray
  menu can reopen the launcher, start the active instance, or quit completely.
- **Auto-update** — checks `latest.json` next to the executable, or `SUNSPIRE_UPDATE_URL`, or the
  GitHub releases API. A signed installer is not required by the custom updater; it downloads the
  setup `.exe` and runs it silently.
- **Themes** — Acid, Amber, Cyan, Magenta and Mono, switchable live in Settings.
- **Logo** — the bundled Sunspire artwork is used for the titlebar, sidebar, onboarding, About and
  the Windows executable/installer icons.

## Build

Requirements on Windows:

1. Node.js 20+ and npm.
2. Rust (stable, `x86_64-pc-windows-gnu` or MSVC).
3. MinGW binutils (`dlltool.exe`) on `PATH` when using the GNU target.
4. NSIS is downloaded automatically by Tauri when building the installer.

```bat
npm install
npm run tauri:build
```

Outputs:

- `src-tauri/target/release/sunspire.exe`
- `src-tauri/target/release/bundle/nsis/Sunspire_1.0.0_x64-setup.exe`

For a faster development shell:

```bat
npm run tauri:dev
```

## Update manifest

Place a `latest.json` next to `sunspire.exe` (the installed app directory) or host the same JSON
and set `SUNSPIRE_UPDATE_URL` before launching:

```json
{
  "version": "1.0.1",
  "notes": "Что нового",
  "url": "Sunspire_1.0.1_x64-setup.exe"
}
```

The `url` can be an absolute HTTP(S) URL or a path relative to the working directory.

## Data

State and game files live in `%APPDATA%\Sunspire` (`launcher-state.json`, instances, engine cache,
Java runtimes). Existing Electron state is migrated automatically because the schema is unchanged.
