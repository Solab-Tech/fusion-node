# Handover → C6c: release 0.1.0

You are starting **C6c** of the `@usefusion/node` plan, in **fusion-node**. C6a (core client) and
most of C6b (payments, events, paging, README) are merged into `staging`. You have zero
conversation context; everything you need is below or at a path named below. Every path was
verified on 2026-11-16.

## Why now

The SDK works against a mocked API and builds for every runtime, but nobody can install it. C6c
makes the first public release safe and repeatable: published from CI only, with provenance, and
never from a laptop.

## Read first, in order

1. `CLAUDE.md` — especially § Branching & releases and § Security rules (CI holds no secrets).
2. `docs/tasks.md` § C6b (two items left) and § C6c.
3. `.claude/agents/security-auditor.md` § Supply chain.

## What exists

| Thing         | Path                       | Note                                                   |
| ------------- | -------------------------- | ------------------------------------------------------ |
| Package       | `package.json`             | version `0.1.0`; `files: ["dist"]`; no dependencies    |
| Version const | `src/version.ts`           | kept equal to `package.json` by `test/version.test.ts` |
| Build         | `pnpm build`, `pnpm smoke` | `dist/esm`, `dist/cjs`                                 |
| CI            | `.github/workflows/ci.yml` | lint, test, build, smoke; Bun and Deno smoke           |
| Contract test | `test/contract.test.ts`    | needs a running API and a sandbox key                  |

## What C6c builds

1. Finish C6b's two items: run the contract test against a local Fusion stack (ask the user to run
   the stack and give you `FUSION_CONTRACT_BASE_URL` and a sandbox key — never commit them), and a
   `code-reviewer` pass on amounts; then `gap-finder`.
2. changesets, and a release workflow that runs on `main` only, uses npm **trusted publishing**
   (`id-token: write`, no `NPM_TOKEN`) with provenance, and cannot run from a fork.
3. Answer plan Q1 with the user (default `timeout` and `maxRetries`).
4. `npm pack --dry-run`: the tarball holds `dist`, `package.json`, `README.md`, `LICENSE` and
   nothing else.

## Steps for the user (outside the repo)

- npmjs.com → `usefusion` org → `@usefusion/node` → trusted publisher: this repo, the release
  workflow's file name, and its environment if one is used.
- Rulesets on `main` and `staging` (C0), requiring the CI checks.

## Constraints

- **Publishing needs the user's explicit go-ahead**, every time.
- `staging` → `main` is a PR merged with a merge commit; the release runs from `main`.

## Kickoff prompt (paste into a fresh session in `fusion-node`)

> Start C6c of the fusion-node plan. Read `docs/handoffs/C6c.md` and give me the plan before
> building.
