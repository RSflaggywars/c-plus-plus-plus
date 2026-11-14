#!/usr/bin/env node
// cppp — command line interface for the c+++ language
// Usage:
//   cppp compile <file.c+++ > [-o output.js]   compile to JavaScript
//   cppp run <file.c+++>                        compile and run
//   cppp <file.c+++>                            same as 'run'

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { compile } = require('../out/compiler');
const { runJs } = require('../out/runner');

const USAGE = `cppp — c+++ command line tool

Usage:
  cppp compile <file> [-o out.js]   Compile a .c+++ file to JavaScript
  cppp run <file>                   Compile and run a .c+++ file
  cppp <file>                       Same as 'run'
`;

function fail(msg) {
  console.error(`cppp: ${msg}`);
  process.exit(1);
}

function readSource(file) {
  if (!fs.existsSync(file)) fail(`file not found: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function doCompile(file, outPath) {
  const source = readSource(file);
  const result = compile(source);
  if (!result.ok) {
    console.error(`${file}:${result.line}: ${result.error}`);
    process.exit(1);
  }
  const out = outPath || defaultJsPath(file);
  fs.writeFileSync(out, result.js);
  console.log(`compiled ${file} -> ${out}`);
}

function defaultJsPath(file) {
  // example.c+++ -> example.js ; foo.cppp -> foo.js
  const base = path.basename(file).replace(/\.(c\+\+\+|cppp)$/i, '');
  return path.join(path.dirname(file), base + '.js');
}

async function doRun(file) {
  const source = readSource(file);
  const result = compile(source);
  if (!result.ok) {
    console.error(`${file}:${result.line}: ${result.error}`);
    process.exit(1);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    await runJs(result.js, {
      print: (...args) => console.log(args.join(' ')),
      input: (prompt) => new Promise(resolve => {
        rl.question(prompt ?? '', ans => resolve(ans));
      })
    });
  } catch (err) {
    console.error(`${file}: runtime error: ${err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n') : err}`);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(USAGE);
    return;
  }

  let cmd = args[0];
  let file;
  let outPath;

  if (cmd === 'compile' || cmd === 'run') {
    file = args[1];
    if (!file) fail(`missing file argument\n\n${USAGE}`);
    if (cmd === 'compile') {
      const oi = args.indexOf('-o');
      if (oi !== -1) {
        outPath = args[oi + 1];
        if (!outPath) fail('missing output path after -o');
      }
      doCompile(file, outPath);
      return;
    }
  } else {
    file = cmd; // bare filename -> run
  }

  await doRun(file);
}

main().catch(err => fail(err.message));
