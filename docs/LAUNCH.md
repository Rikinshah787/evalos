# EvalOS launch kit — get to 100★

Stars come from **distribution + a product people can try in 60 seconds**. Repo polish alone will not hit 100.

Right now it is evening PT. **Show HN is best Tue–Thu 8–11am ET** — post HN tomorrow morning; blast social tonight.

## Preflight (5 min)

```bash
npm install
npm run typecheck && npm test && npm run build
npm run dev
```

Open http://localhost:3000 → **Import this session** (or paste `fixtures/known-tool-error.json` in Settings).

Repo: https://github.com/Rikinshah787/evalos

## Copy / paste posts

### Show HN (tomorrow morning ET)

**Title:** `Show HN: EvalOS – turn Cursor/Claude Code failures into regression tests`

**First comment (post immediately):**

```text
I kept losing agent failures in chat history. Tomorrow’s model “fixed” them by accident until they came back.

EvalOS is local-first eval infrastructure:
1. Capture a real Cursor or Claude Code session
2. Review Judge · Evidence · Verdict (JEV) with exact tool steps
3. Confirm → export JSONL / Promptfoo / pytest
4. CI gate returns pass | fail | incomplete (never a fake pass)

Important: automatic triage scores are queue signals, not grades. Confirmed cases are the source of truth.

Try: npm i && npm run dev → Import this Cursor session
Honest limitation: deterministic triage is thin on purpose; the product is the confirm→regression loop.

I’d love feedback on whether the Cursor session importer is enough, or if you need LangGraph / custom harness connectors next.
```

### X / Twitter

```text
Your unit tests prove code works.
EvalOS proves the agent still solves the failures you already paid for.

Capture Cursor / Claude Code → Confirm JEV → export regression cases → CI gate.

Local. SQLite. Open source.
https://github.com/Rikinshah787/evalos
```

### Reddit (r/cursor, r/LocalLLaMA, r/ChatGPTCoding)

**Title:** `Open-sourced EvalOS: turn live Cursor agent failures into regression tests`

```text
I built a local tool that captures real Cursor / Claude Code sessions, attaches evidence to each finding (JEV = Judge · Evidence · Verdict), and lets you Confirm failures into Promptfoo/pytest cases.

No cloud required. Data stays in .evalos/evalos.db.

Quick try:
npm i && npm run dev
→ Dashboard → Import this session

Repo: https://github.com/Rikinshah787/evalos

Looking for brutal feedback from people who already dogfood agents in CI.
```

### Cursor Discord / community Slack

```text
Shipped EvalOS — local JEV evals from real Cursor sessions.
Import this chat → confirm failures → export regression cases.
https://github.com/Rikinshah787/evalos
```

## Do / don’t

| Do | Don’t |
| --- | --- |
| Answer every comment in the first 2 hours | Ask for upvotes / stars |
| Link GitHub + local try path | Gate behind signup |
| Admit triage scores are signals | Claim “world’s best AI judge” |
| Ask one concrete question | Spam the same link everywhere in 10 min |

## Star math (realistic)

| Channel | Likely stars if it lands |
| --- | --- |
| Front-page Show HN | 100–1000+ |
| Good Show HN (not front) | 20–80 |
| Reddit + X tonight | 10–40 |
| Friends / Discord only | 5–15 |

**100 in 5 hours** almost always needs a front-page HN or a viral Cursor/X hit. Ship the product, then spend the hours answering humans — not polishing more UI.
