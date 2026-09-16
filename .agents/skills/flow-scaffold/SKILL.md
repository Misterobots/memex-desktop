---
name: flow-scaffold
version: "1.0"
description: "Generate the boilerplate skeleton of one new unit — class, component, service, module, endpoint — with structure, members, and defaults in place but logic left empty. Structure only, never behavior."
---

# Skeleton scaffolding

Generalized from Blueprint scaffolding: create the asset, add components, declare variables,
stub the graph. The structure of a door, a pickup, or a trigger follows a known pattern. The
agent handles the pattern; you handle the specifics.

## The caveat that defines this flow

**Scaffolding works for structure, not logic.** The source post's own warning: do not ask an agent
to wire up complex logic through a structural interface — it does not translate. Build the skeleton
here, then write the behavior where behavior belongs.

If you find yourself describing conditionals, ordering, or state transitions, you have left this
flow. Stop and write the logic directly.

## Use when

- The unit follows a well-known shape in this codebase.
- The boilerplate is 20+ minutes of mechanical setup before any real work starts.
- The pattern already exists nearby to copy conventions from.

Typical targets: a service with its wiring, a component with props and states, a test file with
cases named but unimplemented, a migration shell, an endpoint with validation stubs.

## Do not use when

- No prior example exists — scaffolding an unfamiliar pattern invents a convention instead of
  following one. Establish the pattern by hand once, then scaffold the rest.

## Procedure

1. **Find the nearest existing example and read it.** Conventions come from the codebase,
   not from general practice. Name the file you are matching.
2. **State the skeleton before writing**: members, types, defaults, and which pieces are
   deliberately left empty.
3. **Write structure and leave logic explicit.** Every empty body carries a marker saying what
   belongs there. Never fill a body with a plausible guess — a wrong implementation is more
   expensive than an empty one, because it looks finished.
4. **Register it** where the codebase expects — exports, DI, routes, index files.

## Verification

It compiles/typechecks, it is reachable from where it should be, and its shape matches the
reference example. Behavior is not verified because behavior was not written.

## Rollback

New files plus a small number of registration edits. List every touched file so the skeleton
can be removed cleanly.

## Handoff

State what was created, which example it follows, and every place logic still needs writing.

Suggested Memex mode: **Collective** for several units in disjoint directories; **Chat** for one.
