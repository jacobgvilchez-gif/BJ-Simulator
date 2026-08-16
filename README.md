# BJ-Simulator

A heads-up blackjack simulator with a fake-money bankroll, built to the
"Casino Felt" design handoff.

**Rules:** single deck reshuffled every hand · blackjack pays 3:2 · dealer
stands on soft 17 · double on first two cards · split matching ranks once ·
insurance pays 2:1. No surrender, no DAS, no re-split, no side bets.

## Getting started

Requires Node — the version in [`.nvmrc`](.nvmrc).

```bash
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm test` | Engine test suite |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |

## Layout

```
src/
  engine/     UI-free game engine + its test suite
  components/ Card and chip primitives
  hooks/      useGame — owns the single Game instance
  lib/        Chip styles, money formatting
  styles/     Design tokens and table styling
```

## The engine

`src/engine/engine.ts` is a near-verbatim port of the handoff's reference
engine, kept free of any UI concern. Its statistical properties were measured
rather than assumed, and the suite in `engine.test.ts` asserts them:

| Metric | Handoff (2M hands) | This port (2M hands) |
| --- | --- | --- |
| Rank frequency | 7.59–7.77% | 7.591–7.759% |
| Suit frequency | 24.99–25.01% | 24.986–25.024% |
| Player natural | 4.834% | 4.817% |
| Push rate | 8.36% | 8.344% |
| Per-hand std. dev. | 1.136 units | 1.1357 units |
| House edge | 0.044% ± 0.08 | −0.033% |

The near-zero house edge is correct, not a bug. The often-quoted ~0.5% is a
multi-deck figure; single deck reshuffled every hand with S17 and 3:2 blackjack
gives up nearly all of it. **Do not "correct" it.**

Two invariants worth preserving if you touch the engine:

- `deposits + sum(log[].net) === balance` at every settled point. It is
  legitimately false mid-hand, because the wager is deducted before a log row
  exists — gate any UI readout of it on the phase.
- No card appears twice within a hand. The deck is enumerated 4 suits × 13
  ranks and Fisher–Yates shuffled over a crypto-seeded PRNG — never a literal
  list, never sampled with replacement.

`seededRNG(n)` gives a reproducible stream, so every test is deterministic.

## CI

Pull requests are gated by [`ci.yml`](.github/workflows/ci.yml) and
[`security.yml`](.github/workflows/security.yml): repo hygiene, workflow
linting, a typecheck/lint/test/build matrix, secret scanning, and dependency
review.

The matrix is resolved at run time — pull requests build the `.nvmrc` version
for fast feedback, while pushes to `main` sweep all supported Node versions.
Because matrix legs report one check per version (and those names shift
whenever the matrix does), a small gate job publishes a single stable
`Build and test` status for branch protection to require.
