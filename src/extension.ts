import * as vscode from 'vscode';
import * as vm from 'vm';
import { compile } from './compiler';

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
    await runJs(result.js ?? '', doc);
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

async function runJs(js: string, doc: vscode.TextDocument) {
  const builtins: Record<string, any> = {
    print: (...args: any[]) => channel.appendLine(args.map(String).join(' ')),
    len: (x: any) => {
      if (x == null) throw new Error('len(): value is null');
      if (typeof x === 'string' || Array.isArray(x)) return x.length;
      if (typeof x === 'object') return Object.keys(x).length;
      throw new Error(`len(): cannot get length of ${typeof x}`);
    },
    push: (arr: any[], ...items: any[]) => { arr.push(...items); return arr; },
    pop: (arr: any[]) => arr.pop(),
    type: (x: any) => x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x,
    str: (x: any) => String(x),
    num: (x: any) => Number(x),
    abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    sqrt: Math.sqrt, min: Math.min, max: Math.max, random: Math.random,
    input: async (prompt?: string) => {
      const v = await vscode.window.showInputBox({ prompt: prompt ?? '', value: '' });
      return v ?? '';
    },
    exit: (code = 0) => { throw new ExitSignal(code); }
  };

  class ExitSignal extends Error {
    constructor(public code: number) { super(`exit ${code}`); }
  }

  const context = vm.createContext({ ...builtins, console });
  try {
    const result = vm.runInContext(js, context, { filename: doc.fileName + '.js' });
    if (result instanceof Promise) await result;
  } catch (err: any) {
    if (err instanceof ExitSignal) return;
    throw err;
  }
}
