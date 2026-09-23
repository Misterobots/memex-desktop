# Memex_Core runtime handoff — mode contract, Collective/Perspectives, and the Gauntlet gap

Date: 2026-09-22. Origin: `memex-desktop` branch `fix/pioneers`, commits `29990ad`..`4f69191`; installer `0.1.108`.
Audience: whoever works in `C:\Users\panca\Documents\Github\Memex_Core` (branch `fix-sse-events` at the time of writing).

Two items. **Item 1 is optional hardening — one clause. Item 2 is a real, silent functional gap that needs porting, and the decision behind it is already made: this tree is the live, actively-developed runtime and `Agent_Swarm` is the incomplete split, so Gauntlet moves here rather than this deployment moving there.**

**Status 2026-09-23 — both items are done in source and the port is live in the serving container.** Item 1 became `_routes_to_dev_harness()` (`agents/main.py:2466`, with `and not request.research_mode` at `:2497`, used at `:2546`). Item 2 landed on `fix-sse-events` at `10d3c128` (fast-forward merge of `worktree-keen-elm-b2e5f3`): the `422`-without-bar and handoff-id guard, `_gauntlet_prompt`, the immutable contract block, `create_run` before streaming, `gauntlet_bar` through `church.py` → `handlers/coordinate.py` → the coordinator, the critic verdict with `VERDICT: PASS` parsing plus the repair and re-check passes, and the `swarm_runs.gauntlet_bar` column, `swarm_gauntlet_reviews` table and `record_gauntlet_review()` writer. `tests/test_gauntlet_critic_gate.py` and `tests/test_gauntlet_routing.py` add 43 cases. Two notes on the state of that verification, both cross-referenced in the desktop plan's `Mode contract fix` checkpoint:

1. ~~The tests do not collect on a bare workstation.~~ **Applied 2026-09-23:** `ollama` and `prometheus_client` were added to `_ALLOWED_ABSENT` in both files, and `python -m pytest tests/test_gauntlet_critic_gate.py tests/test_gauntlet_routing.py` then collected 43 and passed 43 in 3.42s with no outside help. The two edits sit uncommitted in the `Memex_Core` working tree, since this client's guard denies out-of-tree git. For the record: the tests were always reachable in the running container — the image mounts the whole repo at `/workspace` — what it lacks is `pytest` itself, so this was never a mount problem and needs no compose change. The real gap is that nothing executes the suite automatically anywhere; `.github/workflows/` contains only `docs.yml`.
2. ~~Nothing is running.~~ **Resolved 2026-09-23: the port is live.** `agent_runtime` started `2026-09-23T13:10:37Z`, ten hours after the merge wrote the sources, still mounting `Memex_Core\agents`; its served `/openapi.json` `ChatRequest` declares `gauntlet_bar` and `gauntlet_handoff`, and a read-only query finds `swarm_gauntlet_reviews` and `swarm_runs.gauntlet_bar`. Also worth recording: this tree's `_enforce_chat_features` never adds a `swarm` entitlement and its `FEATURES` has no such key, so the 403 risk raised in the constraints note above does not apply here.

---

## Copy-paste prompt

