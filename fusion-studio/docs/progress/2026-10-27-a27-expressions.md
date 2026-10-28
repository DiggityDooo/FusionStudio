# A27 expression language — 2026-10-27

## Kernel

New `src/expressions.js`: a safe expression language for drivers and
procedural parameters (the A27 scripting item's expression-language part
previously cited only the catch-all stub).

- Tokenizer + precedence-climbing parser to an AST; compiled expressions
  evaluate against caller contexts. No eval/Function, no member access —
  expressions are safe to store in scene files, and unknown variables or
  functions are hard errors.
- Operators: arithmetic (+ − * / % ^), comparisons, logic, ternary;
  right-associative power with Python-style unary binding (−2^2 = −4,
  2^−2 = 0.25).
- Builtins: trig, atan2, sqrt/exp/log, rounding, min/max/clamp/mix/
  lerp/step/smoothstep, fract; constants pi/tau/e.
- `compileExpression` also extracts the sorted variable dependency list
  (what a driver graph needs for evaluation ordering).
- IEEE edge semantics documented (1/0 = Infinity, sqrt(−1) = NaN).

## Verified (tests/expressions.test.mjs, 7/7)

Precedence/associativity table, scientific notation, dependency
extraction and re-evaluation across contexts, exact builtin values
(clamp/mix/smoothstep midpoint), comparison/logic/ternary semantics
including right-nested ternaries, a realistic per-frame driver
expression with a speed gate, explicit error classes (unknown variable,
unknown function, unbalanced parens, trailing input, member-access
rejection), and NaN/Infinity behavior.

## Ledger

`A27 Python, MEL, MaxScript, ... and expression languages` and
`A27 Procedural asset generators` gain `tests/expressions.test.mjs`.
Both stay partial: this is the expression engine only — no Python/Lua
scripting hosts, no driver UI wiring yet. Backup refreshed
(test-output/kernel-backup-2026-10-27).
