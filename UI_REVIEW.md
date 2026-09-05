# Workspace interaction and output review

Review date: 2026-09-05. Target: local web renderer at `http://127.0.0.1:5173/`, connected to the real Memex runtime. Desktop and 390 × 844 browser layouts were inspected. Native Electron-only functionality is not certified by a browser review.

## Acceptance standard for future reviews

An empty screen or a successful request is not a completed workspace test. For each conversational workspace:

1. Start a fresh thread and set verbosity before sending. Check workspace/project isolation.
2. Send a representative real request. Observe initial status, model wait, streamed activity, response, and final state. Do not use fabricated activity or a fake native bridge.
3. Verify the intended deliverable: readable research with links, actual HTML preview/source, loaded media, accessible files, or a usable routine. A claim such as “Design ready” without an artifact is a failure.
4. Exercise output controls. Copy feedback is not a download test; verify a downloaded file separately. Generated prototype links are not proof of publishing or functioning integrations.
5. Verify Brief, Standard, and Detailed. Deliverables, errors, and stopped-state notices must remain available at every level. Verbosity here controls activity presentation, not model answer length or reasoning effort.
6. Reload a completed thread and check output retention. Separately test interruption during streaming; preserving partial text does not mean the server run has resumed or stopped.
7. Check Stop, failure and missing-output states, long content, narrow layouts, sidebar dismissal, scrolling, and keyboard-accessible controls.
8. Mark each untested or blocked capability explicitly. Automated render tests complement, but do not replace, live inference and interaction checks.

## Verified in this pass

| Area | Evidence | Result / boundary |
| --- | --- | --- |
| Sites | Previously saved landing-page run now renders `design_fc4a5b89-477b-482e-9cd1-60dfa05a00b0.html`, with the heading “Transform Your Knowledge Management” | Actual saved HTML recovered; preview, Source, expansion, and “HTML copied” feedback exercised. Completed output survives reload and remains visible in Brief. This is a generated prototype, not a published site. |
| Research | Live HTTP 200/404 request returned a rendered table and MDN documentation link | Readable result verified on desktop and at 390px; not merely a plain-text Markdown dump. |
| Art | Live image request returned `ComfyUI_SDXL_TURBO_00052_.png` | Actual image loaded with natural dimensions 1024 × 1024. Corrected Create routing from forced HTML design to the media-capable router. |
| Chat | Existing real response “Chat inference is working”; fresh cancellation test | Brief hides completed activity, not answers. Stop visibly preserves the thread with a stopped notice. Server-side cancellation is not proven by closing the client stream. |
| Verbosity | Shared composer control; Sites Brief persisted after reload; Art/Research retained Standard; Design supports selection before first message | Applies to conversational workspaces through the common composer. Code-project isolation covered by store tests. Non-conversational management pages do not need a response-verbosity selector. |
| Mobile | Sites preview controls, sidebar open/dismiss, Art media, Research table, and composers inspected at 390 × 844 | Art page document width equals viewport width (390px). Generated site's own large heading can clip inside its narrow preview; generator responsiveness is distinct from host layout. Viewport restored after testing. |
| Interrupted generation | Reload/development hot reload interrupted Design streaming | Now explains that no completed response was received and the runtime may still be working. Does not silently claim completion. Automatic server-run reconnection remains unimplemented. |

## Open findings and release boundaries

- **Routines routing (functional failure):** The composer no longer forces Workshop, but a fresh desk-tidying request still routed to WORKSHOP and produced a product brief instead of the requested checklist. A subsequent fresh request without app/design wording routed to CONVERSATION, but remained GPU-queued for more than four minutes and was stopped without a delivered checklist. Read-only backend inspection found owner-scoped cross-session workshop restoration in `memex_core/agents/church.py` and workshop state in `handlers/workshop.py`. Isolate discovery state by conversation and verify router behavior against negative instructions and unrelated routine requests. No schedule or external action was created during this test.
- **HTML file download not verified:** Two in-app-browser attempts produced no observable download event and no matching file in the Downloads folder. The UI honestly reports “Download requested” and offers Copy HTML / Source, which remain usable. Test native Electron download handling separately before certifying export.
- **Design (incomplete live test):** Initial attempts were interrupted by reload/development hot reload. A final test with code stable remained GPU-queued for more than four minutes and was explicitly stopped. The shared HTML renderer is covered by Sites' real output and automated tests, but this alone is not an end-to-end Design pass. Both pending review streams were stopped via the UI; no backend process or queue lock was killed. The Sites preview was left visible afterward.
- **Native workspaces:** Code run-inspector/artifacts, CAD, Print, native file opening, and native downloads still need an Electron walkthrough. Browser-only capability gating is not an end-to-end native test.
- **Other media and files:** Image delivery was live-tested. Audio/video controls and file-only fallback are implemented but not live-generated in this pass. Runtime file references without a URL are explicitly identified instead of inventing a working link.
- **Remaining app review:** Memory, Skills, Scheduled execution, Pull requests, and Settings integrations are not newly certified by this interaction/output pass.
- **Build/dependency warnings:** Production build reports a large renderer chunk and existing module-format warnings. Dependency installation reports audit findings; no broad dependency/security upgrade was attempted as part of these UI changes.

## Automated coverage

`npm run typecheck`, `npm test`, and `npm run build:renderer` pass. The suite contains 66 tests across 16 files. Added coverage includes structured and legacy HTML delivery, sandbox isolation, all verbosity levels, Markdown links/tables with inert raw HTML, real media URL normalization, missing output, errors, cancellation, disconnected partial responses, progress coalescing, and workspace/project preference isolation.

Generated HTML is isolated in an iframe with scripts allowed but **without** same-origin access. Model-authored HTML is not injected into the chat document. Source is escaped text. Outputs are never hidden by an activity-detail preference.
