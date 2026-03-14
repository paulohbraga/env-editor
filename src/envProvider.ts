import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";

export interface EnvVar {
  key: string;
  value: string;
  source: string; // e.g. ".bashrc", ".zshrc", "Windows User", "Windows System"
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Parse export KEY=VALUE lines from a shell rc file. */
function parseShellFile(filePath: string): EnvVar[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const source = path.basename(filePath);
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const vars: EnvVar[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)=["']?(.*)["']?\s*$/);
    if (match) {
      vars.push({ key: match[1], value: match[2].replace(/^["']|["']$/g, ""), source });
    }
  }
  return vars;
}

/**
 * Upsert a KEY=VALUE in a shell rc file.
 * If the key already exists it is replaced in-place; otherwise appended.
 */
function writeShellFile(filePath: string, key: string, value: string): void {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const exportLine = `export ${key}="${value}"`;
  const regex = new RegExp(`^\\s*export\\s+${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, exportLine);
  } else {
    content = content.endsWith("\n") ? content + exportLine + "\n" : content + "\n" + exportLine + "\n";
  }
  fs.writeFileSync(filePath, content, "utf8");
}

/**
 * Delete a KEY export line from a shell rc file.
 */
function deleteFromShellFile(filePath: string, key: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }
  let content = fs.readFileSync(filePath, "utf8");
  const regex = new RegExp(`^\\s*export\\s+${key}=.*\\n?`, "m");
  content = content.replace(regex, "");
  fs.writeFileSync(filePath, content, "utf8");
}

// ─────────────────────────────────────────────
// Windows helpers (reg.exe)
// ─────────────────────────────────────────────

type WinScope = "HKCU\\Environment" | "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment";

/**
 * Escape value for use in Windows reg.exe command.
 * reg.exe is sensitive to special characters and quotes.
 */
function escapeRegValue(value: string): string {
  // Escape backslashes first
  let escaped = value.replace(/\\/g, "\\\\");
  // Escape double quotes
  escaped = escaped.replace(/"/g, '\\"');
  return escaped;
}

function winReadScope(regKey: WinScope, sourceName: string): EnvVar[] {
  try {
    // Use PowerShell with an encoded command to avoid cmd.exe escaping issues
    // and to guarantee correct UTF-8 output (reg.exe can output UTF-16 LE which
    // breaks when decoded as UTF-8 in execSync).
    const psDrive = regKey.startsWith("HKCU\\")
      ? regKey.replace("HKCU\\", "HKCU:\\")
      : regKey.replace("HKLM\\", "HKLM:\\");

    const script =
      `$k=Get-Item '${psDrive}';` +
      `$k.GetValueNames()|ForEach-Object{` +
      `$n=$_;` +
      `$v=$k.GetValue($n,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);` +
      `$n+'=SEP='+$v}`;

    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const output = execSync(
      `powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
      { encoding: "utf8", windowsHide: true }
    );

    const vars: EnvVar[] = [];
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }
      const idx = trimmed.indexOf("=SEP=");
      if (idx > 0) {
        const key = trimmed.substring(0, idx);
        const value = trimmed.substring(idx + 5);
        vars.push({ key, value, source: sourceName });
      }
    }
    return vars;
  } catch (err) {
    return [];
  }
}

function winWriteVar(regKey: WinScope, key: string, value: string): void {
  // Escape special characters in the value for reg.exe
  const escapedValue = escapeRegValue(value);
  const cmd = `reg add "${regKey}" /v "${key}" /t REG_SZ /d "${escapedValue}" /f`;
  try {
    execSync(cmd, { encoding: "utf8" });
  } catch (err) {
    throw new Error(`Failed to save "${key}" to ${regKey}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function winDeleteVar(regKey: WinScope, key: string): void {
  const cmd = `reg delete "${regKey}" /v "${key}" /f`;
  try {
    execSync(cmd, { encoding: "utf8" });
  } catch (err) {
    throw new Error(`Failed to delete "${key}" from ${regKey}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export function readAllVars(): EnvVar[] {
  if (process.platform === "win32") {
    return [
      ...winReadScope("HKCU\\Environment", "Windows User"),
      ...winReadScope(
        "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
        "Windows System"
      ),
    ];
  }

  const home = os.homedir();
  const bashrc = path.join(home, ".bashrc");
  const zshrc = path.join(home, ".zshrc");
  const bash_profile = path.join(home, ".bash_profile");

  return [
    ...parseShellFile(bashrc),
    ...parseShellFile(bash_profile),
    ...parseShellFile(zshrc),
  ];
}

export interface WriteRequest {
  key: string;
  value: string;
  source: string;
}

export function writeVar(req: WriteRequest): void {
  const home = os.homedir();
  if (process.platform === "win32") {
    const regKey: WinScope =
      req.source === "Windows System"
        ? "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"
        : "HKCU\\Environment";
    winWriteVar(regKey, req.key, req.value);
    return;
  }
  const filePath = path.join(home, req.source.startsWith(".") ? req.source : `.${req.source}`);
  writeShellFile(filePath, req.key, req.value);
}

export function deleteVar(req: Omit<WriteRequest, "value">): void {
  const home = os.homedir();
  if (process.platform === "win32") {
    const regKey: WinScope =
      req.source === "Windows System"
        ? "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"
        : "HKCU\\Environment";
    winDeleteVar(regKey, req.key);
    return;
  }
  const filePath = path.join(home, req.source.startsWith(".") ? req.source : `.${req.source}`);
  deleteFromShellFile(filePath, req.key);
}

export function getAvailableSources(): string[] {
  if (process.platform === "win32") {
    return ["Windows User", "Windows System"];
  }
  const home = os.homedir();
  const candidates = [".bashrc", ".bash_profile", ".zshrc"];
  const existing = candidates.filter((f) => fs.existsSync(path.join(home, f)));
  // Always include .zshrc and .bashrc even if they don't exist yet (user can create)
  const defaults = process.platform === "darwin" ? [".zshrc", ".bashrc"] : [".bashrc", ".zshrc"];
  return Array.from(new Set([...existing, ...defaults]));
}
