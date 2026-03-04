import * as vscode from "vscode";
import { readAllVars, writeVar, deleteVar, getAvailableSources, EnvVar } from "./envProvider";

type MessageFromWebview =
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "save"; key: string; value: string; source: string; originalKey: string; originalSource: string }
  | { type: "delete"; key: string; source: string }
  | { type: "add"; key: string; value: string; source: string };

export function createPanel(context: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel(
    "envEditor",
    "Env Vars Editor",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  panel.webview.html = getHtml(panel.webview, context);

  function sendVars() {
    try {
      const vars = readAllVars();
      const sources = getAvailableSources();
      panel.webview.postMessage({ type: "vars", vars, sources });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      panel.webview.postMessage({ type: "error", message: msg });
    }
  }

  panel.webview.onDidReceiveMessage((msg: MessageFromWebview) => {
    switch (msg.type) {
      case "ready":
      case "refresh":
        sendVars();
        break;

      case "save": {
        try {
          // If key or source changed, delete old entry first
          if (msg.originalKey !== msg.key || msg.originalSource !== msg.source) {
            deleteVar({ key: msg.originalKey, source: msg.originalSource });
          }
          writeVar({ key: msg.key, value: msg.value, source: msg.source });
          sendVars();
          panel.webview.postMessage({ type: "toast", message: `Saved ${msg.key}` });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          panel.webview.postMessage({ type: "error", message });
        }
        break;
      }

      case "add": {
        try {
          writeVar({ key: msg.key, value: msg.value, source: msg.source });
          sendVars();
          panel.webview.postMessage({ type: "toast", message: `Added ${msg.key}` });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          panel.webview.postMessage({ type: "error", message });
        }
        break;
      }

      case "delete": {
        vscode.window
          .showWarningMessage(
            `Delete "${msg.key}" from ${msg.source}?`,
            { modal: true },
            "Delete"
          )
          .then((answer) => {
            if (answer === "Delete") {
              try {
                deleteVar({ key: msg.key, source: msg.source });
                sendVars();
                panel.webview.postMessage({ type: "toast", message: `Deleted ${msg.key}` });
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                panel.webview.postMessage({ type: "error", message });
              }
            }
          });
        break;
      }
    }
  });
}

function getHtml(webview: vscode.Webview, _context: vscode.ExtensionContext): string {
  const nonce = getNonce();
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Env Vars Editor</title>
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
    }

    h1 { font-size: 1.3em; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    h1 span.badge {
      font-size: 0.65em;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 6px;
      border-radius: 10px;
    }

    /* Toolbar */
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .toolbar input[type="text"] {
      flex: 1 1 200px;
      padding: 5px 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      outline: none;
    }
    .toolbar input[type="text"]:focus {
      border-color: var(--vscode-focusBorder);
    }
    button {
      padding: 5px 12px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      cursor: pointer;
      font-size: inherit;
      font-family: inherit;
    }
    button.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button.danger {
      background: transparent;
      color: var(--vscode-errorForeground);
      border-color: var(--vscode-errorForeground);
    }
    button.danger:hover { background: var(--vscode-inputValidation-errorBackground); }
    button.icon-btn {
      background: transparent;
      border: none;
      padding: 2px 6px;
      color: var(--vscode-foreground);
      opacity: 0.7;
    }
    button.icon-btn:hover { opacity: 1; }

    /* Source filter tabs */
    .source-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
    .source-tab {
      padding: 3px 10px;
      border-radius: 12px;
      border: 1px solid var(--vscode-contrastBorder, var(--vscode-input-border));
      background: transparent;
      cursor: pointer;
      font-size: 0.85em;
      color: var(--vscode-foreground);
      transition: background 0.15s;
    }
    .source-tab.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: transparent;
    }

    /* Table */
    .table-wrap { overflow-x: auto; border-radius: 6px; border: 1px solid var(--vscode-panel-border, var(--vscode-input-border)); }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      background: var(--vscode-editorGroupHeader-tabsBackground);
      padding: 8px 10px;
      text-align: left;
      font-weight: 600;
      font-size: 0.85em;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-input-border));
      white-space: nowrap;
    }
    tbody tr { border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-input-border)); }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: var(--vscode-list-hoverBackground); }
    tbody tr.editing { background: var(--vscode-editor-selectionBackground); }
    td { padding: 6px 10px; vertical-align: middle; word-break: break-all; }
    td.key-col { font-weight: 600; font-family: var(--vscode-editor-font-family); font-size: 0.9em; min-width: 120px; }
    td.val-col { color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); font-size: 0.9em; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    td.src-col { font-size: 0.8em; opacity: 0.7; white-space: nowrap; }
    td.act-col { white-space: nowrap; text-align: right; }

    /* Inline edit row */
    .edit-row td { padding: 8px 10px; background: var(--vscode-editor-background); }
    .edit-row input, .edit-row select {
      width: 100%;
      padding: 4px 7px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
      outline: none;
    }
    .edit-row input:focus, .edit-row select:focus { border-color: var(--vscode-focusBorder); }
    .edit-actions { display: flex; gap: 6px; justify-content: flex-end; margin-top: 4px; }

    /* Add new row */
    .add-panel {
      margin-top: 16px;
      padding: 14px;
      border: 1px dashed var(--vscode-input-border);
      border-radius: 6px;
    }
    .add-panel h3 { font-size: 0.95em; margin-bottom: 10px; }
    .add-panel .fields { display: grid; grid-template-columns: 1fr 2fr auto; gap: 8px; align-items: center; }
    .add-panel input, .add-panel select {
      padding: 5px 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: inherit;
      font-family: inherit;
      outline: none;
      width: 100%;
    }
    .add-panel input:focus, .add-panel select:focus { border-color: var(--vscode-focusBorder); }
    .add-panel .row2 { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; margin-top: 8px; }

    /* Toast */
    #toast {
      position: fixed;
      bottom: 20px; right: 20px;
      padding: 8px 16px;
      border-radius: 6px;
      background: var(--vscode-notificationCenterHeader-background, #333);
      color: var(--vscode-notificationCenter-border, #fff);
      font-size: 0.9em;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
      z-index: 999;
    }
    #toast.show { opacity: 1; }
    #toast.error { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-errorForeground); }

    .empty { padding: 24px; text-align: center; opacity: 0.5; }
    .loading { padding: 24px; text-align: center; font-style: italic; opacity: 0.6; }

    .source-label {
      display: inline-block;
      font-size: 0.75em;
      padding: 1px 6px;
      border-radius: 8px;
      border: 1px solid var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      background: var(--vscode-badge-background);
      opacity: 0.85;
    }
  </style>
</head>
<body>
  <h1>🌐 Env Vars Editor <span class="badge" id="count-badge">…</span></h1>

  <div class="toolbar">
    <input type="text" id="search" placeholder="Filter by name or value…" />
    <button class="secondary" onclick="refresh()">↺ Refresh</button>
  </div>

  <div class="source-tabs" id="source-tabs"></div>

  <div class="table-wrap">
    <table id="vars-table">
      <thead>
        <tr>
          <th>Key</th>
          <th>Value</th>
          <th>Source</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="vars-body">
        <tr><td colspan="4" class="loading">Loading…</td></tr>
      </tbody>
    </table>
  </div>

  <!-- Add new variable panel -->
  <div class="add-panel">
    <h3>+ Add New Variable</h3>
    <div class="fields">
      <input type="text" id="new-key" placeholder="KEY_NAME" spellcheck="false" />
      <input type="text" id="new-value" placeholder="value" spellcheck="false" />
      <select id="new-source"></select>
    </div>
    <div class="row2">
      <span style="font-size:0.8em;opacity:0.6;">Leave value empty to add an empty variable.</span>
      <button class="primary" onclick="addVar()">Add Variable</button>
    </div>
  </div>

  <div id="toast"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let allVars = [];
    let sources = [];
    let activeSource = 'ALL';
    let editingRow = null; // { key, source }

    // ── Message bus ──────────────────────────────────────────────
    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'vars') {
        allVars = msg.vars;
        sources = msg.sources;
        renderSourceTabs();
        renderTable();
        updateAddSourceOptions();
      } else if (msg.type === 'toast') {
        showToast(msg.message, false);
      } else if (msg.type === 'error') {
        showToast('Error: ' + msg.message, true);
      }
    });

    vscode.postMessage({ type: 'ready' });

    // ── Search ───────────────────────────────────────────────────
    document.getElementById('search').addEventListener('input', renderTable);

    // ── Source tabs ──────────────────────────────────────────────
    function renderSourceTabs() {
      const container = document.getElementById('source-tabs');
      const tabs = ['ALL', ...sources];
      container.innerHTML = tabs.map(s =>
        '<button class="source-tab' + (s === activeSource ? ' active' : '') +
        '" onclick="setSource(' + JSON.stringify(s) + ')">' + s + '</button>'
      ).join('');
    }

    function setSource(s) {
      activeSource = s;
      renderSourceTabs();
      renderTable();
    }

    // ── Table ────────────────────────────────────────────────────
    function filteredVars() {
      const q = document.getElementById('search').value.toLowerCase();
      return allVars.filter(v => {
        const matchSource = activeSource === 'ALL' || v.source === activeSource;
        const matchQ = !q || v.key.toLowerCase().includes(q) || v.value.toLowerCase().includes(q);
        return matchSource && matchQ;
      });
    }

    function renderTable() {
      const vars = filteredVars();
      const badge = document.getElementById('count-badge');
      badge.textContent = vars.length + ' var' + (vars.length !== 1 ? 's' : '');

      const tbody = document.getElementById('vars-body');
      if (vars.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty">No variables found.</td></tr>';
        return;
      }

      tbody.innerHTML = vars.map(v => {
        const isEditing = editingRow && editingRow.key === v.key && editingRow.source === v.source;
        if (isEditing) {
          return buildEditRow(v);
        }
        return \`<tr>
          <td class="key-col">\${escHtml(v.key)}</td>
          <td class="val-col" title="\${escHtml(v.value)}">\${escHtml(v.value)}</td>
          <td class="src-col"><span class="source-label">\${escHtml(v.source)}</span></td>
          <td class="act-col">
            <button class="icon-btn" title="Edit" onclick="startEdit(\${JSON.stringify(v.key)},\${JSON.stringify(v.source)})">✏️</button>
            <button class="icon-btn" title="Delete" onclick="deleteVar(\${JSON.stringify(v.key)},\${JSON.stringify(v.source)})">🗑</button>
          </td>
        </tr>\`;
      }).join('');
    }

    function buildEditRow(v) {
      const sourceOptions = sources.map(s =>
        '<option value="' + escHtml(s) + '"' + (s === v.source ? ' selected' : '') + '>' + escHtml(s) + '</option>'
      ).join('');
      return \`<tr class="edit-row">
        <td><input id="edit-key" type="text" value="\${escHtml(v.key)}" spellcheck="false"/></td>
        <td><input id="edit-val" type="text" value="\${escHtml(v.value)}" spellcheck="false"/></td>
        <td><select id="edit-src">\${sourceOptions}</select></td>
        <td>
          <div class="edit-actions">
            <button class="primary" onclick="saveEdit(\${JSON.stringify(v.key)},\${JSON.stringify(v.source)})">Save</button>
            <button class="secondary" onclick="cancelEdit()">Cancel</button>
          </div>
        </td>
      </tr>\`;
    }

    function startEdit(key, source) {
      editingRow = { key, source };
      renderTable();
      // focus key field
      const el = document.getElementById('edit-key');
      if (el) { el.focus(); el.select(); }
    }

    function cancelEdit() {
      editingRow = null;
      renderTable();
    }

    function saveEdit(originalKey, originalSource) {
      const key = document.getElementById('edit-key').value.trim();
      const value = document.getElementById('edit-val').value;
      const source = document.getElementById('edit-src').value;
      if (!key) { showToast('Key cannot be empty', true); return; }
      editingRow = null;
      vscode.postMessage({ type: 'save', key, value, source, originalKey, originalSource });
    }

    function deleteVar(key, source) {
      vscode.postMessage({ type: 'delete', key, source });
    }

    // ── Add ──────────────────────────────────────────────────────
    function updateAddSourceOptions() {
      const sel = document.getElementById('new-source');
      const prev = sel.value;
      sel.innerHTML = sources.map(s =>
        '<option value="' + escHtml(s) + '"' + (s === prev ? ' selected' : '') + '>' + escHtml(s) + '</option>'
      ).join('');
    }

    function addVar() {
      const key = document.getElementById('new-key').value.trim();
      const value = document.getElementById('new-value').value;
      const source = document.getElementById('new-source').value;
      if (!key) { showToast('Key cannot be empty', true); return; }
      vscode.postMessage({ type: 'add', key, value, source });
      document.getElementById('new-key').value = '';
      document.getElementById('new-value').value = '';
    }

    // ── Refresh ──────────────────────────────────────────────────
    function refresh() { vscode.postMessage({ type: 'refresh' }); }

    // ── Toast ────────────────────────────────────────────────────
    let toastTimer;
    function showToast(msg, isError) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.className = 'show' + (isError ? ' error' : '');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { el.className = ''; }, 3000);
    }

    // ── Util ─────────────────────────────────────────────────────
    function escHtml(str) {
      return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
  </script>
</body>
</html>`;
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
