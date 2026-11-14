// Minimal Debug Adapter Protocol (DAP) server for c+++.
// VS Code spawns this as `node out/debugAdapter.js`; it speaks
// Content-Length framed JSON over stdin/stdout.

import * as fs from 'fs';
import { compile } from './compiler';
import { runJs } from './runner';

let seq = 1;
let buffer = Buffer.alloc(0);

function send(msg: object) {
  const body = JSON.stringify(msg);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function respond(req: any, body?: any) {
  send({ seq: seq++, type: 'response', request_seq: req.seq, command: req.command, success: true, body: body ?? {} });
}

function respondError(req: any, message: string) {
  send({ seq: seq++, type: 'response', request_seq: req.seq, command: req.command, success: false, message });
}

function event(name: string, body?: any) {
  send({ seq: seq++, type: 'event', event: name, body: body ?? {} });
}

function output(text: string) {
  event('output', { category: 'stdout', output: text + '\n' });
}

function handleLaunch(args: any) {
  const program: string | undefined = args?.program;
  if (!program || !fs.existsSync(program)) {
    respondError(currentReq!, `program not found: ${program}`);
    return;
  }

  const source = fs.readFileSync(program, 'utf8');
  const result = compile(source);

  if (!result.ok) {
    output(`c+++ compile error: ${result.error}`);
    respond(currentReq!);
    event('exited', { exitCode: 1 });
    return;
  }

  respond(currentReq!);
  event('initialized', {});

  runJs(result.js ?? '', {
    print: (...a) => output(a.join(' ')),
    input: async () => ''
  }).then(() => {
    event('exited', { exitCode: 0 });
  }).catch((err: any) => {
    output(`c+++ runtime error: ${err?.stack ?? err}`);
    event('exited', { exitCode: 1 });
  });
}

let currentReq: any = null;

function dispatch(msg: any) {
  if (msg.type !== 'request') return;
  currentReq = msg;
  switch (msg.command) {
    case 'initialize':
      respond(msg, {
        supportsConfigurationDoneRequest: true,
        supportsTerminateRequest: true
      });
      break;
    case 'launch':
      handleLaunch(msg.arguments);
      break;
    case 'configurationDone':
    case 'setBreakpoints':
    case 'setExceptionBreakpoints':
    case 'setFunctionBreakpoints':
    case 'threads':
    case 'scopes':
    case 'variables':
    case 'stackTrace':
    case 'modules':
    case 'loadedSources':
    case 'readMemory':
    case 'disassemble':
    case 'terminate':
      if (msg.command === 'threads') respond(msg, { threads: [] });
      else respond(msg);
      break;
    case 'continue':
    case 'next':
    case 'stepIn':
    case 'stepOut':
    case 'reverseContinue':
      respond(msg, { allThreadsContinued: true });
      break;
    case 'pause':
    case 'restart':
    case 'disconnect':
      respond(msg);
      if (msg.command === 'disconnect') process.exit(0);
      break;
    default:
      respondError(msg, `unsupported request: ${msg.command}`);
  }
  currentReq = null;
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    const header = buffer.slice(0, headerEnd).toString();
    const match = /Content-Length: (\d+)/i.exec(header);
    if (!match) { buffer = buffer.slice(headerEnd + 4); continue; }
    const len = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + len) break;
    const body = buffer.slice(bodyStart, bodyStart + len).toString();
    buffer = buffer.slice(bodyStart + len);
    try {
      dispatch(JSON.parse(body));
    } catch (err: any) {
      process.stderr.write(`debugAdapter error: ${err}\n`);
    }
  }
});
