# Handover → C6a: package, tooling and core client

You are starting **C6a** of the `@usefusion/node` plan, in **fusion-node**. C0 (repo setup) is
done: the repo has its `CLAUDE.md`, reviewer rubrics and docs, and nothing else. You have zero
conversation context; everything you need is below or at a path named below. Every path was
verified on 2026-11-16.

## Why now

Every later task (payments and events, the release, `webhooks.verify()`) stands on the client:
the key check, the request core, the error classes and the retries. Getting those right once
means each resource is a few lines.

## Read first, in order

1. `CLAUDE.md` — all of it. Especially: **this repo is public**; zero runtime dependencies; no
   `node:` imports in `src/`; security rules for the key; no AI attribution in commits.
2. `docs/plan.md` § Design (Client, Errors, Retries, Types, Packaging).
3. `docs/tasks.md` § C6a — the checklist you tick.
4. `.claude/agents/simplicity-reviewer.md` and `.claude/agents/security-auditor.md`.

## What exists

| Thing           | Path                       | Use                                   |
| --------------- | -------------------------- | ------------------------------------- |
| Conventions     | `CLAUDE.md`                | the rules                             |
| Plan            | `docs/plan.md`             | the design you implement              |
| Tracker         | `docs/tasks.md`            | tick C6a items as they land           |
| Reviewer rubrics| `.claude/agents/*.md`      | pre-commit review                     |
| Placeholder     | `README.md`, `LICENSE`     | README is rewritten in C6b            |

There is no `package.json`, no `src/` and no spec yet.

## Inputs you need from the maintainer

- **`spec/checkout-openapi.json`** — the merchant API's OpenAPI document. Ask the user for it at
  the start; it is generated in the private API repo and must not be fetched from anywhere else.
  **Read it before committing**: it should describe only `/v1/payments…` and `/v1/events…`. Anything
  else (an internal route, a hostname other than `api.usefusion.com`) is a stop: tell the user.

## What C6a builds

1. `package.json`, build, type-check, tests and formatting, per `docs/tasks.md` § C6a. **Check every
   dev dependency's current version with `npm view` before adding it.**
2. Commit guards and CI (Node 20, 22, 24, Bun, Deno).
3. Generated types from the spec in `src/generated/`.
4. The `Fusion` client, the request core, the error classes and retries — plan § Design. Resources
   (`payments`, `events`) are **C6b**: build only what the client needs to make one request.

## Constraints and traps

- **TypeScript version.** `openapi-typescript` (7.x) builds its output through the TypeScript
  compiler API, which TypeScript 7 (the native port) no longer exposes from the package root — it
  silently breaks generation. Declaration bundlers can hit the same wall. Either pin the repo to
  TypeScript 5.x, or isolate generation with its own TypeScript 5. Check what actually works, and
  write the reason next to the pin.
- **The key never leaks** — test `String(client)`, `JSON.stringify(client)`, Node's
  `util.inspect(client)` (in a test only; never in `src/`), and every error class.
- **Untrusted responses** — a body is `unknown` until checked; a non-JSON error body still becomes
  a `FusionApiError`; `Retry-After` is capped.
- **Retries never make a second payment** — the request core must let a caller fix the
  `Idempotency-Key` for all attempts of one call (C6b uses it for `payments.create`).
- Tests use fake keys only (`fsk_test_` followed by 40 zeros). No network in unit tests.

## Done when

- Every C6a box in `docs/tasks.md` is ticked, or left unticked with a line saying why.
- CI is green on all five runtimes; both builds load.
- Review: the simplicity pass inline, then `security-auditor` as a subagent; confirmed findings
  fixed.
- `docs/handoffs/C6b.md` written in this format with verified paths and a kickoff prompt.
- Work on a `feat/core-client` branch, PR into `staging`, squash-merged. Push and open the PR only
  with the user's go-ahead.

## Kickoff prompt (paste into a fresh session in `fusion-node`)

> Start C6a of the fusion-node plan. Read `docs/handoffs/C6a.md` and give me the plan before
> building.
