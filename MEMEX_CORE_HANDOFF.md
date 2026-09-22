# Memex_Core runtime handoff — mode contract, Collective/Perspectives, and the Gauntlet gap

Date: 2026-09-22. Origin: `memex-desktop` branch `fix/pioneers`, commits `29990ad`..`2b27f7e`.
Audience: whoever works in `C:\Users\panca\Documents\Github\Memex_Core` (branch `fix-sse-events` at the time of writing).

Two items. **Item 1 is optional hardening. Item 2 is a real, silent functional gap and needs a decision, not just a patch.**

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
> ran. Note this repo's history contains two Gauntlet commits ("route Gauntlet through Pioneer
> Collective", "dedicate GPU lane for Gauntlet coordination") while `Agent_Swarm` contains
> fifteen including the bar validation, the handoff binding and the critic/repair loop — so this
> looks like a lineage split rather than an unfinished feature. **Decide explicitly which tree is
> authoritative and port or repoint. Do not "fix" item 2 by deleting the client fields.**
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

## Why item 2 matters more than item 1

The desktop enforces the quality bar in its own composer (`src/components/layout/InputBar.tsx`
refuses to send Gauntlet without one, and `electron/gauntlet-handoff-store.ts` keeps a durable
contract packet). Against a runtime that ignores those fields, that UI is a promise the server
does not keep, and the failure is silent in both directions: no error, no critic, no bar.

Verification is cheap and non-destructive once `agent_runtime` restarts against the mounted tree:
send a Gauntlet turn with a distinctive bar, then grep the container's captured request body for
`gauntlet_bar`. Present-and-used is the pass; present-but-unread is today's fail.

## Verified state this was written against

| Claim | Evidence |
| --- | --- |
| The running `:8008` runtime serves this tree | `docker inspect agent_runtime` → `com.docker.compose.project.config_files = C:\Users\panca\Documents\Github\Memex_Core\execution_plane\docker-compose.yml`, bind `.../Memex_Core/agents -> /app/agents:rw`, `uvicorn agents.main:app` with no `--reload` |
| Desktop profile points here | `%APPDATA%\memex-desktop\config.json`: active `home-lan` → `http://192.168.2.101:8008` (this host) |
| `_is_swarm_turn` omits `research_mode` | `agents/main.py:2436-2447` |
| No Gauntlet implementation | grep `agents/` for `gauntlet_bar\|gauntlet_handoff\|quality_bar\|record_gauntlet_review` → 0; `gauntlet` → 2 hits, both `main.py` |
| Perspective mode is intact here | `agents/church.py:1158-1161` then `agents/coordination/orchestrator.py:607`; `handlers/coordinate.py:27` reads `ctx["research_mode"]` |
| `swarm` is not an entitlement in this tree | `agents/user_permissions.py:18-31` (`FEATURES` has no `swarm`) and live `GET /api/v1/permissions` |
| Lineage split, not unfinished work | `.git/logs/HEAD`: this tree 2 Gauntlet commits vs `Agent_Swarm` 15 |

Unverified, stated as such: no perspective matrix has been observed end to end from either
workspace; the 8 behavioural tests in `Agent_Swarm/tests/test_dev_harness_routing.py` skip off
container (no `prometheus_client`/`agno` on a workstation); the public `memex-anywhere` profile's
deployment was never inspected and may already run the `Agent_Swarm` code.
