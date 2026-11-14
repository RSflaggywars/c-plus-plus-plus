import * as vscode from 'vscode';
import { compile } from './compiler';
import { runJs } from './runner';

let channel: vscode.OutputChannel;
let diagnostics: vscode.DiagnosticCollection;
const timers = new Map<string, NodeJS.Timeout>();

export function activate(context: vscode.ExtensionContext) {
  channel = vscode.window.createOutputChannel('c+++');
  diagnostics = vscode.languages.createDiagnosticCollection('c+++');

  const runDoc = (doc: vscode.TextDocument, showJs = false) => {
    if (doc.languageId !== 'c+++') return;
    compileAndRun(doc, showJs);
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(d => runDoc(d)),
    vscode.workspace.onDidSaveTextDocument(d => runDoc(d)),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.languageId !== 'c+++') return;
      const key = e.document.uri.toString();
      const prev = timers.get(key);
      if (prev) clearTimeout(prev);
      timers.set(key, setTimeout(() => runDoc(e.document), 400));
    }),
    vscode.commands.registerCommand('cplus.runFile', () => {
      const ed = vscode.window.activeTextEditor;
      if (ed && ed.document.languageId === 'c+++') compileAndRun(ed.document, false);
    }),
    vscode.commands.registerCommand('cplus.compileFile', () => {
      const ed = vscode.window.activeTextEditor;
      if (ed && ed.document.languageId === 'c+++') compileAndRun(ed.document, true);
    })
  );

  // run any already-open c+++ files
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === 'c+++') runDoc(doc);
  }
}

export function deactivate() {
  diagnostics?.dispose();
  channel?.dispose();
}

async function compileAndRun(doc: vscode.TextDocument, showJs: boolean) {
  const uri = doc.uri;
  channel.show(true);
  channel.appendLine(`\n=== c+++ ${doc.fileName} ===`);

  const result = compile(doc.getText());

  if (!result.ok) {
    diagnostics.set(uri, [{
      severity: vscode.DiagnosticSeverity.Error,
      message: result.error ?? 'compile error',
      range: errorRange(doc, result.line)
    }]);
    channel.appendLine(`Compile error: ${result.error}`);
    vscode.window.showErrorMessage(`c+++: ${result.error}`);
    return;
  }

  diagnostics.set(uri, []);
  if (showJs) {
    channel.appendLine('--- generated JS ---');
    channel.appendLine(result.js ?? '');
    return;
  }

  try {
    await runJs(result.js ?? '', {
      print: (...args) => channel.appendLine(args.join(' ')),
      input: async (prompt) => {
        const v = await vscode.window.showInputBox({ prompt: prompt ?? '', value: '' });
        return v ?? '';
      }
    });
  } catch (err: any) {
    const msg = err?.stack?.split('\n').slice(0, 4).join('\n') ?? String(err);
    channel.appendLine(`Runtime error:\n${msg}`);
    vscode.window.showErrorMessage(`c+++ runtime error: ${err?.message ?? err}`);
  }
}

function errorRange(doc: vscode.TextDocument, line?: number): vscode.Range {
  const lineNum = Math.max(0, (line ?? 1) - 1);
  const text = doc.lineAt(Math.min(lineNum, doc.lineCount - 1)).text;
  return new vscode.Range(lineNum, 0, lineNum, text.length);
}
