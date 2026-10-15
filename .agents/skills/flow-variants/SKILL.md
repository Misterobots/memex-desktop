---
name: flow-variants
version: "1.0"
description: "Generate N named derivatives from one parent plus a parameter table — themed variations, environment configs, test fixture sets, material or preset families. Use when the pattern is identical for every instance and only values change."
---

# Variant generation

Generalized from material instances: one master, fifteen children, four parameters each — sixty
edits plus file management, all of it mechanical. Highly structured work where only values change.

## Use when

- There is one parent/template and a table of variants.
- Every variant differs only in parameter values and name.
- A naming convention exists or can be stated in one line.

Typical targets: material or shader instances, theme variations, per-environment configs, test
fixture families, preset sets, localized asset variants.

## Do not use when

- Variants differ structurally, not just in values — that is N scaffolds, not a variant set.
- The values require judgment per variant. Get the table decided first; this flow fills it in,
  it does not author it.

## Procedure

1. **Require the table.** Variant name plus every parameter value. If a cell is missing, ask —
   do not infer values that carry meaning. Inferred parameters are silent defects.
2. **Confirm the naming convention** and derive every name from it, including the awkward cases.
3. **Generate from the parent**, never by editing a previous variant. Chaining copies propagates
   one mistake through the whole set.
4. **Set only the listed parameters.** Everything else inherits. An override the table did not
   ask for is a bug that surfaces months later.

## Verification

Count matches the table. Spot-check every variant's overridden parameters against its row —
this is cheap and catches off-by-one row alignment, the characteristic failure here.
Confirm non-listed parameters still inherit rather than having been copied as literals.

## Rollback

Generated variants are new artifacts — deleting the set restores the prior state, provided the
parent was never modified. Confirm the parent is untouched before finishing.

Generating outside a live editor session — an Unreal commandlet, a headless asset script — means
there is no undo stack to fall back on, so deletion is the only rollback. Generate into a fresh
directory or a clean VCS state that can be reverted wholesale.

## Handoff

Report the set created, the parent used, and any row that needed an assumption. Values still
want a human eye: the flow guarantees the table was applied, not that the table was right.

Suggested Memex mode: **Chat** — structured, deterministic, sequential.
