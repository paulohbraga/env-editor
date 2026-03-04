import * as vscode from "vscode";
import { createPanel } from "./webviewPanel";

export function activate(context: vscode.ExtensionContext): void {
  const cmd = vscode.commands.registerCommand("envEditor.open", () => {
    createPanel(context);
  });
  context.subscriptions.push(cmd);
}

export function deactivate(): void {}
