# Memex overnight adaptation and training implementation plan

Date: 2026-09-12. Status: proposed implementation; no training, deployment, or service changes authorized by this document itself.

Ownership update: Memex-centric planning has been handed to the Memex_Core project task "Memex overnight learning and recovery". Desktop-specific scope, integration dependencies and acceptance checks are logged in [DESKTOP_LEARNING_UI_PLAN.md](./DESKTOP_LEARNING_UI_PLAN.md). This document remains the shared requirements reference.

## Objective and hard boundary

Restore dependable overnight learning using the available 8 GB GPU and two 16 GB GPUs, combining evidence-driven harness adaptation, MemPalace memory, and measured model post-training. Runs must survive desktop disconnects, runtime restarts, and recoverable training errors, then return resources to ordinary Memex use.

**SaltMedia must not be interrupted, modified, or affected.** Enforce this in implementation rather than relying on operator memory:

- Explicit allowlists for Memex service IDs, GPU UUIDs, artifact directories, endpoints, and credentials. Unknown ownership means ineligible.
- No SaltMedia mounts, credentials, containers, services, networks, media datasets, or management endpoints in training workers.
- No host reboot, Docker/WSL restart, global prune, driver change, broad process termination, or whole-stack restart as automatic recovery.
- No unrestricted Docker socket in trainers. A narrow supervisor can act only on registered Memex jobs.
- If the 8 GB card shares SaltMedia's host or resources, it is disabled until exclusive GPU ownership and CPU/RAM/disk/network budgets are established. A shared GPU used for media transcoding is not eligible, even if currently idle.
- Shared-host resource isolation must be proven before use; otherwise train on the isolated Memex devices only. Training throughput must yield to this constraint.

Planning inspection was source-only. GPU UUIDs, the 8 GB host, live schedules, runtime versions, and resource availability remain deployment preflight items. Historical Friday recovery notes inform recovery tests; they do not establish current deployment state.

## Current evidence and required repairs

Source: sibling Agent_Swarm repository, agents/training and agents/main.py.

1. dispatcher.py passes evict_inference=True to run_preflight(), whose argument is evict. Repair the contract and verify all launch callers.
2. Dispatcher jobs are in-memory; the API also owns training work through asyncio/to_thread and an in-memory active flag. A separate durable worker must own execution.
3. grpo_trainer.py creates a new run directory and calls trainer.train() without resume_from_checkpoint. Checkpoint writing alone is insufficient recovery.
4. Current generated-completion rewards are 30% length and 70% presence of code-like syntax. Extracted trajectory rewards are calculated separately but do not drive this callback. Replace the proxy reward before enabling unattended RL.
5. Preflight sums total GPU memory and subtracts Ollama model usage, with a fallback assumption of 32 GB. It does not establish actual per-device free memory or account for all GPU consumers. Replace with measured per-device admission checks and fail closed on unknown state.
6. Dispatcher dry-run currently reaches its eviction request before its dry-run branch, and checks active jobs afterward. Fix argument compatibility together with ordering: dry-run must be non-mutating; acquire/exclude ownership before any eviction.
7. Current trainer time budget starts after loading and is checked at step boundaries. Downloads, loading, a hung step, and conversion need separate watchdog deadlines.
8. MemPalace source provides owner-scoped memory/extraction, queued extraction, pending processing, and agent snapshots. Reuse these contracts where possible; verify live capabilities and authorization before integration.

These are source findings, not a diagnosis of the currently deployed service or proof that the nightly scheduler is enabled.

## Three related forms of learning

- Memory: facts, preferences, constraints, corrections, and tested procedures retrieved with owner/project/session scope. Changing facts remain retrievable memories by default.
- Harness adaptation: evidence-backed skills, routing policies, prompts, tool configuration, and verification improvements. Each proposal has evidence, a target metric, an exact diff, evaluation, and rollback.
- Model adaptation: supervised fine-tuning (SFT), preference training, and eventually verifiable-reward RL of candidate adapters. Training uses deliberately eligible examples, not every memory or raw conversation.

Use the article's observe/propose/test/retain-or-revert method for both harness experiments and model experiments. Change one factor per initial experiment so gains can be attributed. Preserve rejected proposal fingerprints, evidence windows, and insufficient-evidence outcomes.

