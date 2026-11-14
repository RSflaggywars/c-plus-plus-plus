export type TokenType =
  | 'num'
  | 'str'
  | 'id'
  | 'kw'
  | 'punct'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
}

const KEYWORDS = new Set([
  'fn', 'let', 'if', 'else', 'while', 'for', 'in', 'return',
  'break', 'continue', 'true', 'false'
]);

const PUNCTUATORS = [
  '===', '!==', '==', '!=', '<=', '>=', '&&', '||', '++', '--',
  '+=', '-=', '*=', '/=', '%=', '=>',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|',
  '(', ')', '{', '}', '[', ']', ',', ';', '.', ':'
];

export class CompileError extends Error {
  constructor(message: string, public line: number) {
    super(`line ${line}: ${message}`);
    this.name = 'CompileError';
  }
}

export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;

  const peek = (n = 0) => source[i + n];
  const startsWith = (s: string) => source.startsWith(s, i);

  while (i < source.length) {
    const ch = source[i];

    if (ch === '\n') { line++; i++; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }

    // comments
    if (startsWith('//')) {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (startsWith('/*')) {
      i += 2;
      while (i < source.length && !startsWith('*/')) {
        if (source[i] === '\n') line++;
        i++;
      }
      if (i >= source.length) throw new CompileError('unterminated block comment', line);
      i += 2;
      continue;
    }

    // numbers
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(peek(1) ?? ''))) {
      let j = i;
      while (j < source.length && /[0-9]/.test(source[j])) j++;
      if (source[j] === '.') {
        j++;
        while (j < source.length && /[0-9]/.test(source[j])) j++;
      }
      if (source[j] === 'e' || source[j] === 'E') {
        j++;
        if (source[j] === '+' || source[j] === '-') j++;
        while (j < source.length && /[0-9]/.test(source[j])) j++;
      }
      tokens.push({ type: 'num', value: source.slice(i, j), line });
      i = j;
      continue;
    }

    // strings
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < source.length) {
        const c = source[j];
        if (c === '\\') {
          const next = source[j + 1];
          const escapes: Record<string, string> = {
            n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'", '0': '\0'
          };
          value += escapes[next] ?? next;
          j += 2;
          continue;
        }
        if (c === quote) { closed = true; j++; break; }
        if (c === '\n') break;
        value += c;
        j++;
      }
      if (!closed) throw new CompileError('unterminated string', line);
      tokens.push({ type: 'str', value, line });
      i = j;
      continue;
    }

    // identifiers / keywords
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j++;
      const word = source.slice(i, j);
      tokens.push({ type: KEYWORDS.has(word) ? 'kw' : 'id', value: word, line });
      i = j;
      continue;
    }

    // punctuators (longest match first)
    const punct = PUNCTUATORS.find(p => startsWith(p));
    if (punct) {
      tokens.push({ type: 'punct', value: punct, line });
      i += punct.length;
      continue;
    }

    throw new CompileError(`unexpected character '${ch}'`, line);
  }

  tokens.push({ type: 'eof', value: '', line });
  return tokens;
}
