import * as vm from 'vm';

export interface RunOptions {
  print: (...args: any[]) => void;
  input?: (prompt?: string) => Promise<string>;
}

class ExitSignal extends Error {
  constructor(public code: number) { super(`exit ${code}`); }
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
    input: async (prompt?: string) => (await opts.input?.(prompt)) ?? '',
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