## GPU allocation

| Resource | Initial assignment | Admission and fallback |
|---|---|---|
| 16 GB A | Primary small-model LoRA/QLoRA SFT or preference trainer | Begin with a supported 3–4B model and short sequences; establish peak VRAM through a real pilot. A 7B profile is a subsequent measured candidate. |
| 16 GB B | Rollout generation, independent critic inference, held-out evaluation | Schedule phase-by-phase; it may run a second independent adapter experiment when evaluation is idle. |
| 8 GB | Small-model extraction, deduplication assistance, routing experiments, or evaluation | Only after ownership/isolation verification; smaller model and measured context limits. CPU fallback for preprocessing. |

These assignments are proposals, not hardware-fit guarantees. 8 + 16 + 16 GB is not a single 40 GB device. Do not require heterogeneous multi-host distributed training for the first release. GRPO rollout, reference-model, optimizer, and activation costs require separate profiling from inference fit. Do not promise 14B or larger GRPO on one 16 GB GPU.

Use immutable GPU UUIDs, measured free memory, host RAM and disk quotas, and a persisted lease. Restore only the Memex inference workloads recorded at acquisition and still desired by current policy. Unknown/Friday/non-Memex consumers cause deferral unless explicitly included in an approved resource policy; historical unload permissions are not a blanket nightly policy.

## Durable execution design

Keep training outside the interactive API process. Reuse Memex's existing database where suitable; add a dedicated worker/supervisor under the Memex deployment boundary.

Proposed records:

- adaptation_observations: owner, workspace, session/run, signal type, evidence references, verification status, timestamp, eligibility.
- adaptation_proposals: scope, fingerprint, hypothesis, baseline, target metric, exact change, approval state, evaluation, rollback reference.
- training_jobs and training_attempts: durable ID, phase, recipe/model/dataset revisions, budget, attempt history, heartbeat, lease generation, checkpoint manifest, error classification.
- resource_leases: node/GPU UUID, holder, expiry, fencing generation, prior desired inference state.
- dataset_manifests and model_candidates: hashes, split assignment, provenance, model/tokenizer/template versions, artifact locations, evaluation and promotion state.
- delivery_outbox: idempotent MemPalace writes and deferred synchronization.

State transitions: queued, preflight, preparing, training, checkpointing, evaluating, awaiting_review, completed. Separate paused, retry_wait, blocked, failed, and cancelled states. Completed training and promoted production model are distinct outcomes.

Each phase commits its output manifest before advancing. A dispatcher restart reconciles live worker identity and checkpoints instead of blindly failing or duplicating work. Expired leases need fencing and confirmation that the old process cannot keep writing before reassignment. Duplicate schedule delivery produces one logical job.

The worker retains a local append-only journal when the database is temporarily unavailable. It may finish a bounded step and save a checkpoint, then pause when it cannot renew ownership safely. Reconciliation uses idempotency keys. MemPalace availability is not required for an already snapshotted training job to continue.

## MemPalace and training data

1. Collect session outcomes and corrections with explicit owner/workspace/session/run and Pioneer identity. Count friction without assuming that an interrupt or correction proves model failure.
2. Queue durable extraction through an outbox. Retry transient failures; avoid duplicate memories through source IDs and extraction version.
3. At nightly preparation, retrieve only the authorized scope. Never allow an omitted owner to fall through to unrestricted memory search.
4. Classify eligibility: recall-only, approved training example, evaluation-only, excluded, or revoked. Distinguish observed facts, user corrections, inferred diagnoses, and externally verified outcomes.
5. Build examples from task + relevant context + actions + verified outcome. Retain successful and failed alternatives for preference/RL tasks. A summary of a successful answer is not a verified training trajectory.
6. Remove secrets and excluded private material; preserve provenance and source licenses. Group related sessions/task families before splitting to prevent near-duplicate train/evaluation leakage.
7. Snapshot a bounded immutable dataset with hashes, memory IDs/revisions, source-run IDs, transformation version, split IDs, consent/eligibility, and reward version. Bulk samples and checkpoints live in quota-limited Memex artifact storage; MemPalace stores references and durable lessons.
8. After evaluation, write back a concise verified lesson, supporting report reference, and scope through the outbox. Model-generated lessons do not automatically become trusted labels for the next generation.

