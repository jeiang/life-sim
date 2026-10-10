# Pack format: build checks

What the Pack compiler rejects. Part of the [Pack format](index.md).

## Build checks

The Pack compiler (Node, at build time) fails on any of:

- YAML syntax errors, schema violations (TypeBox), or duplicate ids.
- Expressions that fail to parse, reference undeclared names, or have type errors (for example an integer where a boolean is needed).
- Required capabilities that no Pack provides, capability cycles, references or names not exported by a required capability, or dangling ids in references, `next`, or effects.
- Unknown placeholders or unknown icons.
- Ids removed or renamed without a migration entry.

The output is one JSON bundle per Pack (validated content plus expression ASTs), the icon subset, and the credits manifest.
