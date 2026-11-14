import { lex, Token, CompileError } from './lexer';

// AST node types
export type Stmt =
  | { kind: 'fn'; name: string; params: string[]; body: Stmt[]; line: number }
  | { kind: 'let'; name: string; init: Expr | null; line: number }
  | { kind: 'expr'; expr: Expr; line: number }
  | { kind: 'if'; cond: Expr; then: Stmt[]; else_: Stmt[] | null; line: number }
  | { kind: 'while'; cond: Expr; body: Stmt[]; line: number }
  | { kind: 'for'; init: Stmt | null; cond: Expr | null; update: Expr | null; body: Stmt[]; line: number }
  | { kind: 'forin'; varName: string; iterable: Expr; body: Stmt[]; line: number }
  | { kind: 'return'; value: Expr | null; line: number }
  | { kind: 'break'; line: number }
  | { kind: 'continue'; line: number }
  | { kind: 'block'; body: Stmt[]; line: number };

export type Expr =
  | { kind: 'num'; value: string }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'ident'; name: string }
  | { kind: 'array'; items: Expr[] }
  | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'unary'; op: string; operand: Expr }
  | { kind: 'assign'; op: string; target: Expr; value: Expr }
  | { kind: 'call'; callee: Expr; args: Expr[] }
  | { kind: 'member'; obj: Expr; prop: string }
  | { kind: 'index'; obj: Expr; index: Expr }
  | { kind: 'postfix'; op: string; operand: Expr };

export interface Program {
  statements: Stmt[];
}