> The desktop's Code mode and Collective semantics were fixed client-side in `memex-desktop`
> (commits `29990ad`..`2b27f7e` on `fix/pioneers`). The desktop sends **no mode string** — it
> flattens `MODE_FLAGS` into the request body, so the boolean flags are the entire contract.
> Two changes are needed in this tree (`Memex_Core`), which is the one bind-mounted by
> `execution_plane/docker-compose.yml` into the running `agent_runtime` (`:8008`).
>
> **1. `agents/main.py` — `_is_swarm_turn` should also exempt `research_mode`.** Around
> `agents/main.py:2436`, the guard that keeps `dev_mode` from swallowing a coordinator request
> lists `swarm_mode`, `gauntlet_mode`, the `swarm` model sentinel and the slash prefixes, but not
> `research_mode`. A request carrying `dev_mode` + `research_mode` without `swarm_mode` is
> therefore served by the single-agent DevHarness loop and `research_mode` never reaches
> `church.py`'s router or its slash table. Add `or request.research_mode` to that boolean.
> Confirm the resulting intent: `research_mode` alone must still resolve to `RESEARCH`
> (`agents/church.py:1158`), not `COORDINATE`.
>
> **2. Gauntlet is accepted and then dropped.** `ChatRequest` has `gauntlet_mode` (declared near
> `agents/main.py:674`, used only in the `_is_swarm_turn` test near `:2440`) and
> `model_config = ConfigDict(extra="allow")`, so the desktop's `gauntlet_bar` and
> `gauntlet_handoff` fields parse, are stored as extras, and are read by nothing. There is no
> `gauntlet_bar`, `gauntlet_handoff`, `quality_bar`, `_gauntlet_prompt` or `record_gauntlet_review`
> anywhere in `agents/`. Net behaviour: a Gauntlet run from the desktop silently becomes an
> ordinary Collective build, the quality bar the user typed is discarded, and the completion
> record at `electron/gauntlet-handoff-store.ts` on the client implies a critic loop that never
> ran. This is a lineage split, not an unfinished feature: `Agent_Swarm` carries the complete
> implementation and this tree carries the field declaration only. **The decision on which tree
> is authoritative has been made — this tree is the one under active development, and `Agent_Swarm`
> is the incomplete split. So the job is to port Gauntlet *into* this tree.** The port is a
> semantic merge across five files, not a file copy: all five differ between the trees already.
> The per-file inventory is below ("Item 2 port brief"). **Do not "fix" this by deleting the
> client's quality-bar fields** — the client contract is already shipped and correct.
>
> Before writing anything, check for in-flight work here: this repo's own reflog contains
> `wip: gauntlet routing + perspective research groundwork`, which suggests an earlier attempt at
> exactly this may exist on a branch or in a stash. Confirm with `git log --all --oneline -i
> --grep=gauntlet` and `git status --short` / `git stash list` first, and build on it rather than
> duplicating it.
>
> Constraints: preserve legacy wire values (`swarm_mode`, the `swarm` model sentinel, `/swarm`,
> `/build`, `/plan`, `/collective` prefixes) and saved-session `mode` strings — clients store
> `swarm` and label it Collective. `GET /api/v1/permissions` for `misterobots` shows `research`
> and `code` allowed and **no `swarm` feature key at all**, and `_enforce_chat_features` here does
> not require one (`agents/main.py:753-765`), unlike `Agent_Swarm`. Keep that asymmetry in mind:
> adding `swarm` to the required set in this tree would 403 every current Collective unless
> `FEATURES` is extended first.
>
> Acceptance, in this order:
> - `dev_mode` + `swarm_mode` + `research_mode`, streaming → coordinator, and
>   `coordination/orchestrator.py:607` engages Perspective Research Mode (`_use_perspective_mode`
>   true). Stream must show the per-perspective worker launches and a perspective matrix.
> - `dev_mode` + `research_mode` only → still not a DevHarness turn.
> - `gauntlet_mode` + `gauntlet_bar` → the bar is visible to workers and completion is gated on a
>   persisted critic verdict. `gauntlet_mode` with no bar → `422`.
> - `gauntlet_mode` + `dev_mode` → Gauntlet wins over DevHarness (already the documented
>   precedence in `Agent_Swarm`).
> - Plain Code (`dev_mode` only, real model id) → unchanged DevHarness loop, Pioneer `Task`
>   subagents still depth-capped at 1.
>
> This tree is mounted into a container running `uvicorn agents.main:app` **without `--reload`**,
> so no edit here is live until `agent_runtime` restarts. A restart affects other users of the
> shared runtime — get it approved separately and record it.

---

## Follow-on: Collective must run one model by default (2026-09-23)

Reported from a live request: a Collective selected `qwen3.8:27b` and Ollama swapped between it, `gemma4`, `qwen3:14b` and `nomic-embed-text`. Cause is not capacity — Lovelace has **two RTX 5060 Ti, 16311 MiB each (~32 GB)** and the load log shows successful multi-GPU splitting (`CUDA0 7103 MiB + CUDA1 7686 MiB`). Cause is role fan-out:

