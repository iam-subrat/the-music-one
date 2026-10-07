# Shared Queue Execution Ledger

Plan: shared-queue-plan.md. Spec: shared-queue-design.md. User approved implementation and a PR to main.

Workspace: isolated native worktree, branch codex/shared-queue, based on origin/main.

Preflight: mode/version DB contract -> API -> local controller -> GUI/TUI/mobile -> rollout. All interfaces use dj/independent. Current main already has auto-pilot.

Tasks 1-6 implemented: additive schema and mode guards, mode API and bounded
resolution, persistent local controller, themed GUI, terminal commands, and
Capacitor mobile parity.

Ruling: use transaction-local request mode version and database triggers to protect both RPCs and direct table writes, preserving current RPC signatures. Cost if wrong: stale controls could mutate history; verified by PostgreSQL tests before release.

No production deployment is performed by this task. PR creation is authorized; merge/deployment remains outside this request.

Task 7: rollout docs and default-off flag complete. CI now runs PostgreSQL-backed
regressions and browser acceptance tests, including the Capacitor web view.

Review: seven findings addressed: direct INSERT protection, duplicate-video
identity, logout propagation/checkpoint cleanup, stale auto-pilot writes, offline
expiry, terminal local Skip, and cross-worker item resolution locking. Scoped
review found two regressions (host authorization and logout after leaving); both
were fixed and regression-tested. No known code-review blockers remain.

Verification: API 119 tests, web 46 unit tests, browser 17 acceptance tests.
Web/mobile production builds pass. Responsive screenshots inspected for Pulse,
Studio and the mobile view. Physical-device playback and deployment smoke checks
remain release gates; the feature is disabled by default.

Ruling: mobile is the repository's actual Capacitor/Vite client, not the Expo
client described in AGENTS.md. Reuse the same local controller with an enhanced
hosted bridge; deploy bridge protocol 2 before enabling the flag. Cost if wrong:
older hosted bridges show an update-required error instead of starting audio.
