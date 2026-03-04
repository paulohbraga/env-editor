import * as vscode from "vscode";
import { createPanel } from "./webviewPanel";
import { SidebarProvider } from "./sidebarProvider";

export function activate(context: vscode.ExtensionContext): void {
  const cmd = vscode.commands.registerCommand("envEditor.open", () => {
    createPanel(context);
  });

  const sidebarProvider = new SidebarProvider(context);
  const sidebarView = vscode.window.registerWebviewViewProvider(
    SidebarProvider.viewType,
    sidebarProvider
  );

  context.subscriptions.push(cmd, sidebarView);
}

export function deactivate(): void {}