| Role | Resolved model | Why |
|---|---|---|
| coordinator | `qwen3:14b` | container env `COORDINATOR_MODEL` |
| researcher ← technical/ethical/scientific/regulatory/policy/environmental/social | `gemma4:26b` | `RESEARCHER_MODEL` **unset** → `config.py:102` default |
| analyst ← economic/end_user | `gemma4:26b` | `ANALYST_MODEL` **unset** → `config.py:103` default |
| verifier | `qwen3:14b` | `VERIFIER_MODEL` **unset** → `config.py:104` default |

`_ROLE_ALIASES` (`role_model_resolver.py:48-59`) is what turns "perspectives" into "several models". The selected model survives only as `RoleModelBinding.requested_model`.

### Required behaviour

Default is **one model for the entire run** — the one the user selected. Multi-model is an opt-in, and on the shared/live runtime **administrator-only unless separately approved**, because a fan-out on a 16 GB-per-card box evicts everyone else's resident models.

### Where it should go

`RoleModelSnapshot.for_role` (`role_model_resolver.py:95-102`) is the single decision point: it returns the role's bound model and only falls back to `_SWARM_ROLE_ENV_MAP` when a role is unmapped. So the change is to **populate the snapshot with the selected model for every role** unless multi-model is granted — no other call site needs to know. The snapshot is already serialised (`to_dict`/`from_dict`, and `00_role_model_snapshot_*.json` appears in each run's scratchpad), so the bindings persist across the Gauntlet approval pause in item 2 for free.

### The trap: do not add this to `FEATURES`

`user_permissions._normalize` builds every listed feature as `bool(supplied.get(key, True))` — **default-True** — and `feature_allowed` returns False only for *unlisted* keys. Adding a `multi_model` key to `FEATURES` would therefore hand multi-model to every user until someone writes a policy row, which is the inverse of the requirement. Either gate it outside the `FEATURES` map with an explicit deny-by-default, or add a second map of opt-in-only capabilities.

### The precedent to copy

`permission_mode == "bypass"` is already admin-only, in both the approval service and the replay policy, with the same message and a non-admin rejection:

- `dev_harness/approval_service.py:125-126` → `raise PermissionError("administrator authorization required")`
- `dev_harness/replay_policy.py:53-54` → `return False, "bypass replay requires administrator authorization"`

`_request_is_admin()` (`main.py:767`) already feeds `is_admin` into the coordinator context (`church.py:1306`, `:1348`), so the grant check has a place to live and a per-user audit hook already exists.

### Decided 2026-09-23 — scope accepted for all three

The user approved the whole set, so this is a work list rather than an option menu:

1. **Single model is the default.** A run uses the model the user selected for *every* role. Multi-model remains selectable, but on the shared/live connection it requires authorisation: only `misterobots` today, anyone else by explicit approval — the stated reason is the danger of a fan-out evicting other users' resident models. Implement as the `for_role` snapshot change above plus an admin/approval check, and **do not** express the approval as a plain `FEATURES` key (see the default-True trap).
2. **Stop the eviction churn** — `OLLAMA_MAX_LOADED_MODELS` and/or keeping `nomic-embed-text` resident, so `/api/embed` stops displacing the generation model on a box with 32 GB and one slot. **Applied 2026-09-23** in `execution_plane/docker-compose.yml`: the `ollama` service now declares `OLLAMA_MAX_LOADED_MODELS=2` and lost its lapsed GPU-0 pin (`CUDA_VISIBLE_DEVICES` + `device_ids: ['0']`), so `qwen3.8:27b` and `qwen3.8-flash` can split across both cards. Recreated with `docker compose up -d ollama` and verified on the live container: empty `CUDA_VISIBLE_DEVICES`, `OLLAMA_MAX_LOADED_MODELS:2`, both `CUDA0`/`CUDA1` at 15.9 GiB, and Ollama's own `vram-based default context total_vram="31.9 GiB"`. Note for the record that the pin had *already* lapsed in practice — the running container predated the compose edit that declared it, the bind-mount drift this repo's own AGENTS.md warns about.
3. **Measure `vram_mb`** in `inference/node_health.py` instead of the hardcoded `16384`/`8192`, so the number the runtime reports is real. **Done 2026-09-23** — see "Item 3 result" below; measurement turned out to be impossible in the serving container, so the capacity now comes from the deployment and the field says where it came from.

