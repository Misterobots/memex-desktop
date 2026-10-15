---
name: agent-flows
version: "1.0"
description: "Routing map for the five agent flows (blockout, batch-edit, audit, scaffold, variants). Read this before running a bulk, generative, or sweep-style task to pick the right flow — or to decide the task should not be a flow at all."
---

# Agent flows — routing map

Five flow archetypes, generalized from StraySpark's "AI Agents in the Unreal Editor"
(https://www.strayspark.studio/blog/ai-agents-unreal-editor-workflows). The post's flows
are Unreal-specific; the *shapes* are not. What transfers is the selection rule, not the tooling.

## The gate — check this before picking a flow

A task belongs in a flow only if all three hold:

1. **Enumerable** — the target set can be named by a rule ("every actor with Pickup in the name",
   "every route handler under `src/api`"), not by taste.
2. **Mechanical** — the same operation applies to each item. Only values change, not reasoning.
3. **Verifiable without judgment** — success is checkable by reading output, running a test, or
   diffing. Not by looking at it and deciding whether it feels right.

If any fails, do not route. Handle it conversationally.

## Never route to a flow

Straight from the post's honest section, generalized:

| Do not flow | Because |
|---|---|
| Complex branching logic | Structure translates to text commands; logic does not |
| Aesthetic / art-direction calls | "Make it look good" is not actionable |
| Anything needing real-time iterative tuning | The loop is human-in-the-middle by nature |
| Anything requiring visual judgment | The agent cannot see the result |
| Decisions about *what* to build | Flows build what you describe; you still decide what to describe |

The last row is the load-bearing one. Every flow below produces structure a human then judges.

## The map

| Flow | Use when | Skill | Suggested Memex mode |
|---|---|---|---|
| **Blockout** | A described-but-nonexistent structure needs to exist roughly, now | `flow-blockout` | Plan |
| **Batch edit** | N existing things need the same mechanical change | `flow-batch-edit` | Chat |
| **Audit** | A large set must be checked against explicit rules; nothing is modified | `flow-audit` | Collective |
| **Scaffold** | One new unit needs its boilerplate skeleton, not its logic | `flow-scaffold` | Collective |
| **Variants** | One parent plus a parameter table should become N named derivatives | `flow-variants` | Chat |

Mode column is a recommendation for the Memex composer. The runtime has no "flow" concept —
these are `MemexMode` values that already exist (`src/types/memex.ts`), chosen to match each
flow's concurrency and mutation profile. Read-only flows parallelize safely; mutating flows
should not.

## Disambiguation

- **Blockout vs Scaffold** — blockout is *layout* of many rough elements to be refined and often
  thrown away; scaffold is *one* unit's skeleton, kept and filled in.
- **Batch edit vs Variants** — batch edit mutates things that already exist; variants create new
  things from a template. If the count grows, it is variants.
- **Audit vs anything else** — audit never writes. The moment it writes, it is a batch edit and
  needs that flow's rollback discipline.

## Shared contract

Every flow states its target set before acting, applies one reversible operation per item,
and ends by handing a human something to judge. A flow that cannot say how to undo itself
is not ready to run.

One caveat the source post's tooling hides: its flows assume a live editor whose undo stack
catches every change. Run the same operation headlessly — a commandlet, a CLI, a script against
a closed project — and that safety net is gone. Rollback becomes VCS or a restored backup, and
the mutating flows say so explicitly rather than inheriting a promise the runtime cannot keep.