Deletion/revocation removes future dataset eligibility and invalidates queued affected snapshots. Retain lineage to identify already-trained adapters requiring retirement/retraining; do not claim deleting a memory removes its influence from existing weights.

## Reward and evaluation policy

Disable the current length/code-marker reward for production adaptation. Establish executable task verifiers before RL:

- Coding: isolated tests, patch applicability, build/type checks, artifact correctness, and prohibited-path checks.
- Tool use/routing: correct tool and arguments, valid ownership, observed task completion, and unnecessary-call rate.
- Recovery: accurate resume state, no duplicated side effects, correct completion reporting.
- Design and research: artifact checks and rubric/human judgments; treat judge scores as fallible and calibrate them against reviewed examples.

Efficiency is a secondary metric subject to correctness constraints. Judge-model scores alone cannot authorize promotion. Keep the evaluator independent of the builder and withhold the final evaluation set from proposal generation, retrieval, training, and reward tuning. Reserve fresh tasks for confirming repeated experiment winners.

Initial method order: verified SFT pilot; preference training where chosen/rejected outcomes exist; short RL experiments once verifiers and rollout budgets are proven. Reuse older validated examples to test and reduce regressions. Measure base model, current production adapter, and candidate with identical harness settings.

## Error recovery contract

| Failure | Required behavior |
|---|---|
| Desktop closes, auth refresh, stream disconnect | Worker continues; UI reconnects by job ID and event cursor. |
| API restarts | Reattach to durable job and current worker; do not duplicate launch. |
| Training worker exits | Resume latest validated checkpoint under a new attempt. |
| Checkpoint write interrupted/corrupt | Ignore incomplete manifest; use previous valid checkpoint. |
| GPU OOM | Terminate only owned worker, release allocation; at most two bounded retries with recorded compatible profile changes. Larger recipe changes become a new experiment. |
| Hung generation or training step | Stage watchdog requests checkpoint/stop; kills only owned worker if necessary; retry budget then blocked state. |
| Database/MemPalace/network outage | Use cached dataset/local journal and bounded outbox retries; pause if ownership cannot be confirmed. |
| Disk quota reached | Pause safely; prune only expired Memex-owned artifacts under explicit retention policy, retaining last recoverable checkpoints. |
| Window ends or interactive demand returns | Checkpoint at a safe boundary, pause, release lease, restore eligible Memex inference. |
| Unsupported kernel/model or deterministic bad data | Block with diagnostics; no endless retries or automatic driver/container-platform changes. |
| Conversion/export fails | Keep trained adapter; retry export independently. |
| Evaluation regresses | Reject candidate and retain existing production version. |
| User cancels | Stop actual owned process tree and persist cancellation; never just clear an in-memory lock. |

Checkpoint manifests include adapter/model state as appropriate, optimizer/scheduler, RNG, step, sampler/data position, recipe/model/tokenizer/dataset hashes, framework/container versions, and checksums. Write to a temporary checkpoint, validate, then atomically publish its manifest. Require at least two recoverable checkpoints. Target a five-minute recovery point at safe boundaries; report actual checkpoint age because a single long step may exceed that target.

## Overnight policy and desktop UX

Initial proposed window: 00:00–06:00 America/Chicago, configurable and timezone/DST-aware. Begin draining 30 minutes before end; reserve time for checkpointing and restoring inference. Admission estimates must include loading, training, evaluation, export, storage, and shutdown. Pause/resume across nights is supported. No useful eligible work means skip with a clear reason.

Modernize the existing Training home and controls as the canonical training surface. Model Arena owns comparative evaluation and links to training candidates; it does not become a duplicate training console. Mission Control presents the overall operational picture and links into the relevant Training run, evaluation, memory job, or agent. Preserve existing names and routes unless a specific navigation change is approved. Show enabled state, schedule, eligible GPU lanes, queued experiment, phase, actual step progress, latest checkpoint, next retry/reason, and morning report. Show Pioneers' real roles and parent/child tasks with stable IDs. Resizable panels retain sizes and views. UI closure cannot own or cancel training implicitly.

### Existing Training home and Mission Control modernization

