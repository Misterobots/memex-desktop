---
name: flow-audit
version: "1.0"
description: "Read-only sweep of a large set against an explicit rule list, producing an actionable report — dead references, out-of-range values, orphans, missing links, policy violations. Never mutates. Use before a release, a migration, or a cleanup pass."
---

# Auditing and cleanup

Generalized from pre-ship level validation. Auditing is detective work — scanning a large set for
anomalies — and it is the flow where agents are genuinely strong, because the work is exhaustive
rather than clever.

## The rule that defines this flow

**An audit never writes.** The moment it fixes something it is a batch edit and needs that flow's
predicate confirmation and rollback discipline. Report first; remediate as a separate, decided act.

## Use when

- The set is too large to check by hand reliably — you *will* miss things.
- The checks are enumerable in advance.
- A written report is the deliverable.

Typical targets: dangling references, null/missing assets, values outside sane ranges, orphaned
resources pointing at deleted things, unreachable code, config drift, broken links, missing tests.

## Do not use when

- You cannot name the checks. "Find anything wrong" produces noise. Vague checks yield vague findings.
- The finding requires visual or aesthetic judgment to be a finding at all.

## Procedure

1. **Fix the check list first**, written out, each with its pass condition. Add checks later only
   by amending this list explicitly.
2. **Sweep exhaustively.** State coverage: what was scanned, what was skipped and why. An audit
   that quietly skipped a directory is worse than no audit — it grants false confidence.
3. **Record findings with location, rule violated, actual value, and expected.** A finding a
   reader cannot act on without re-deriving it is not finished.
4. **Separate confirmed from suspected.** Do not pad the count with maybes; label them.

## Verification

Findings are claims and get checked like claims. Re-read each at its cited location before
reporting it. A false positive costs more trust than a missed finding.

## Rollback

None needed — nothing was written. If a rollback question arises, the flow was violated.

## Handoff

Report: checks run, coverage, confirmed findings ranked by consequence, suspected findings
labelled, and checks that could not be run with the reason.

Suggested Memex mode: **Collective** — read-only work parallelizes safely across the set,
which is exactly when swarm concurrency is free of risk.
