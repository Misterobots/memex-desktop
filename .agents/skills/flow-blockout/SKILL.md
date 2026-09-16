---
name: flow-blockout
version: "1.0"
description: "Turn a natural-language description of a structure into a rough, complete, deliberately imperfect first pass — directory trees, page layouts, schemas, config sets, level layouts. Use when speed of a throwaway draft beats precision. Not for final quality."
---

# Blockout from description

Generalized from level blockout: describe a space, get a rough version in seconds, refine by hand.

**The trade this flow makes:** imperfect in 30 seconds beats perfect in 30 minutes, *when you are
going to iterate on it anyway*. If you are not going to iterate, this is the wrong flow.

## Use when

- The structure is described but does not exist yet.
- The output's job is to be reacted to, not shipped.
- Producing it manually is slow but not hard — dragging, aligning, repeating.

Typical targets: directory/module skeletons, page or screen layout, table schemas from a data
description, fixture sets, infra config stubs, level geometry.

## Do not use when

- The first pass will be treated as the final pass.
- Layout decisions carry judgment — flow, sight lines, information hierarchy, ergonomics.
  The agent builds what you describe; deciding *what* to describe stays with you.

## Procedure

1. **Read back the spec as a dimensioned list** before building. Every element with its
   size, position, count, relationship. Ambiguities get an explicit assumption, stated.
2. **Build the whole thing at once.** Do not stop halfway to check in — a rough pass is only
   useful complete. Partial blockouts cost more to judge than they save.
3. **Keep it obviously rough.** Placeholder names, round numbers, no polish. Polish on a
   blockout reads as finished and invites the wrong review.
4. **List what you guessed.** Every assumption from step 1, as a short list at the end.

## Verification

Check structural completeness against the spec — element count, relationships, nothing missing.
Do not check quality; quality is not the deliverable.

## Rollback

Build into a fresh directory, branch, or unsaved layer. A blockout should be deletable in one
command without touching anything that existed before.

## Handoff

End with: what was built, what was guessed, and what needs human judgment before it is real.

Suggested Memex mode: **Plan**.
