# EvalOS launch kit — get to 100★

Stars come from **a 15-second wow + places builders hang out**. Product alone is not enough.

## The shareable hook

```bash
npm install && npm run demo
```

That prints: stuck tool loop → Confirm → case file → **CI FAIL**.  
Record that terminal (or a Loom of Inspect Confirm) — that is the clip.

Repo: https://github.com/Rikinshah787/evalos

## Preflight

```bash
npm install
npm run demo
npm run typecheck && npm test && npm run build
npm run dev   # optional UI clip
```

## Copy / paste posts

### Show HN (Tue–Thu 8–11am ET)

**Title:** `Show HN: EvalOS – turn agent failures into regression tests in 15s`

**First comment:**

```text
I kept losing agent failures in chat. Tomorrow’s model “fixed” them until they came back.

EvalOS freezes a real failure as a regression case:

  npm i && npm run demo

You’ll see: same tool+input loop → Confirm → evals/cases/*.json → CI red.

Then `npm run dev` and Confirm real Cursor sessions the same way.

Automatic scores are triage signals. Confirmed cases are truth.

Honest limitation: deterministic triage is thin on purpose — the product is confirm → gate.

Feedback welcome: is Cursor/Claude capture enough, or do you need LangGraph next?
```

### X / Twitter

```text
Agent failed the same way twice?

npm i && npm run demo

fail → Confirm → case file → CI red

EvalOS: Sentry for agent failures you already hit.
https://github.com/Rikinshah787/evalos
```

### Reddit (r/cursor, r/LocalLLaMA, r/ChatGPTCoding)

**Title:** `Open-sourced EvalOS: turn live agent failures into CI regression tests`

```text
Quick demo (no account):

npm i && npm run demo

Captures the “agent stuck in a tool loop” failure, writes a confirmed case, and shows CI fail.

UI: npm run dev → Import Cursor session → Confirm → evals/cases/

Repo: https://github.com/Rikinshah787/evalos
```

### Cursor Discord / community

```text
EvalOS — 15s demo: npm i && npm run demo
Real Cursor fails → Confirm → regression cases → CI gate.
https://github.com/Rikinshah787/evalos
```

## Cadence

1. Tonight: post X + Discord with `npm run demo` + mention `npx evalos proxy` for API agents  
2. Tomorrow morning ET: Show HN  
3. Reply to every comment in the first 2 hours  
4. Do not spend those hours building per-vendor log scrapers — proxy + Confirm is the story

**100★ in a day** needs HN or a viral Cursor/X hit. Ship the demo, then talk to humans.
