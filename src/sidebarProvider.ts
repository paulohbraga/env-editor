import * as vscode from "vscode";
import { setupWebview } from "./webviewPanel";

export class SidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "envEditor.sidebar";

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
    };
    setupWebview(webviewView.webview, this.context);
  }
}
