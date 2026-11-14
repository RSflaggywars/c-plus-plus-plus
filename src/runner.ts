import * as vm from 'vm';
import * as fs from 'fs';

export interface RunOptions {
  print: (...args: any[]) => void;
  input?: (prompt?: string) => string | Promise<string>;
}

class ExitSignal extends Error {
  constructor(public code: number) { super(`exit ${code}`); }
}

/**
 * Synchronously read one line from stdin (fd 0).
 * Works with pipes and Windows consoles. Returns '' on EOF.
 */
export function readLineSync(prompt?: string): string {
  if (prompt) process.stdout.write(prompt);
  const buf = Buffer.alloc(1);
  let line = '';
  try {
    while (true) {
      const n = fs.readSync(0, buf, 0, 1, null);
      if (n <= 0) break;
      const ch = buf[0];
      if (ch === 10) break;          // \n
      if (ch === 13) continue;       // \r
      line += String.fromCharCode(ch);
    }
  } catch {
    // stdin not readable synchronously (e.g. extension host) -> EOF
  }
  return line;
}

export async function runJs(js: string, opts: RunOptions): Promise<void> {
  const builtins: Record<string, any> = {
    print: (...args: any[]) => opts.print(...args.map(String)),
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
    input: (prompt?: string) => {
      const r = opts.input?.(prompt);
      return r === undefined ? '' : r; // string or Promise<string>
    },
    exit: (code = 0) => { throw new ExitSignal(code); }
  };

  const context = vm.createContext({ ...builtins, console });
  try {
    const result = vm.runInContext(js, context);
    if (result instanceof Promise) await result;
  } catch (err: any) {
    if (err instanceof ExitSignal) return;
    throw err;
  }
}
