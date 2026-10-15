# Desktop agent working agreement

These instructions apply to Codex agents working in this repository, including Luna and Terra. They govern implementation and reporting; they do not change Memex runtime agents.

## Preserve the approved assignment

- Read the current plan and its acceptance ledger before editing. For Code-mode work, use `MEMEX_CODE_QOL_PLAN.md`.
- Carry out the entire authorized scope. Send concise milestone updates and continue; a commit, test run, or progress update is not a reason to stop. Reuse approval already given in the conversation.
- Do not silently shrink a requirement, replace the requested interaction with an easier one, or defer required work as optional polish. Record dependencies and concrete blockers; continue independent authorized work.
- Keep the original milestone IDs. Small patches are progress within a milestone, not newly completed milestones.
- Preserve unrelated work and user terminology. Do not touch SaltMedia. Backend/service/release actions require authority within the current assignment; an API gap must remain visible rather than being hidden by a UI change.

## Completion requires acceptance evidence

- Before implementing an item, record its expected user behavior, acceptance checks, dependencies, and required evidence in the plan or linked ledger. Reuse existing criteria rather than rewriting them to match the patch.
- Track implementation, verification, packaging, and installed acceptance separately. A clean working tree means only that tracked changes are committed. A successful build proves compilation/packaging, not correct behavior.
- Mark an item verified only when every required acceptance check passes. Partial implementation, missing evidence, and blocked checks remain open. Do not invent a pass from a similar test or an earlier version.
- For UI defects, reproduce the reported interaction and compare against the user's reference. Exercise relevant window sizes, scaling, panel combinations, and navigation. Verify the actual desktop build for desktop-specific acceptance. DOM tests and browser previews alone do not prove packaged Electron behavior.
- Record the tested commit or working diff, application version, environment, checks and results, and evidence paths. For packaged checks also record the artifact hash and executable/bundle identity. A process start time or installer timestamp alone does not establish its loaded version.
- Changes to behavior covered by evidence make that evidence stale until relevant checks are rerun. Run checks proportional to the change; avoid repeating unrelated suites merely to increase the reported test count.
- If native inspection is unavailable, state the exact capability limitation and leave native visual acceptance pending. Never claim to have seen the user's screen when only source, logs, or metadata were inspected.

## Review and handoff

- Before declaring completion, review the final result against the original request, every acceptance criterion, and the user's screenshots. Inspect actual changed code and relevant behavior; test totals and diff statistics are not a code review.
- Record unresolved findings and missing checks with their consequence. Do not describe the review as clean while required acceptance remains pending.
- Use an independent reviewer when authorized and useful for substantial changes. Reviewers use the original contract and evidence, reproduce critical checks, and return failed items to implementation. A larger model is not a mandatory approval gate.
- Persist a compact handoff in the plan: original objective, milestone/item status, evidence, failures/blockers, relevant commits/files, and next action. Do not store credentials or copy unrelated user data into evidence.
- Every completion/check-in report states: implemented scope; verified scope and method; remaining criteria/blockers; commit; packaged version; installed acceptance. Use “not performed” where applicable. Never use “done,” “fixed,” or “reviewed successfully” to imply acceptance beyond the evidence.
- Do not produce repeated installers as substitutes for acceptance testing. Package and qualify the requested behavior before claiming a release resolves it. Continue remaining authorized work after intermediate check-ins.

## Memex tool routing

- For builds spanning multiple files/components, call `mcp__memex__memex_swarm` first when available. For research/evaluation outside the current codebase, call `mcp__memex__memex_perspectives` first when available. Explicitly named Memex tools take precedence.
- If a tool is unavailable after discovery, report that briefly and continue with available capabilities within scope; do not imply it ran.
- If a Memex result begins with `[MEMEX QUESTION`, relay the question verbatim and stop for the answer. Reinvoke swarm with the original prompt unchanged and the answer parameter.
- For an explicit `/graphify` request, read and follow the available graphify skill first.

## Agent flow routing

- Bulk, generative, or sweep-style work routes through the five flows in `.agents/skills/`: `flow-blockout`, `flow-batch-edit`, `flow-audit`, `flow-scaffold`, `flow-variants`. Read `.agents/skills/agent-flows/SKILL.md` first — it carries the selection gate and the disambiguation rules. `.agents/skills` is the canonical, vendor-neutral copy; `.claude/skills` is an uncommitted mirror kept for tools that read only their own directory, so edits belong in `.agents/skills`.
- Route only when the target set is enumerable by a rule, the operation is identical per item, and success is verifiable without visual judgment. Otherwise handle the request directly; a flow applied to a judgment task hides the judgment rather than making it.
- Flows are skill definitions, not a runtime feature. The suggested Memex mode in each skill is composer guidance over existing `MemexMode` values; the agent runtime has no flow concept and no new mode flags were introduced.
- Mutating flows (`flow-batch-edit`, `flow-variants`) state their rollback before the first write. `flow-audit` never writes; if a sweep starts fixing what it found, it has become a batch edit and takes that flow's discipline.
