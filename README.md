# c+++

A programming language that is **C++, but easier to learn**. Think of it as "C++ with the
pain removed": no `#include` headers, no manual memory management, no type declarations
required, and an `fn main()` that runs automatically.

c+++ code compiles to JavaScript and runs instantly inside VS Code — just open a
`.c+++` file and it compiles and runs on open, on save, and as you type.

## Quick start

```c+++
fn add(a, b) {
    return a + b
}

fn main() {
    let x = add(2, 3)
    print("2 + 3 =", x)   // prints: 2 + 3 = 5
}
```

Save the file as `hello.c+++`, open it in VS Code with this extension installed,
and the output appears in the **c+++** output channel. If `main()` exists, it runs
automatically — you don't have to call it.

## Syntax cheat sheet

| c+++ | notes |
|---|---|
| `fn name(a, b) { }` | functions |
| `let x = 5` | variables (dynamically typed, semicolons optional) |
| `print(a, b)` | prints values separated by spaces |
| `if (c) { } else { }` | conditionals |
| `while (c) { }` | loops |
| `for (let i = 0; i < n; i++) { }` | C-style for loops |
| `for (x in list) { }` | iterate over arrays |
| `x++`, `x--` | increment / decrement |
| `arr[0]`, `obj.field` | indexing and member access |
| `// comment` and `/* comment */` | comments |
| `return value` | return from a function |
| `break`, `continue` | loop control |

Operators: `+ - * / %`, `== != < <= > >=`, `&& || !`, `+= -= *= /= %=`,
assignment `=`, parentheses, arrays `[1, 2, 3]`, strings `"..."` or `'...'`,
`true` / `false`.

## Built-in functions

| function | description |
|---|---|
| `print(...)` | print values to the output panel |
| `len(x)` | length of a string, array, or object |
| `push(arr, items...)` | append items to an array |
| `pop(arr)` | remove and return the last item |
| `type(x)` | `"number"`, `"string"`, `"array"`, `"object"`, `"boolean"`, `"null"` |
| `str(x)` / `num(x)` | convert to string / number |
| `input(prompt)` | ask the user for input (returns a string) |
| `abs, floor, ceil, round, sqrt, min, max, random` | math helpers |
| `exit(code)` | exit the program |

## How it works

```
.c+++ file ──► lexer ──► parser ──► AST ──► JavaScript ──► runs in VS Code
```

The compiler lives in `src/`:

- `lexer.ts` — turns source text into tokens
- `parser.ts` — builds an AST (abstract syntax tree)
- `compiler.ts` — emits JavaScript
- `extension.ts` — the VS Code extension: watches `.c+++` files and runs them

## Commands

- **c+++: Run File** — compile and run the active `.c+++` file
- **c+++: Compile (show JS output)** — show the generated JavaScript

## Differences from C++ (on purpose)

- No headers or `#include` — everything is built in
- No pointers, no `new`/`delete` — memory is managed for you
- No type declarations needed (`let x = 5` just works)
- Semicolons are optional
- `main()` is called automatically
