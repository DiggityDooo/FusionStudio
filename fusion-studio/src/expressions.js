'use strict';
// Safe expression language for drivers and procedural parameters: a
// tokenizer + precedence-climbing parser producing an AST, evaluated
// against a caller-supplied variable context. No eval / Function --
// unknown identifiers and functions are errors, so expressions are safe
// to store in scene files. Numbers are doubles; comparisons and logic
// yield booleans; division by zero follows IEEE (Infinity/NaN), as do
// the math builtins on out-of-domain input.

const BUILTINS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  atan2: (a, b) => Math.atan2(a, b),
  sqrt: Math.sqrt, exp: Math.exp, log: Math.log, log2: Math.log2,
  abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sign: Math.sign, fract: (x) => x - Math.floor(x),
  pow: (a, b) => Math.pow(a, b),
  min: (...xs) => Math.min(...xs),
  max: (...xs) => Math.max(...xs),
  clamp: (x, a, b) => Math.min(b, Math.max(a, x)),
  mix: (a, b, t) => a + (b - a) * t,
  lerp: (a, b, t) => a + (b - a) * t,
  step: (edge, x) => (x < edge ? 0 : 1),
  smoothstep: (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  },
};

const CONSTANTS = { pi: Math.PI, tau: Math.PI * 2, e: Math.E, true: true, false: false };

function tokenize(source) {
  const tokens = [];
  let i = 0;
  const isDigit = (ch) => ch >= '0' && ch <= '9';
  const isIdStart = (ch) => /[A-Za-z_$]/.test(ch);
  const isId = (ch) => /[A-Za-z0-9_$]/.test(ch);
  while (i < source.length) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
    if (isDigit(ch) || (ch === '.' && isDigit(source[i + 1] || ''))) {
      let j = i;
      while (j < source.length && isDigit(source[j])) j++;
      if (source[j] === '.') { j++; while (j < source.length && isDigit(source[j])) j++; }
      if (source[j] === 'e' || source[j] === 'E') {
        let k = j + 1;
        if (source[k] === '+' || source[k] === '-') k++;
        if (isDigit(source[k] || '')) { while (k < source.length && isDigit(source[k])) k++; j = k; }
      }
      tokens.push({ type: 'number', value: Number(source.slice(i, j)), at: i });
      i = j;
      continue;
    }
    if (isIdStart(ch)) {
      let j = i;
      while (j < source.length && isId(source[j])) j++;
      tokens.push({ type: 'ident', value: source.slice(i, j), at: i });
      i = j;
      continue;
    }
    const two = source.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
      tokens.push({ type: 'op', value: two, at: i });
      i += 2;
      continue;
    }
    if ('+-*/%^<>!?:(),'.includes(ch)) {
      tokens.push({ type: 'op', value: ch, at: i });
      i++;
      continue;
    }
    throw new Error(`expression: unexpected character '${ch}' at ${i}`);
  }
  tokens.push({ type: 'eof', at: source.length });
  return tokens;
}

const BINARY_PRECEDENCE = {
  '||': 1, '&&': 2,
  '==': 3, '!=': 3,
  '<': 4, '<=': 4, '>': 4, '>=': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
};

