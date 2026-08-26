# Backend handoff contract

This desktop checkpoint is ready for the Agent_Swarm / agent-runtime changes below. The desktop client already treats these as the stable contracts; server work should preserve owner scoping and fail closed on unsupported operations.

## Ordered Task/MCP replay

Extend the owner-scoped dev checkpoint response:

```json
{
  "session_id": "…",
  "status": "paused",
  "turn": 4,
  "pending_tools": [
    {"call_id": "…", "name": "task.create", "args": {}, "source": "task", "replayable": true},
    {"call_id": "…", "name": "mcp.resources.list", "args": {}, "source": "mcp", "replayable": true}
  ]
}
```

`POST /api/v1/dev/checkpoints/{session_id}/replay` must accept only the first replayable pending call for the authenticated owner. A later call must return `409` with the expected `call_id`; an unsupported or non-replayable call must return `409` or `422`, never execute implicitly. The response should include `next_call_id` and the updated checkpoint status.

## Task lifecycle

`PATCH /v1/tasks/{coordination_id}` should accept only mutable task metadata (`title`, `scope`, `branch`, and optional `prompt`) and return the normalized task envelope:

```json
{"run": {"coordination_id": "…", "status": "…"}, "workers": []}
```

The endpoint must reject changes after terminal completion unless explicitly supported, preserve approval state, and remain owner/project scoped.

The task lifecycle also exposes owner-scoped `POST /v1/tasks/{coordination_id}/stop`,
`GET /v1/tasks/{coordination_id}/diff`, approval/denial, and
`GET /v1/tasks/{coordination_id}/events?after_seq=...` routes. Stop must be
durable and cooperative for queued or active work; event responses use the
stable envelope below.

## MCP capability and transport contract

`GET /api/v1/mcp/health` should expose `tools_registered`, `resources_registered`, `prompts_registered`, and `transports` (values: `http`, `sse`, `websocket`, `stdio`). The current backend mounts all four transports.

`GET /api/v1/mcp/client-config` may use either `mcpServers` or `servers`. Each descriptor should identify one transport and its endpoint/command. Resources and prompts should be advertised through explicit capability flags and implemented with standard JSON-RPC method names (`resources/list`, `resources/read`, `prompts/list`, `prompts/get`).

## Event schema

Stream and persisted run events should retain a stable `type`, `run_id`, `seq`, and structured payload. Tool start/result, approval requested/granted/denied, file change, todo/status, usage, continuation, error, and done events should not be silently dropped or renamed per client surface.

Dev approval decisions from native clients must POST back to the runtime's
owner-scoped `/api/v1/dev/approve/{call_id}` or `/api/v1/dev/deny/{call_id}`
route. Persisted session/workspace auto-approve grants must be keyed by the
same authenticated owner and workspace identity; a grant from one workspace
must not authorize another.