### Item 3 result (2026-09-23) — and a correction to the two claims above

Two premises in the note below were wrong, and one of them was mine.

- **"Everything routing on that number believes the box is half its size" is false.** `vram_mb` feeds no routing decision and no visible display. Routing is `_get_preferred_host()` → `_model_can_run_on_turing()`, a name-marker allowlist (`_TURING_MODEL_MARKERS`) with no size arithmetic in it; and its own docstring already states the true topology ("Lovelace (2× RTX 5060 Ti, 32 GB)"). The only consumers of the field are `GET /api/v1/health/nodes` → `get_all_statuses()`, where the desktop reads `healthy` and nothing else (`electron/health.ts`), and an unused `vram_mb: number` type declaration at `ui/src/types/chat.ts:481`. So the stale literal misled a human reading the file — me — and nothing else. It was still worth removing, because a wrong integer in a health payload is indistinguishable from a measured one.
- **"`pynvml` is already imported by `gpu_queue.py`" is false.** `pynvml` is imported by `agents/gpu_allocator.py`, which is not importable in the runtime image at all (`ModuleNotFoundError: No module named 'gpu_allocator'`).

**Measurement is not possible in `agent_runtime`.** Verified live in the serving container: `HostConfig.DeviceRequests = null` (no GPU injected), `import pynvml` succeeds but `nvmlInit()` raises `NVMLError_LibraryNotFound: NVML Shared Library Not Found`, `which nvidia-smi` → nothing, `/dev` has no `nvidia*` entries, and there is no `docker` CLI. The Ollama HTTP API offers no escape hatch: `/api/version` returns only `version`, and `/api/ps` returns per-model `size`/`size_vram`, never a device total. So a `pynvml`-based "fix" here would have silently fallen back forever — a change that looks like a fix and does nothing.

What was implemented instead (`agents/inference/node_health.py`):

- `_resolve_node_vram(name, host)` returns `(vram_mb, source)` with `source` ∈ `configured | measured | unknown`. Precedence is explicit config → a real measurement → unknown.
- `_measure_visible_vram_mb()` tries NVML, then `nvidia-smi --query-gpu=memory.total` (the idiom already used in `agents/training/preflight.py:125`), cached for the process lifetime. It attributes a measurement only to a **loopback** node (`_host_is_local`); `http://ollama:11434` is a sibling container on the same machine, and nothing here can prove it shares the cards, so measuring for it would be a guess.
- Unknown is `None`, not a default. That is the point of the change: the failure mode was a plausible integer.
- `get_all_statuses()` now emits `vram_source` beside `vram_mb`.
- `execution_plane/docker-compose.yml` sets `LOVELACE_VRAM_MB=32622` on `agent_runtime` (2 × 16311 MiB) — the deployment is the only party that knows the hardware, and this file already takes its hostnames from env, so hardcoding the size next to them was the actual inconsistency.

Verified: `tests/test_node_vram_reporting.py` — 17 cases, all pass in 0.47s on the workstation (`python -m pytest C:\Users\panca\Documents\Github\Memex_Core\tests\test_node_vram_reporting.py -q`). Includes a source-text guard that fails if either literal returns. The code path was then exercised **inside the live container** against the bind-mounted file: with no env it reports `Lovelace: vram_mb=None source='unknown'`, with `-e LOVELACE_VRAM_MB=32622` it reports `vram_mb=32622 source='configured'` and `_measure_visible_vram_mb()` returns `None`, confirming the container-side prediction.

**Not yet live:** the running `uvicorn` has no `--reload`, and the compose env entry needs `agent_runtime` recreated. Both are actions on the shared runtime and were **not** taken — the restart authorisation in this thread covered the `ollama` service only. `GET /api/v1/health/nodes` will keep returning `16384` until that restart.