User clarification, 2026-09-12: Training already has a home; update it. Mission Control has substantial functionality but needs a coherent organization. This supersedes the original proposal to put overnight controls in Eval/Model Arena.

Source inspection found existing surfaces under Agent_Swarm/ui/src/app: /training, /training/launch, /training/runs, /training/models, /training/voice, and /mission-control. Training layout currently exposes Overview, Run History and Launch tabs; its home links to model and voice pages and shows three catalog/run counters. Mission Control includes Overview, Fleet, Agents, Memory, Service Health and Action Queue, plus task-launch shortcuts. These are source locations, not confirmation of which frontend the installed desktop currently renders. Trace desktop access and route ownership before implementation; do not silently turn this into a website redesign or introduce a separate webview.

Define clear ownership:

| Surface | Primary purpose |
|---|---|
| Training home | Tonight's plan, current/queued runs, readiness, schedule, resource limits, and last night's results. |
| Training run detail/history | Full phase timeline, checkpoints, retries, logs, pause/resume/cancel, provenance, artifacts and evaluation outcome. |
| Training configuration | Recipes, eligible data/MemPalace policy, GPU allocation, budgets and schedule. Keep launch and existing model/voice workflows discoverable. |
| Mission Control | What is happening, what needs attention, and what happens next across Memex. Summaries link to the authoritative detail pages. |
| Model Arena | Baseline/candidate comparison, quality gates and evidence supporting promotion or rejection. |

Mission Control overview should prioritize: actionable issues; active work and Pioneers; tonight's readiness/queue; recent outcomes and morning report. Keep Fleet, Memory, Service Health and existing tools accessible as drill-downs. Inventory each existing feature and map its destination before reorganizing; no feature may disappear simply to simplify the page. Move secondary launch shortcuts into a clearly labeled tools area instead of mixing them with live status.

Use one shared job/status contract for Training, Mission Control, Model Arena and Pioneer displays. Distinguish stale/disconnected telemetry, empty data, queued work, paused/retrying jobs and actual failures. Do not render failed requests as zero counts or a healthy idle state. Every actionable issue must show its cause, affected job/resource, current recovery action, and a link to details.

Mission Control's current source includes broad cluster health/container-sweep prompts. Narrow the execution context and target allowlists to Memex for this work. User-facing shortcuts must not bypass the SaltMedia exclusion through a general maintenance agent.

UI acceptance: validate in the installed desktop route, not only a browser preview; demonstrate schedule editing, launch, live progress, pause/resume/cancel, checkpoint inspection, reconnect, result review and navigation back with context retained. Test representative 1280x720 and 1920x1080 windows, supported text/UI scales, keyboard navigation, remembered resize/collapse state, loading/empty/error/stale states, and no overlap with composer or native window controls. Verify deep links preserve run ID and selected view. Verify every pre-existing feature remains reachable. Record visual and interaction evidence before calling the update complete.

Coordinator owns the objective and quality bar; curation/build/critic Pioneers perform bounded work. Every handoff carries job/attempt ID, parent ID, owner/workspace, input hashes, acceptance criteria, output references, and completion evidence. An agent failure must appear in the UI along with whether the coordinator is retrying, proceeding with another worker, or blocked.

Use preapproved policy to run eligible experiments unattended. Initial production promotion remains explicit review after a passing report; future automatic promotion requires an opt-in policy with thresholds, regression gates, and rollback. Harness permissions and tool installation retain their existing approval boundaries.

## IFM/K2 adoption assessment

Verified public sources on 2026-09-12:

