# MEMEX_LOADOUT_PLAN.md — Loadout (build-sheet import + apply)

Original objective: give Memex Desktop the "builder" experience the unfurl Agent
Builder has — import an `agent-build-sheet/1` export and apply it to Memex, staged
per section, with the Code-shell tab as the surface. Decisions 2026-10-02: Code
shell only; staged per-section apply; implementer cannot run git here — owner commits.

Contracts this rides on (all verified 2026-10-01/02, do not re-derive):
- `routing.get/set/validate` (`ipc-handlers.ts:628-636`); `set` refuses-with-issues,
  never half-writes. Loadout is the FIRST renderer caller of `set` → validate before set.
- Gateway ids may never enter routing (`ModelPickerPopover.tsx:157,559`); sheet
  repo-id ↔ engine-tag mapping is exact-match only, else a user choice or checklist.
- Slot names open-ended (`routing-config.ts` header) → `unfurl.beltN` slots legal.
- Skill writes: `fs.mkdir` + `fs.writeFile`, firewall prompt outside roots
  (`workspace-firewall.ts:167+`) is the per-file confirmation.

Status vocabulary: OPEN → IMPLEMENTED (code+typecheck+tests) → VERIFIED (all checks
on this table) → INSTALLED (owner saw it in the running app). A commit is not evidence.

| ID | Item | Expected behavior / acceptance | Status | Evidence / what's left |
|----|------|--------------------------------|--------|------------------------|
| L0a | `src/lib/buildsheet.ts` parser | fenced-JSON extraction; rejects missing fence, bad JSON, wrong `format`, `items[i].repo` absent — with path-named errors | VERIFIED 2026-10-02 | vitest: 5/5 on captured fixture + synthetic negatives; typecheck clean |
| L0b | planner `planApply()` | weapon→`default`, belt MODEL→`unfurl.beltN`; exact repo↔tag match or override, else `unmatched`; SKILL→SKILL.md plan; TOOL/PLUGIN→checklist; `next` always passes REAL `validateRouting`; unmatched produces NO routing change | VERIFIED 2026-10-02 | 8/8 incl. real-validator refuse path + real parseSkillFrontmatter round-trip; 13/13 file total |
| L1 | `LoadoutView.tsx` + wiring | Code tab appears (desktop-only); import paste/file; three sections each with before→after table + own Apply; routing validate-before-set with path-addressed issues; skill write "Permission denied" surfaced, never silent | VERIFIED 2026-10-02 | 4/4 view tests (order asserted, refusal never sets, denied surfaced); full suite 521/521, typecheck clean |
| L2 | tab sites | all 5 wired: AppTab union, TabBar (TABS/CODE_TABS/DESKTOP_ONLY), AppShell mount, CommandPalette; (store typed already; sidebar entry deliberately skipped — Loadout is not per-project nav) | VERIFIED 2026-10-02 | existing TabBar/store/palette tests green with "loadout" present |
| L3 | gateway choice UX | unmatched MODEL shows engine-model picker → override → re-plan; no silent mapping anywhere | VERIFIED 2026-10-02 | override test routes only after selectOptions; unmatched stays in MANUAL STEPS |
| L4 | installed acceptance | owner: export from fork → import here → apply Routing → picker says `routed from routing.default`; apply Skills → file in Skills tab list | OPEN | owner's eyes; only then mark done |

Known gaps stated plainly: persona/Personality and Defense items are checklist-only
(harness has no landing surface — unfurl's own D8 note); runtime-side
(skill_registry.py) is a different layer than the SKILL.md scan and is NOT touched;
`unmatched` MODEL defaulting to "gateway checklist" is an instruction, not a write.

Next, in order: L4 owner acceptance (exact steps handed over 2026-10-02) → owner commits in this repo (implementer's shell guard blocks git here; commit only the 9 Loadout files + this plan doc).
