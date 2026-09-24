# EvalOS — path to a venture-scale product

Code alone is not a billion-dollar company. **Owning the default gate for agent quality** can be.

## Category

**Sentry for AI agents** — not another eval playground.

| Sentry | EvalOS |
| --- | --- |
| Exception | Agent failure (tool error, loop, bad action) |
| Fingerprint | Failure fingerprint |
| Resolve / ignore | Confirm / Reject |
| Release health | Agent version gate (`pass \| fail \| incomplete`) |

## Product spine (do not break this)

```text
Capture (everywhere) → Issue (fingerprint) → Confirm → Case → Gate (CI) → Compare
```

Money attaches to **Gate**: every agent PR must pass confirmed failures.

## Capture (universal — no per-vendor grind)

1. Cursor / Claude hooks — IDE agents  
2. `npx evalos proxy` + `OPENAI_BASE_URL` — API agents  
3. `evalos.capture(run)` SDK — custom harnesses  

## Moat order

1. **Workflow lock-in** — cases live in the customer repo + CI  
2. **Fingerprint library** — recurring agent failure types across teams  
3. **Hosted review + SSO** — when local-first teams outgrow one laptop  
4. **Network** — shared / org-level regression packs (later)

## What we will not do

- Scrape every vendor’s log UI  
- Compete with Promptfoo on prompt matrix UX  
- Fake demo scores as product truth  

## Near-term build order

1. Universal capture (hooks + proxy + SDK) — done / shipping  
2. Issues as first-class (grouped failures)  
3. Gate as the hero surface  
4. Hosted multi-user when 10+ teams ask  

## Honest ask

YC / venture story: *default regression CI for agents.*  
Billion story: only after Gate is unavoidable in agent shipping pipelines.
