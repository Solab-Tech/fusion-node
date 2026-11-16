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
- [ ] Repository rulesets on `main` and `staging`: PR required, no force-push, no deletion, squash only into `staging`, merge commit only into `main`
- [ ] Settings: no org-level Actions secrets shared with this repo; Actions may not run on pull requests from forks without approval

### C6a — Package, tooling and core client · `not started`

Handoff: [`handoffs/C6a.md`](./handoffs/C6a.md)

- [ ] `package.json` (`@usefusion/node`, `0.0.0`, MIT, `engines.node >=20`, `exports` for ESM + CommonJS + types, `files: ["dist"]`, no `dependencies`)
- [ ] Build (ESM + CJS + `.d.ts`), type-check, vitest, prettier
- [ ] Commit guards: commitlint, `<type>/<name>` branch names, no AI attribution lines (local hook + CI check), as CLAUDE.md § Branching
- [ ] CI: type-check, tests, build on Node 20, 22, 24, Bun and Deno; both builds load and export the same names
- [ ] `spec/checkout-openapi.json` from a maintainer; read it before committing (merchant API only: no internal routes); generated types in `src/generated/`
- [ ] `Fusion` client: key check (`fsk_test_`/`fsk_live_`; `fpk_`/`whsec_` refused with a clear message), `mode`, options (`baseUrl`, `timeout`, `maxRetries`, `fetch`)
- [ ] Key never in `toString`/`toJSON`/`util.inspect`/errors/URLs — with a test for each
- [ ] Request core: JSON in and out, `User-Agent`, timeout per attempt, error envelope → error classes (plan § Errors), `requestId` from `x-request-id`, non-JSON error bodies
- [ ] Retries (plan § Retries), tested with a fake clock
- [ ] simplicity pass; `security-auditor` subagent (key handling, untrusted responses)

### C6b — Payments and events · `not started`

- [ ] `payments.create` (auto `Idempotency-Key`, caller's own accepted, same key on every retry), `retrieve`, `verify`, `list`
- [ ] `events.retrieve`, `events.list`
- [ ] Paging: page object that is also async-iterable over every item; stops fetching on `break`
- [ ] Public type names aliased from the generated types (`Payment`, `PaymentCreateParams`, `Event`, `PaymentStatus`, …)
- [ ] Unit tests with a mocked `fetch`
- [ ] Contract test against a local Fusion stack with a seeded test key (a maintainer runs the stack; skipped in CI without it)
- [ ] README: install, quickstart, test vs live, errors, idempotency, paging, money in minor units
- [ ] simplicity pass; `code-reviewer` subagent (amounts); `gap-finder` before merge

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
