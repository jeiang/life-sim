# Custom expression language for Packs

Pack conditions, weights, chances, and effect statements use a small custom infix language. It is parsed and type-checked at build time against the Pack's declared stats and qualities, and shipped to the phone as a JSON AST evaluated by an interpreter of about 0.4 KB gzip. Arithmetic is integer-only, and there is no randomness inside expressions. We rejected CEL (`@marcbachmann/cel-js`), the best off-the-shelf option, because it ships about 25 KB gzip of parser, checker, and library to the phone, uses BigInt integers that need conversion at the Core boundary, and depends on a single maintainer. We rejected Jexl because it is unmaintained, uses float division, and silently accepts unknown names. We rejected filtrex and expr-eval for safety reasons (`new Function`, and an unpatched code-execution CVE) ([research](https://github.com/jeiang/life-sim/blob/research/expression-language/docs/research/expression-language.md)).

## Consequences

- We own the parser, checker, interpreter, and author error messages (about 150 lines in the research prototype). CEL stays usable as a differential-testing oracle.
- Adding a function or operator is a Core release, consistent with the closed effect set (ADR 0002).
