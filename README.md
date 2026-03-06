# .env Editor — VS Code Extension

A VS Code extension to **view and edit environment variables** directly from the editor.

## Features

| Platform | Sources |
|----------|---------|
| macOS / Linux | `~/.zshrc`, `~/.bashrc`, `~/.bash_profile` |
| Windows | User environment variables (`HKCU\Environment`) and System environment variables (`HKLM\SYSTEM\…`) |

- 🔍 Filter variables by name or value
- 🗂 Filter by source file / scope via tabs
- ✏️ Inline edit — change the key name, value, or target file  
- ➕ Add new variables via the panel at the bottom
- 🗑 Delete variables with a confirmation dialog
- 🔄 Refresh with one click

## Requirements

- **macOS / Linux**: no extra requirements — the extension reads/writes your shell rc files directly.
- **Windows**: `reg.exe` must be available (it is on all modern Windows installations). Writing to *System* variables requires VS Code to be running as Administrator.

## Usage

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Run `Env Editor: Open Environment Variables`.
3. The panel will show all detected variables. Edit, add, or delete as needed.

> **Note:** Changes to shell rc files (macOS/Linux) take effect in **new** terminal sessions. Reload your terminal or run `source ~/.zshrc` to apply them immediately.

## Development

```bash
# Install dependencies
npm install

# Compile in watch mode
npm run watch

# Press F5 in VS Code to launch the Extension Development Host
```
