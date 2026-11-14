import { parse, Program, Stmt, Expr } from './parser';
import { CompileError } from './lexer';

export interface CompileResult {
  ok: boolean;
  js?: string;
  error?: string;
  line?: number;
}

class Emitter {
  private out: string[] = [];
  private indent = 0;

  private line(s = '') {
    this.out.push('  '.repeat(this.indent) + s);
  }

  private block(stmts: Stmt[]) {
    this.indent++;
    for (const s of stmts) this.stmt(s);
    this.indent--;
  }

  program(p: Program): string {
    this.line('(async () => {');
    this.indent++;
    for (const s of p.statements) this.stmt(s);
    this.line('if (typeof main === "function") await main();');
    this.line('})();');
    return this.out.join('\n');
  }

  stmt(s: Stmt) {
    switch (s.kind) {
      case 'fn': {
        const isAsync = containsAwait(s.body);
        this.line(`${isAsync ? 'async ' : ''}function ${s.name}(${s.params.join(', ')}) {`);
        this.block(s.body);
        this.line('}');
        break;
      }
      case 'let':
        this.line(`let ${s.name}${s.init ? ' = ' + this.expr(s.init) : ''};`);
        break;
      case 'expr':
        this.line(`${this.expr(s.expr)};`);
        break;
      case 'block':
        this.line('{');
        this.block(s.body);
        this.line('}');
        break;
      case 'if':
        this.line(`if (${this.expr(s.cond)}) {`);
        this.block(s.then);
        if (s.else_) {
          this.line('} else {');
          this.block(s.else_);
        }
        this.line('}');
        break;
      case 'while':
        this.line(`while (${this.expr(s.cond)}) {`);
        this.block(s.body);
        this.line('}');
        break;
      case 'for': {
        const parts: string[] = [];
        if (s.init) {
          parts.push(s.init.kind === 'let'
            ? `let ${s.init.name}${s.init.init ? ' = ' + this.expr(s.init.init) : ''}`
            : this.expr((s.init as any).expr));
        } else {
          parts.push('');
        }
        parts.push(s.cond ? this.expr(s.cond) : '');
        parts.push(s.update ? this.expr(s.update) : '');
        this.line(`for (${parts.join('; ')}) {`);
        this.block(s.body);
        this.line('}');
        break;
      }
      case 'forin':
        this.line(`for (const ${s.varName} of ${this.expr(s.iterable)}) {`);
        this.block(s.body);
        this.line('}');
        break;
      case 'return':
        this.line(`return${s.value ? ' ' + this.expr(s.value) : ''};`);
        break;
      case 'break':
        this.line('break;');
        break;
      case 'continue':
        this.line('continue;');
        break;
    }
  }

  expr(e: Expr): string {
    switch (e.kind) {
      case 'num':
        return e.value;
      case 'ident':
        return e.name;
      case 'str':
        return JSON.stringify(e.value);
      case 'bool':
        return e.value ? 'true' : 'false';
      case 'array':
        return `[${e.items.map(x => this.expr(x)).join(', ')}]`;
      case 'binary':
        return `(${this.expr(e.left)} ${e.op} ${this.expr(e.right)})`;
      case 'unary':
        return `(${e.op}${this.expr(e.operand)})`;
      case 'await':
        return `(await ${this.expr(e.operand)})`;
      case 'postfix':
        return `(${this.expr(e.operand)}${e.op})`;
      case 'assign': {
        const target = this.expr(e.target);
        if (e.op === '=') return `(${target} = ${this.expr(e.value)})`;
        const base = e.op.slice(0, -1);
        return `(${target} ${base}= ${this.expr(e.value)})`;
      }
      case 'call':
        return `${this.expr(e.callee)}(${e.args.map(a => this.expr(a)).join(', ')})`;
      case 'member':
        return `(${this.expr(e.obj)}).${e.prop}`;
      case 'index':
        return `(${this.expr(e.obj)})[${this.expr(e.index)}]`;
    }
  }
}

function exprHasAwait(e: Expr): boolean {
  switch (e.kind) {
    case 'await': return true;
    case 'binary': return exprHasAwait(e.left) || exprHasAwait(e.right);
    case 'unary': case 'postfix': return exprHasAwait(e.operand);
    case 'assign': return exprHasAwait(e.target) || exprHasAwait(e.value);
    case 'call': return exprHasAwait(e.callee) || e.args.some(exprHasAwait);
    case 'member': return exprHasAwait(e.obj);
    case 'index': return exprHasAwait(e.obj) || exprHasAwait(e.index);
    case 'array': return e.items.some(exprHasAwait);
    default: return false;
  }
}

function stmtsHaveAwait(stmts: Stmt[]): boolean {
  for (const s of stmts) {
    switch (s.kind) {
      case 'fn': break; // nested fn is checked on its own
      case 'let': if (s.init && exprHasAwait(s.init)) return true; break;
      case 'expr': if (exprHasAwait(s.expr)) return true; break;
      case 'if':
        if (exprHasAwait(s.cond)) return true;
        if (stmtsHaveAwait(s.then)) return true;
        if (s.else_ && stmtsHaveAwait(s.else_)) return true;
        break;
      case 'while':
        if (exprHasAwait(s.cond) || stmtsHaveAwait(s.body)) return true;
        break;
      case 'for':
        if ((s.init && s.init.kind === 'let' && s.init.init && exprHasAwait(s.init.init)) ||
            (s.init && s.init.kind === 'expr' && exprHasAwait(s.init.expr)) ||
            (s.cond && exprHasAwait(s.cond)) ||
            (s.update && exprHasAwait(s.update)) ||
            stmtsHaveAwait(s.body)) return true;
        break;
      case 'forin':
        if (exprHasAwait(s.iterable) || stmtsHaveAwait(s.body)) return true;
        break;
      case 'return': if (s.value && exprHasAwait(s.value)) return true; break;
      case 'block': if (stmtsHaveAwait(s.body)) return true; break;
    }
  }
  return false;
}

function containsAwait(body: Stmt[]): boolean {
  return stmtsHaveAwait(body);
}

export function compile(source: string): CompileResult {
  try {
    const program = parse(source);
    const js = new Emitter().program(program);
    return { ok: true, js };
  } catch (err) {
    if (err instanceof CompileError) {
      return { ok: false, error: err.message, line: err.line };
    }
    throw err;
  }
}
