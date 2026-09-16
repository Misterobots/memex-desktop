---
name: flow-batch-edit
version: "1.0"
description: "Apply one mechanical change across every item matching a predicate — rename, retune, reconfigure, reassign across N files, records, actors, or assets. Use when the change is identical per item and reversible. The highest-value, easiest-to-verify flow."
---

# Batch property editing

Generalized from editing 80 lights or 200 pickups at once. The post recommends starting here:
simplest to verify, fastest to show value.

## Use when

- The target set is selectable by a predicate, not by inspection.
- The operation is identical for every match; only values differ.
- There is an undo — VCS, editor undo stack, transaction, backup.

Typical targets: config keys across services, a renamed symbol across a codebase, dependency
version bumps, property changes across assets, metadata normalization.

## Do not use when

- The right change differs per item in a way that needs reasoning about each one.
- There is no rollback path. Establish one first, then come back.

## Procedure

1. **Resolve the predicate to an explicit list — and show it.** Count included. This is the
   step that prevents the expensive mistake; never skip it because the predicate "looks obvious".
2. **Confirm the set before mutating** whenever the count is larger than expected, the predicate
   was fuzzy, or the change is hard to reverse.
3. **Apply uniformly**, one item at a time, through a mechanism that records an undo entry.
4. **Report per-item outcome**: changed, skipped, failed — with reasons for the last two.
   A silent skip is a defect, not a nuisance.

## Verification

Re-run the predicate and confirm the new state. Then re-run it against the *old* value and
confirm zero matches remain. Both directions, or the check proves nothing.

## Rollback

Know the undo before the first write: single VCS revert, editor undo transaction, or a restored
backup. If undo is per-item rather than whole-batch, say so before starting — a half-reverted
batch is worse than an unapplied one.

**Headless targets have no undo stack.** A change applied outside a live editor session — an
Unreal commandlet, a CLI migration, a script against a closed project — cannot be rolled back by
the application's undo, whatever the tooling's docs imply about undo integration. Rollback there
is VCS or a restored backup, and the flow does not start until one exists. Never promise an undo
you cannot perform.

## Stop conditions

Stop and report if item failures exceed a few, if the predicate matches far more than expected,
or if an item's current state contradicts the assumption behind the change.

Suggested Memex mode: **Chat** — single agent, deterministic, sequential. Parallel workers
mutating one target set cause write conflicts; Collective is the wrong tool here.