Still needed from the user before 1 can be written: what "Memex Live" is as a signal. It appears nowhere in the runtime or the client config — the desktop profiles are `memex-anywhere`, `home-lan`, `localhost` plus one user-added id. Until that's named, the approval gate risks keying on the wrong axis.

### Still worth noting


- ~~`inference/node_health.py:52-66` **hardcodes** `vram_mb=16384` for Lovelace and `8192` for Turing. Lovelace is actually 2 × 16311 MiB.~~ **Fixed 2026-09-23 — see "Item 3 result" above, which also retracts two claims this bullet made:** the number routed nothing (only `healthy` is read downstream), and `pynvml` belongs to `gpu_allocator.py`, not `gpu_queue.py`. What the literal did cost was a misdiagnosis, by me, of a fan-out as a VRAM shortage.
- `OLLAMA_NUM_PARALLEL=1` with no `OLLAMA_MAX_LOADED_MODELS`, while `/api/embed` ran 31 times against 14 `/api/chat` calls in 25 minutes. One slot plus a 2048-vs-32768 context mismatch is the eviction churn; a single-model Collective still pays it.
- The container sets `CONV_MODEL`/`COORDINATOR_MODEL`/`ARCHITECT_MODEL`/`LIBRARIAN_MODEL`/`ROUTER_MODEL` but not the three research-side roles, so the fan-out comes from `config.py` defaults rather than any deliberate choice.



## Uncommitted in `Memex_Core` — needs a commit by someone with git access here

The desktop agent that made these changes is blocked from running git outside its own repository, so everything below sits in the working tree of `C:\Users\panca\Documents\Github\Memex_Core` awaiting `git add` + commit:

| File | Change | Requested by |
| --- | --- | --- |
| `execution_plane/docker-compose.yml` | `ollama`: `OLLAMA_MAX_LOADED_MODELS=2`, GPU-0 pin removed; `agent_runtime`: `LOVELACE_VRAM_MB=32622` | work-list items 2 and 3 |
| `agents/inference/node_health.py` | capacity from deployment / measurement / unknown instead of two hardcoded literals | work-list item 3 |
| `tests/test_node_vram_reporting.py` | new, 17 cases | work-list item 3 |
| `tests/test_gauntlet_critic_gate.py` | `ollama`, `prometheus_client` added to `_ALLOWED_ABSENT` | Gauntlet test collection |
| `tests/test_gauntlet_routing.py` | same `_ALLOWED_ABSENT` addition | Gauntlet test collection |

`python -m pytest tests/test_gauntlet_critic_gate.py tests/test_gauntlet_routing.py tests/test_node_vram_reporting.py` → 60 passed on the workstation.

A `docker compose up -d agent_runtime` is also still needed for the `LOVELACE_VRAM_MB` entry and the `node_health.py` change to reach the running process (no `--reload`). Not performed: it interrupts other users of the shared runtime, and the restart approval in this thread covered `ollama` only.

## Why the Gauntlet gap matters more than the routing clause

The desktop enforces the quality bar in its own composer (`src/components/layout/InputBar.tsx`
refuses to send Gauntlet without one, and `electron/gauntlet-handoff-store.ts` keeps a durable
contract packet). Against a runtime that ignores those fields, that UI is a promise the server
does not keep, and the failure is silent in both directions: no error, no critic, no bar.

Verification is cheap and non-destructive once `agent_runtime` restarts against the mounted tree:
send a Gauntlet turn with a distinctive bar, then grep the container's captured request body for
`gauntlet_bar`. Present-and-used is the pass; present-but-unread is today's fail.

## Item 2 port brief

Measured 2026-09-22 by counting gauntlet-bearing lines in each tree (same five files, both sides):

| File | `Memex_Core` | `Agent_Swarm` | Both trees' copies already differ? |
| --- | --- | --- | --- |
| `agents/main.py` | 2 lines | 39 lines | yes |
| `agents/church.py` | 0 | 2 | yes |
| `agents/handlers/coordinate.py` | 0 | 2 | yes |
| `agents/coordination/orchestrator.py` | 0 | 27 | yes |
| `agents/swarm_run_store.py` | 0 | 13 | yes |

