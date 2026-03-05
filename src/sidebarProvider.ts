import * as vscode from "vscode";
import { createPanel, setupWebview } from "./webviewPanel";

export class SidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "envEditor.sidebar";
  private openedForCurrentVisibility = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
    };
    setupWebview(webviewView.webview, this.context);

    if (webviewView.visible && !this.openedForCurrentVisibility) {
      this.openedForCurrentVisibility = true;
      createPanel(this.context);
    }

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible && !this.openedForCurrentVisibility) {
        this.openedForCurrentVisibility = true;
        createPanel(this.context);
      }
      if (!webviewView.visible) {
        this.openedForCurrentVisibility = false;
      }
    });
  }
}
