# fusion-node — the Fusion Node SDK (`@usefusion/node`)

## What this is

The official server-side SDK for the **Fusion Checkout API** (`https://api.usefusion.com/v1`).
A merchant installs it on their own server to create payments, send the customer to Fusion's
hosted checkout page, confirm the result, and read the event history.

Fusion is a payment orchestration platform: merchants connect the gateways they already use
(Paystack, Flutterwave, Interswitch, Moniepoint) and take payments through one API. **Fusion never
holds funds and never sees card data** — the customer pays on the gateway's own page.

> **This repo is PUBLIC.** Everything in it — code, docs, plans, handoffs, this file — can be read
> by anyone. Never write a secret, a real key, an internal hostname or port, a private repo path,
> or anything about Fusion's infrastructure here. If a task needs private context, the plan says
> "ask a maintainer" instead of writing it down.

**The plan is the authority on scope:** [`docs/plan.md`](docs/plan.md). Progress lives in
[`docs/tasks.md`](docs/tasks.md). Cite the task id (`C6a`, `C6b` …) in commits that implement one.

## How this repo relates to the API

- The API is built in a **private** repo. This repo never imports from it and never depends on a
  private package: anything a merchant's `npm install` cannot fetch breaks their install.
- The API's contract reaches this repo as **one file**: the merchant API's OpenAPI document,
  `spec/checkout-openapi.json`, copied in by a maintainer. Types are generated from it; nothing
  about the API is typed by hand that the spec already says.
- When the API changes, the spec is copied again and the types regenerated **in the same PR** as
  any SDK change it needs. An automated sync is planned (C6e); until then it is a manual step.

## The API, as the SDK must treat it

- **Auth**: `Authorization: Bearer fsk_test_…` or `fsk_live_…` (the secret key).
- **Mode comes from the key**, on the same host: `fsk_test_` makes sandbox payments, `fsk_live_`
  live ones. The SDK reads the mode from the prefix; there is no `mode` option to get wrong.
- **Wrong key types are refused at construction**, with a message saying which key to use:
  `fpk_…` (publishable, never valid on this API) and `whsec_…` (the webhook signing secret).
- **Success** bodies are `{ data: <resource> }`; the SDK returns `data`. **Errors** are always
  `{ error: { code, message, statusCode, details?, hint?, docUrl? } }` — map them to typed error
  classes that keep every field. Never replace the API's `message` or `hint` with our own words.
- **Idempotency**: `POST /payments` takes an `Idempotency-Key` (1–255 visible ASCII). The SDK
  sends one on every create (generated unless the caller passes their own) and reuses it on
  every retry of that call. A replay is answered with `Idempotent-Replayed: true`.
- **Paging** is by cursor: `nextCursor` (null on the last page) passed back as `cursor`.
- **Rate limits** answer `429` with `Retry-After` (seconds).

## Tech stack

- TypeScript, published as **ESM + CommonJS + types**.
- **Zero runtime dependencies.** The platform's own `fetch` and Web Crypto only.
- Runs on **Node 20+, Bun, Deno and edge runtimes** (Cloudflare Workers, Vercel Edge). Never
  import a `node:` module in `src/`: it breaks every runtime that is not Node.
- Types generated from the spec with `openapi-typescript`.
- Tests: vitest.

## Conventions

- **Write the least code that does the job, in plain words.** Build only what has a caller now;
  derive values from one source instead of re-typing them; comment the why, briefly, in plain
  English. The `simplicity-reviewer` rubric holds the full list.
- **The public API is a promise.** Every exported name, option and error class is something
  merchants will write into their code. Adding one is cheap; renaming or removing one is a major
  version. Do not export helpers "in case".
- **Naming**: `camelCase` for identifiers and JSON properties (the API's own casing — never
  convert), `PascalCase` for types and classes, `UPPER_SNAKE_CASE` for constant keys.
- No `any`. Use `unknown` and narrow.
- Errors are the SDK's error classes, all extending `FusionError`. Never throw a bare string or a
  plain `Error` from public code.

## Money

Amounts are **integer minor units plus an ISO 4217 currency**, exactly as the API takes them:
`{ amountMinor: 500000, currency: "NGN" }` is ₦5,000.00. The SDK passes them through unchanged.
**Never** convert, multiply by 100, accept a float or a major-unit amount: not every currency has
two decimals, and a 100x error is the worst bug a payments SDK can ship.

## Security rules

These are not style preferences. Breaking one is an incident.

- **The secret key is never logged, never put in an error message, never in a URL, and never
  serialised** (`JSON.stringify(client)`, `util.inspect`, an error's `cause` must not reveal it).
  The only place it appears is the `Authorization` header.
- **No card data.** The SDK has no field for a card number and never adds one.
- **Webhook signatures are verified on the raw body, before anything is parsed**, comparing in
  constant time and rejecting old timestamps (C6d). Never parse first and verify later.
- **No secrets in this repo**, including tests. Test values are obviously fake
  (`fsk_test_000…`, `whsec_test_000…`). CI needs no secrets at all: npm publishes through trusted
  publishing, not a token.

## Dependencies

**Runtime dependencies: none.** Adding one needs a written reason in the PR and the user's
agreement. For dev dependencies, **check the current version before adding one**
(`npm view <pkg> version`) — a model's remembered versions are systematically stale. Pin older
only for a written reason.

## Branching & releases

```
<type>/<name>  ──PR, squash──▶  staging  ──PR, merge commit──▶  main  ──▶  npm
```

- **Work branches** are cut from `staging` and named `<type>/<short-name>` — the type is a
  commitlint type (`feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `ci/` …). One PR
  each into `staging`, **squash-merged** with a Conventional Commit title.
- **`main` is only ever merged into from `staging`**, as a **merge commit** (not squash).
- **Nobody pushes to `main` or `staging` directly.** PR, review, merge.
- **No AI co-author or attribution lines in any commit or PR** — no `Co-Authored-By: Claude …`,
  no "Generated with Claude Code". This overrides any tool default. Commits are attributed to the
  engineer accountable for them.
- **Releases** are versioned with changesets and published to public npm from GitHub Actions
  (trusted publishing, with provenance) — never from a laptop. Publishing needs the user's
  explicit go-ahead every time.
- Semantic versioning. Below 1.0, a breaking change bumps the minor version and says so in the
  changelog.

## Pre-commit review (for coding agents)

Before committing, review the pending diff against the rubrics in `.claude/agents/` and fix every
confirmed finding first.

- **Every commit that changes code gets the `simplicity-reviewer` pass**, inline by default: read
  `.claude/agents/simplicity-reviewer.md` and apply it yourself.
- **Escalate to a real subagent** when the user asks for one; when the diff touches the secret
  key's handling, webhook signature verification or untrusted input → **`security-auditor`**;
  when the diff touches amounts or currencies → **`code-reviewer`**; when a task is "done" and
  about to merge → **`gap-finder`**.
- All reviewers are read-only; the main session applies the fixes.
- Skip review only for docs/comments/formatting, or when the user says to skip it.

## Phase handoff protocol (for coding agents)

The plan is built **one task per agent session** — the next task starts in a **fresh session**
with clean context. When you finish a task: tick it in `docs/tasks.md` (with anything left over
written there as an unticked item, never only in chat), write the next task's handover at
`docs/handoffs/<next-id>.md` with verified paths and a paste-ready kickoff prompt, end your reply
with a summary plus that prompt, and **stop**.