- [K2 Horizon](https://ifm.ai/k2/) lists 0.9B, 3.7B, 7B, 32B and larger sparse models. Small checkpoints are candidate baselines; validate actual model card, license, tokenizer/template, architecture, quantization, tool behavior and trainer compatibility before downloading/training. Hardware suitability remains a pilot result, not a vendor performance claim.
- [xllm](https://github.com/ifm-ai/xllm) currently lists only .gitignore, LICENSE and a minimal README. No executable pretraining implementation was available in the inspected main branch.
- [horizon-post-train](https://github.com/ifm-ai/horizon-post-train) likewise currently lists those three files and a coming-soon README. Its exact algorithms, supported hardware and recovery interfaces cannot yet be evaluated.
- [TxT360-v2](https://huggingface.co/datasets/IFM/TxT360-v2) is a pretraining corpus: the card reports 5.29 TB and about 1.84 billion rows. It offers independently streamable subsets and CC BY 4.0 metadata. Use a bounded, provenance-preserving sample only when an experiment needs it. Its raw text is not a ready-made preference or RL-reward dataset.

Recommendation: make the supervisor backend-independent now, with prepare, train, checkpoint, resume, evaluate and export interfaces. Start on a pinned, verified existing trainer. Add an IFM backend only after executable code and licenses/dependencies can be inspected and the same recovery tests pass. Do not block overnight restoration on that release.

K2 experiment sequence: run a small-model inference/tool baseline; prove one short adapter training and resume; compare against the current small Qwen baseline on Memex tasks; extend to 7B only after measured capacity. Sample TxT360 under strict byte/token caps for a distinct continued-pretraining/replay experiment if there is a demonstrated need; prioritize Memex verified trajectories for task adaptation. The dataset card also links code and SFT collections for later suitability review; their contents have not been assessed here.

## Ordered implementation slices and acceptance gates

1. **Inventory and isolation.** Audit live Memex routes, trainer versions, GPU ownership/UUIDs, scheduled triggers, disk/RAM capacity and model consumers. Produce a resource manifest. Prove protected targets are rejected before execution. Exit: eligible devices and bounded storage chosen; SaltMedia excluded.
2. **Durable execution and launcher repair.** Correct preflight/CLI contracts, dry-run behavior, atomic job claims, actual cancellation, worker isolation, checkpoints and resume. Add stage deadlines and GPU leases. Exit: CPU dummy-job fault tests pass for duplicate launch, lost API/worker, corrupt checkpoint and cancellation.
3. **MemPalace data foundation.** Owner-scoped outbox, queued extraction integration, eligibility, immutable dataset manifests, lineage, grouped splits and revocation. Exit: restart/replay produces no duplicates or cross-owner access; MemPalace outage does not destroy a snapshotted job.
4. **Verified reward and adaptation proposals.** Replace proxy rewards; curate a small reviewed task suite; implement rejection ledger, exact proposed changes and baseline comparison. Exit: a long incorrect/code-looking response loses to a correct task result; unsupported claims cannot become verified labels.
5. **Real GPU pilot.** Short 3–4B adapter job on one allowed 16 GB GPU. Force a worker interruption, resume, finish, evaluate and restore inference. API stays responsive. Exit: actual resumed optimizer/step state and outputs verified, peak memory measured, protected resources untouched.
6. **Overnight scheduling, existing Training home, and Mission Control integration.** First inventory existing features and verify how the installed desktop reaches these surfaces. Update Training's canonical controls and organize Mission Control around attention, active work, next work and results. Add persistent schedules, bounded retries, budgets, shared status, progress reconnect, morning reports and remembered panel layout. Exit: close/reopen desktop, restart only the Memex API, simulate network loss and end-of-window behavior; all show correct durable state. Pass the UI interaction, accessibility, feature-preservation and resizing checks above.
7. **Progressive overnight qualification.** One-hour run, then one full window, then three consecutive full windows with a planned recoverable failure. Enable the second 16 GB lane and eligible 8 GB worker incrementally. Exit: every run finishes or intentionally pauses with a valid checkpoint/report and restored inference; no unexplained loss or duplicate work.
8. **IFM comparative experiments.** K2 candidate baselines, bounded dataset experiment, and future backend evaluation when code exists. Exit: reproducible comparison and retained artifacts; promotion only on demonstrated target improvement without protected regressions.

Likely implementation areas: Agent_Swarm agents/training/{dispatcher,preflight,grpo_trainer,export_traces,reward_function}.py; new durable orchestration/store/lease modules and migrations; agents/main.py launch/status adapters; MemPalace service contracts as required; memex-desktop API types/store/Model Arena and Pioneer presentation. Use additive scoped migrations and compatibility adapters; do not replace website routing or shared infrastructure as part of this work.

Definition of done: unattended experiments recover from tested failures, produce independently evaluated candidates, preserve memory/data lineage, visibly report real progress, restore Memex capacity by the scheduled end, and have no ability to mutate or claim SaltMedia resources. Passing unit tests alone does not satisfy the overnight qualification gate.