export function parseExpression(source) {
  const tokens = tokenize(source);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expectOp = (op) => {
    const tok = next();
    if (tok.type !== 'op' || tok.value !== op) throw new Error(`expression: expected '${op}' at ${tok.at}`);
  };

  function parseTernary() {
    const cond = parseBinary(1);
    if (peek().type === 'op' && peek().value === '?') {
      next();
      const thenBranch = parseTernary();
      expectOp(':');
      const elseBranch = parseTernary();
      return { kind: 'ternary', cond, thenBranch, elseBranch };
    }
    return cond;
  }

  function parseBinary(minPrec) {
    let left = parseUnary();
    for (;;) {
      const tok = peek();
      if (tok.type !== 'op') break;
      const prec = BINARY_PRECEDENCE[tok.value];
      if (prec === undefined || prec < minPrec) break;
      next();
      const right = parseBinary(prec + 1); // left associative
      left = { kind: 'binary', op: tok.value, left, right };
    }
    return left;
  }

  function parseUnary() {
    const tok = peek();
    if (tok.type === 'op' && (tok.value === '-' || tok.value === '+' || tok.value === '!')) {
      next();
      // Python-style: unary binds looser than power on its operand, so
      // -2^2 = -(2^2) = -4 while 2^-2 still parses.
      const operand = parseUnary();
      return { kind: 'unary', op: tok.value, operand };
    }
    return parsePower();
  }

  function parsePower() {
    const base = parsePostfix();
    const tok = peek();
    if (tok.type === 'op' && tok.value === '^') {
      next();
      const exponent = parseUnary(); // right associative, allows 2^-2
      return { kind: 'binary', op: '^', left: base, right: exponent };
    }
    return base;
  }

  function parsePostfix() {
    let node = parsePrimary();
    while (peek().type === 'op' && peek().value === '(') {
      if (node.kind !== 'ident') throw new Error('expression: only named functions can be called');
      next();
      const args = [];
      if (!(peek().type === 'op' && peek().value === ')')) {
        args.push(parseTernary());
        while (peek().type === 'op' && peek().value === ',') {
          next();
          args.push(parseTernary());
        }
      }
      expectOp(')');
      node = { kind: 'call', name: node.name, args };
    }
    return node;
  }

  function parsePrimary() {
    const tok = next();
    if (tok.type === 'number') return { kind: 'number', value: tok.value };
    if (tok.type === 'ident') return { kind: 'ident', name: tok.value };
    if (tok.type === 'op' && tok.value === '(') {
      const inner = parseTernary();
      expectOp(')');
      return inner;
    }
    throw new Error(`expression: unexpected token at ${tok.at}`);
  }

  const ast = parseTernary();
  if (peek().type !== 'eof') throw new Error(`expression: trailing input at ${peek().at}`);
  return ast;
}

function evaluateNode(node, context) {
  switch (node.kind) {
    case 'number': return node.value;
    case 'ident': {
      if (Object.prototype.hasOwnProperty.call(context, node.name)) return context[node.name];
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, node.name)) return CONSTANTS[node.name];
      throw new Error(`expression: unknown variable '${node.name}'`);
    }
    case 'unary': {
      const v = evaluateNode(node.operand, context);
      if (node.op === '-') return -v;
      if (node.op === '+') return +v;
      return !v;
    }
    case 'binary': {
      if (node.op === '&&') return Boolean(evaluateNode(node.left, context)) && Boolean(evaluateNode(node.right, context));
      if (node.op === '||') return Boolean(evaluateNode(node.left, context)) || Boolean(evaluateNode(node.right, context));
      const l = evaluateNode(node.left, context);
      const r = evaluateNode(node.right, context);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '%': return l % r;
        case '^': return Math.pow(l, r);
        case '==': return l === r;
        case '!=': return l !== r;
        case '<': return l < r;
        case '<=': return l <= r;
        case '>': return l > r;
        case '>=': return l >= r;
        default: throw new Error(`expression: unknown operator ${node.op}`);
      }
    }
    case 'ternary':
      return evaluateNode(node.cond, context) ? evaluateNode(node.thenBranch, context) : evaluateNode(node.elseBranch, context);
    case 'call': {
      const fn = BUILTINS[node.name];
      if (!fn) throw new Error(`expression: unknown function '${node.name}'`);
      return fn(...node.args.map((arg) => evaluateNode(arg, context)));
    }
    default:
      throw new Error(`expression: bad node ${node.kind}`);
  }
}

/** Compile an expression: parse once, evaluate against many contexts. */
export function compileExpression(source) {
  const ast = parseExpression(source);
  const variables = new Set();
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.kind === 'ident' && !Object.prototype.hasOwnProperty.call(CONSTANTS, node.name)) variables.add(node.name);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else walk(value);
    }
  })(ast);
  return {
    source,
    ast,
    variables: [...variables].sort(),
    evaluate: (context = {}) => evaluateNode(ast, context),
  };
}

/** One-shot convenience: compile + evaluate. */
export function evaluateExpression(source, context = {}) {
  return compileExpression(source).evaluate(context);
}
