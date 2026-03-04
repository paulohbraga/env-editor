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

function winReadScope(regKey: WinScope, sourceName: string): EnvVar[] {
  try {
    const output = execSync(`reg query "${regKey}"`, { encoding: "utf8" });
    const vars: EnvVar[] = [];
    for (const line of output.split("\n")) {
      const match = line.match(/^\s+(\S+)\s+(REG_\w+)\s+(.*)$/);
      if (match) {
        vars.push({ key: match[1], value: match[3].trim(), source: sourceName });
      }
    }
    return vars;
  } catch {
    return [];
  }
}

function winWriteVar(regKey: WinScope, key: string, value: string): void {
  execSync(`reg add "${regKey}" /v "${key}" /t REG_SZ /d "${value}" /f`, { encoding: "utf8" });
}

function winDeleteVar(regKey: WinScope, key: string): void {
  execSync(`reg delete "${regKey}" /v "${key}" /f`, { encoding: "utf8" });
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
