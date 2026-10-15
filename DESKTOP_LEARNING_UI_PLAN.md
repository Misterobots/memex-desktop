# Desktop learning UI work log

Date: 2026-09-12. Status: planned; no application changes or release performed.

## Ownership handoff

Memex_Core now owns planning for overnight learning infrastructure, training recovery, MemPalace data integration, GPU scheduling, adaptation experiments and IFM support. A task titled "Memex overnight learning and recovery" was requested in the Memex_Core project, using an isolated worktree. Initial task setup reference: client-new-thread:e6c260de-6222-4eb7-b27b-b94913b648c2. This reference is a setup identifier, not a resolved task ID.

Full agreed requirements remain in [OVERNIGHT_ADAPTATION_PLAN.md](./OVERNIGHT_ADAPTATION_PLAN.md). Core is asked to retain a Core-owned plan and produce an implementation backlog and versioned integration contract. The current handoff authorizes planning and read-only inventory, not production changes or training launch.

SaltMedia must not be interrupted, modified, or affected. This applies equally to desktop controls, maintenance shortcuts, backend requests and tests.

## Desktop scope, in implementation order

1. Trace the installed desktop's navigation to existing Training and Mission Control. Source pages currently identified in Agent_Swarm/ui/src/app do not prove which surface the installed app uses. Record route/component ownership with Core before overlapping edits.
2. Inventory every existing training control, catalog/history/voice function and Mission Control feature. Preserve discoverability while reorganizing. Use the existing Training home; Model Arena remains the comparison/evaluation surface.
3. Agree on Core's API/event contract and implement typed desktop adapters. Keep one authoritative job identity/status across Training, Mission Control, Model Arena and Pioneer views. Do not independently recreate scheduler or training state in the renderer.
4. Modernize desktop access/presentation for Training: tonight's plan, readiness, schedules, allowed GPU lanes and budgets, active/queued runs, history, checkpoint age, retry reason, provenance, artifacts and morning report. Detailed controls: launch, pause, resume and cancel with acknowledgements and actual server state.
5. Make desktop Mission Control coherent: attention required, active work, next scheduled work and recent outcomes, with links to authoritative detail views. Core owns changes to shared/core-hosted pages; desktop owns native shell/integration and desktop-owned components. Preserve Fleet, Memory, Service Health, Action Queue and useful shortcuts; prohibit SaltMedia-affecting actions.
6. Integrate real Pioneer parent/child activity with stable IDs. Show whether a worker failure is being retried, replaced or blocking the coordinator. Avoid duplicate representations of one agent.
7. Reconnect by durable job ID/event cursor after closing/reopening the app, auth refresh or stream loss. Distinguish stale data, disconnected service, empty state, queued, paused, retrying, failed and completed. A failed fetch must not look like zero runs or a healthy idle system.
8. Verify desktop interaction and layout before packaging. Increment the app build for an eventual approved installer and record exact artifact path/version. This planning handoff does not create or publish a release.

## Contract requested from Core

- Versioned job and experiment IDs, owner/workspace scope, parent/worker IDs and monotonically ordered events.
- Status/phase, progress with units, attempt/retry history, checkpoint manifest reference/age, freshness and blocking reason.
- Schedule/timezone, next run, drain deadline, resource eligibility/lease state and bounded budgets.
- Launch/pause/resume/cancel semantics, idempotency keys, acknowledgements and structured errors.
- Dataset/provenance references, evaluation report, candidate state, promotion/rejection and rollback capability.
- Paginated history, snapshot plus resumable events, and compatibility behavior for older servers.

Use fixtures for early UI development but label them test-only. Live control availability depends on backend capabilities; no optimistic success claims without server acknowledgement. Gate production-facing integration on contract and worker recovery evidence.

## Required UI acceptance evidence

- Test installed desktop routes as well as component/browser checks; no separate webview or website substitution just to demonstrate a feature.
- Exercise schedule editing, launch, live progress, pause/resume/cancel, recovery inspection, result review, deep linking and back navigation.
- Demonstrate desktop close/reopen and stream reconnect without duplicate events, jobs or side effects.
- Verify 1280x720 and 1920x1080 windows, supported UI/text scales, keyboard use, loading/empty/error/stale states.
- All workspace panels are resizable where applicable and remember dimensions, collapse state and selected view. Controls remain reachable; no overlap with composer or native window buttons.
- Show tests in visible terminals/browser panels as requested by the user; capture screenshots and interaction results. A passing typecheck alone is not visual or end-to-end verification.
- Verify every inventoried existing feature remains reachable and no action can target SaltMedia.

## Completion boundary

Desktop work is complete when the installed app presents accurate, reconnectable learning/training controls and coherent Mission Control navigation with verified usability. Core separately proves training completion, fault recovery, resource restoration and overnight qualification. Neither project may substitute its own passing checks for the other's acceptance evidence.