export class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    if (t.type !== 'eof') this.pos++;
    return t;
  }

  private atEnd(): boolean {
    return this.peek().type === 'eof';
  }

  private check(value: string): boolean {
    const t = this.peek();
    return t.value === value;
  }

  private checkType(type: Token['type'], value?: string): boolean {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }

  private match(...values: string[]): Token | null {
    if (values.includes(this.peek().value)) return this.next();
    return null;
  }

  private expect(value: string): Token {
    if (this.check(value)) return this.next();
    const t = this.peek();
    throw new CompileError(`expected '${value}' but found '${t.value || 'end of file'}'`, t.line);
  }

  private expectKw(kw: string): Token {
    const t = this.peek();
    if (t.type === 'kw' && t.value === kw) return this.next();
    throw new CompileError(`expected '${kw}' but found '${t.value || 'end of file'}'`, t.line);
  }

  private semicolon() {
    this.match(';');
  }

  parseProgram(): Program {
    const statements: Stmt[] = [];
    while (!this.atEnd()) {
      statements.push(this.parseStatement());
    }
    return { statements };
  }

  private parseStatement(): Stmt {
    const t = this.peek();

    if (t.type === 'kw') {
      switch (t.value) {
        case 'fn': return this.parseFn();
        case 'let': return this.parseLet();
        case 'if': return this.parseIf();
        case 'while': return this.parseWhile();
        case 'for': return this.parseFor();
        case 'return': return this.parseReturn();
        case 'break': this.next(); this.semicolon(); return { kind: 'break', line: t.line };
        case 'continue': this.next(); this.semicolon(); return { kind: 'continue', line: t.line };
      }
    }

    if (this.check('{')) {
      return { kind: 'block', body: this.parseBlock(), line: t.line };
    }

    // expression statement
    const expr = this.parseExpression();
    this.semicolon();
    return { kind: 'expr', expr, line: t.line };
  }

  private parseBlock(): Stmt[] {
    this.expect('{');
    const body: Stmt[] = [];
    while (!this.check('}') && !this.atEnd()) {
      body.push(this.parseStatement());
    }
    this.expect('}');
    return body;
  }

  private parseFn(): Stmt {
    const kw = this.next(); // fn
    const nameTok = this.next();
    if (nameTok.type !== 'id') {
      throw new CompileError(`expected function name after 'fn'`, nameTok.line);
    }
    this.expect('(');
    const params: string[] = [];
    while (!this.check(')') && !this.atEnd()) {
      const p = this.next();
      if (p.type !== 'id') throw new CompileError(`expected parameter name`, p.line);
      params.push(p.value);
      this.match(',');
    }
    this.expect(')');
    const body = this.parseBlock();
    return { kind: 'fn', name: nameTok.value, params, body, line: kw.line };
  }

  private parseLet(): Stmt {
    const kw = this.next(); // let
    const nameTok = this.next();
    if (nameTok.type !== 'id') throw new CompileError(`expected variable name after 'let'`, nameTok.line);
    let init: Expr | null = null;
    if (this.match('=')) {
      init = this.parseExpression();
    }
    this.semicolon();
    return { kind: 'let', name: nameTok.value, init, line: kw.line };
  }

  private parseIf(): Stmt {
    const kw = this.next(); // if
    this.expect('(');
    const cond = this.parseExpression();
    this.expect(')');
    const then = this.parseBlock();
    let else_: Stmt[] | null = null;
    if (this.checkKw('else')) {
      this.next();
      if (this.checkKw('if')) {
        // else if -> wrap single if statement in a block
        const inner = this.parseIf();
        else_ = [inner];
      } else {
        else_ = this.parseBlock();
      }
    }
    return { kind: 'if', cond, then, else_, line: kw.line };
  }

  private checkKw(kw: string): boolean {
    const t = this.peek();
    return t.type === 'kw' && t.value === kw;
  }

  private parseWhile(): Stmt {
    const kw = this.next(); // while
    this.expect('(');
    const cond = this.parseExpression();
    this.expect(')');
    const body = this.parseBlock();
    return { kind: 'while', cond, body, line: kw.line };
  }

  private parseFor(): Stmt {
    const kw = this.next(); // for
    this.expect('(');

    // for x in expr  -> for-of
    const save = this.pos;
    if (this.peek().type === 'id' && this.peek(1).type === 'kw' && this.peek(1).value === 'in') {
      const varName = this.next().value;
      this.next(); // in
      const iterable = this.parseExpression();
      this.expect(')');
      const body = this.parseBlock();
      return { kind: 'forin', varName, iterable, body, line: kw.line };
    }
    this.pos = save;

    // C-style for (init; cond; update)
    let init: Stmt | null = null;
    if (!this.check(';')) {
      if (this.checkKw('let')) {
        init = this.parseLet();
      } else {
        const expr = this.parseExpression();
        this.semicolon();
        init = { kind: 'expr', expr, line: kw.line };
      }
    } else {
      this.next();
    }
    if (!this.check(';')) this.semicolon();

    let cond: Expr | null = null;
    if (!this.check(';')) cond = this.parseExpression();
    this.expect(';');

    let update: Expr | null = null;
    if (!this.check(')')) update = this.parseExpression();
    this.expect(')');

    const body = this.parseBlock();
    return { kind: 'for', init, cond, update, body, line: kw.line };
  }

  private parseReturn(): Stmt {
    const kw = this.next(); // return
    let value: Expr | null = null;
    if (!this.check(';') && !this.check('}') && this.peek().type !== 'eof') {
      value = this.parseExpression();
    }
    this.semicolon();
    return { kind: 'return', value, line: kw.line };
  }

  // ---- expressions ----

  parseExpression(): Expr {
    return this.parseAssign();
  }

  private parseAssign(): Expr {
    const expr = this.parseBinary(0);
    const t = this.peek();
    if (t.type === 'punct' && ['=', '+=', '-=', '*=', '/=', '%='].includes(t.value)) {
      // only identifiers/member/index are valid targets
      if (!['ident', 'member', 'index'].includes(expr.kind)) {
        throw new CompileError(`invalid assignment target`, t.line);
      }
      this.next();
      const value = this.parseAssign();
      return { kind: 'assign', op: t.value, target: expr, value };
    }
    return expr;
  }

  private static BINARY_LEVELS: string[][] = [
    ['||'],
    ['&&'],
    ['==', '!='],
    ['<', '<=', '>', '>='],
    ['+', '-'],
    ['*', '/', '%']
  ];

  private parseBinary(level: number): Expr {
    if (level >= Parser.BINARY_LEVELS.length) return this.parseUnary();
    let left = this.parseBinary(level + 1);
    const ops = Parser.BINARY_LEVELS[level];
    while (this.peek().type === 'punct' && ops.includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseBinary(level + 1);
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (t.type === 'punct' && ['!', '-', '+', '++', '--'].includes(t.value)) {
      this.next();
      return { kind: 'unary', op: t.value, operand: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary();
    while (true) {
      const t = this.peek();
      if (t.type === 'punct' && (t.value === '++' || t.value === '--')) {
        this.next();
        expr = { kind: 'postfix', op: t.value, operand: expr };
        continue;
      }
      if (this.check('.')) {
        this.next();
        const prop = this.next();
        if (prop.type !== 'id') throw new CompileError(`expected property name after '.'`, prop.line);
        expr = { kind: 'member', obj: expr, prop: prop.value };
        continue;
      }
      if (this.check('[')) {
        this.next();
        const index = this.parseExpression();
        this.expect(']');
        expr = { kind: 'index', obj: expr, index };
        continue;
      }
      if (this.check('(')) {
        this.next();
        const args: Expr[] = [];
        while (!this.check(')') && !this.atEnd()) {
          args.push(this.parseExpression());
          this.match(',');
        }
        this.expect(')');
        expr = { kind: 'call', callee: expr, args };
        continue;
      }
      break;
    }
    return expr;
  }

  private parsePrimary(): Expr {
    const t = this.next();

    if (t.type === 'num') return { kind: 'num', value: t.value };
    if (t.type === 'str') return { kind: 'str', value: t.value };
    if (t.type === 'id') return { kind: 'ident', name: t.value };

    if (t.type === 'kw') {
      if (t.value === 'true') return { kind: 'bool', value: true };
      if (t.value === 'false') return { kind: 'bool', value: false };
      throw new CompileError(`unexpected keyword '${t.value}'`, t.line);
    }

    if (t.value === '(') {
      const expr = this.parseExpression();
      this.expect(')');
      return expr;
    }

    if (t.value === '[') {
      const items: Expr[] = [];
      while (!this.check(']') && !this.atEnd()) {
        items.push(this.parseExpression());
        this.match(',');
      }
      this.expect(']');
      return { kind: 'array', items };
    }

    throw new CompileError(`unexpected token '${t.value || 'end of file'}'`, t.line);
  }
}

export function parse(source: string): Program {
  return new Parser(lex(source)).parseProgram();
}
