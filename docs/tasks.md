# Tasks — `@usefusion/node`

Authoritative tracker for [`plan.md`](./plan.md). Tick boxes as work lands. One session per task
(CLAUDE.md § Phase handoff protocol). Anything left over goes here as an unticked item — never
only in chat or a PR description.

Status: `not started` · `in progress` · `blocked` · `done`

```
C0 repo setup ─▶ C6a core client ─▶ C6b payments + events ─▶ C6c release 0.1.0
                                                                   └─▶ C6d webhooks.verify (0.2.0)
                                                                   └─▶ C6e spec sync (later)
```

---

### C0 — Repo setup · `in progress`

- [x] Public repo `Solab-Tech/fusion-node` created (empty)
- [x] `CLAUDE.md`, `.claude/agents/` (simplicity, security, code, gap), `.claude/settings.json`
- [x] `docs/plan.md`, `docs/tasks.md`, `docs/handoffs/C6a.md`
- [x] `README.md` (placeholder), `LICENSE` (MIT), `.gitignore`
- [x] First push: `main` and `staging` from an empty first commit, `staging` as the default branch, this branch's PR into `staging`
- [x] Wiki off
- [ ] Repository rulesets on `main` and `staging`: PR required, no force-push, no deletion, squash only into `staging`, merge commit only into `main`; require the CI checks
- [ ] Settings: no org-level Actions secrets shared with this repo; Actions may not run on pull requests from forks without approval

### C6a — Package, tooling and core client · `done` (built with C6b in one session, `chore/sdk-init`)

- [x] `package.json` (`@usefusion/node`, `0.1.0`, MIT, `engines.node >=20`, `exports` for ESM + CommonJS + types, `files: ["dist"]`, no `dependencies`)
- [x] Build: two `tsc` passes (`dist/esm`, `dist/cjs` marked CommonJS by `scripts/mark-cjs.mjs`), no bundler; type-check for `src` (no Node types) and `test`; vitest; prettier
- [x] TypeScript pinned to 5.9: `openapi-typescript` needs the TypeScript 5 compiler API, which TypeScript 7 no longer exposes
- [x] CI (`.github/workflows/ci.yml`): lint, test, build and smoke on Node 20, 22, 24; smoke on Bun and Deno from the built `dist`; ESM and CJS export the same names
- [x] CI check: no AI attribution lines in a PR's commits
- [ ] Local commit guards: commitlint and `<type>/<name>` branch names (a `commit-msg` / `pre-push` hook), as CLAUDE.md § Branching — only the CI attribution check exists so far
- [x] `spec/checkout-openapi.json` generated from the API (2026-11-16) and read before committing: only `/v1/payments…` and `/v1/events…`, one server (`api.usefusion.com`); types in `src/generated/api.ts`
- [x] `Fusion` client: key check (`fsk_test_`/`fsk_live_`; `fpk_`/`whsec_` refused by name), `mode` (`sandbox`/`live`), options (`baseUrl`, `timeout`, `maxRetries`, `fetch`)
- [x] Key only in a closure and the Authorization header; tested against `String`, `JSON.stringify`, `util.inspect`, errors, URLs; a leaky fetch error is never passed as `cause`
- [x] Request core: `{ data }` unwrapped, JSON body, `User-Agent`, timeout per attempt, `redirect: "manual"`, error envelope → error classes, `requestId` from `x-request-id`, non-JSON and non-envelope bodies
- [x] Retries: network/timeout, 429 (`Retry-After`, capped 60 s), 5xx, 409 `idempotency_in_progress`; jittered backoff; tested with an injected sleep
- [x] simplicity pass; `security-auditor` subagent — no critical or high findings; its three low ones fixed: ids limited to `[A-Za-z0-9_]` (`.`/`..` reached other routes), list pages checked (a missing or repeated cursor looped forever), plain `http:` only for localhost; `idempotencyKey` checked before sending
- [ ] Cap the size of a response body read into memory (auditor, informational; the timeout bounds time, not memory)

### C6b — Payments and events · `in progress`

- [x] `payments.create` (generated `Idempotency-Key`, caller's own accepted, same key on every retry), `retrieve`, `verify`, `list`
- [x] `events.retrieve`, `events.list`
- [x] Paging: `PagePromise` (await → `Page` with `nextPage()`; `for await` over every item; lazy; stops on `break`)
- [x] Public type names aliased from the generated types (`Payment`, `PaymentCreateParams`, `PaymentListParams`, `PaymentStatus`, `Event`, `EventListParams`, `EventType`, `Mode`)
- [x] Unit tests with a mocked `fetch` (50 tests)
- [x] Contract test written (`test/contract.test.ts`, skipped without `FUSION_CONTRACT_BASE_URL` and `FUSION_CONTRACT_KEY`)
- [ ] Run the contract test against a local Fusion stack with a seeded test key (a maintainer runs the stack)
- [x] README: install, quickstart, test vs live, money, payments, events, errors, retries
- [ ] `code-reviewer` subagent (amounts are passed through unchanged; confirm nothing converts them)
- [ ] `gap-finder` before the release

### C6c — Release 0.1.0 · `not started`

- [ ] changesets; release workflow on `main` only, never on a fork's PR
- [ ] npm: `usefusion` org trusted publisher → this repo's release workflow; provenance on
- [ ] Q1 answered (default timeout and retries)
- [ ] `security-auditor` pass on the release workflow and `package.json` `files`
- [ ] Publish `0.1.0` — **only with the user's go-ahead**

### C6d — `webhooks.verify()` · `not started` · after 0.1.0

- [ ] Signature cases generated from Fusion's own signer with fake secrets, committed as fixtures (a maintainer generates them)
- [ ] `webhooks.verify(rawBody, header, secret | [old, new], { tolerance })` on Web Crypto, async; typed event; `FusionSignatureError` with `reason`
- [ ] Passes every fixture case; property tests for tampered bodies, old timestamps, malformed headers
- [ ] README: webhook guide (raw body with Express, Next.js, Hono; respond fast; dedupe on `event.id`; order by `data.object.version`)
- [ ] `security-auditor` subagent; release `0.2.0` with the user's go-ahead

### C6e — Spec sync · `not started` · later

- [ ] Replace the hand copy of `spec/checkout-openapi.json` with an automated sync and a check, so a merchant API change cannot leave the SDK behind