Every one of the five already differs between the trees, so a file copy would silently revert
unrelated work in this tree — including the `research_mode` path this client depends on. Treat it
as transplanting behaviours onto this side's versions. The specific anchors to move (verify them in
the file before use; line numbers will have moved after commit `9c9ce26`):

- **Request surface** — `gauntlet_bar`/`gauntlet_handoff` fields on `ChatRequest`, `_gauntlet_prompt()`,
  the missing-bar `422`, and the `gauntlet_handoff.id` shape guard (`re.fullmatch(r"[A-Za-z0-9_-]{8,128}")`).
- **Precedence** — Gauntlet must outrank the DevHarness branch, and now also outranks a plain
  coordinator request; in `Agent_Swarm` that is `_routes_to_dev_harness()`. This tree expresses the
  same intent through `_is_swarm_turn`, so fold it there rather than importing a second gate.
- **Plumbing** — `chat_swarm(gauntlet_bar=...)` → `ctx["gauntlet_bar"]` → `handle_coordinate` →
  `coordinate_task(gauntlet_bar=...)`.
- **Critic and repair** — the independent-critic block, `VERDICT: PASS` parsing, the repair pass with
  its re-check, and the completion gate on a persisted verdict.
- **Persistence** — `swarm_runs.gauntlet_bar`, the `swarm_gauntlet_reviews` table, `record_gauntlet_review()`,
  and the restart reconciliation that treats a run with a bar as resumable rather than failed.

**The persistence item is a live schema change, not just code.** It adds a column and a table to
Postgres on startup via `IF NOT EXISTS` DDL, so it is additive and safe on paper — but it lands on
a shared database at the same moment the container restarts. Sequence it deliberately and check
existing `swarm_runs` rows still reconcile afterwards.

Test to bring across: `Agent_Swarm/tests/test_gauntlet_handoff_contract.py` (handoff contract, bar
visibility in the prompt, critic-verdict gating). Its source-text assertions will need re-aiming at
this tree's wording.

## Verified state this was written against

| Claim | Evidence |
| --- | --- |
| The running `:8008` runtime serves this tree | `docker inspect agent_runtime` → `com.docker.compose.project.config_files = C:\Users\panca\Documents\Github\Memex_Core\execution_plane\docker-compose.yml`, bind `.../Memex_Core/agents -> /app/agents:rw`, `uvicorn agents.main:app` with no `--reload` |
| Desktop profile points here | `%APPDATA%\memex-desktop\config.json`: active `home-lan` → `http://192.168.2.101:8008` (this host) |
| `_is_swarm_turn` omits `research_mode` | `agents/main.py:2436-2447` |
| No Gauntlet implementation | grep `agents/` for `gauntlet_bar\|gauntlet_handoff\|quality_bar\|record_gauntlet_review` → 0; `gauntlet` → 2 hits, both `main.py` |
| Perspective mode is intact here | `agents/church.py:1158-1161` then `agents/coordination/orchestrator.py:607`; `handlers/coordinate.py:27` reads `ctx["research_mode"]` |
| `swarm` is not an entitlement in this tree | `agents/user_permissions.py:18-31` (`FEATURES` has no `swarm`) and live `GET /api/v1/permissions` |
| Lineage split, not unfinished work | `.git/logs/HEAD` gauntlet-bearing commit messages: this tree 3 (incl. `wip: gauntlet routing + perspective research groundwork`), `Agent_Swarm` 15, with only `feat: dedicate GPU lane for Gauntlet coordination` shared — so the split sits immediately after that commit |
| This tree is the active one, not the stale one | of the 54 `agents/` files that differ between the trees, 47 have a newer mtime here; `coordination/frameworks.py` (48 KB) and `coordination/debate.py` (26 KB) exist only here, both written 2026-09-22 |

Unverified, stated as such: no perspective matrix has been observed end to end from either
workspace; the 8 behavioural tests in `Agent_Swarm/tests/test_dev_harness_routing.py` skip off
container (no `prometheus_client`/`agno` on a workstation); the public `memex-anywhere` profile's
deployment was never inspected and may already run the `Agent_Swarm` code.
