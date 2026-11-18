# auto-router

Claude Code mod that picks the model and effort level for each prompt, favouring quality over cost.

## Install

```bash
/plugin marketplace add lapalazulie/auto-router
/plugin install auto-router@auto-router
```

## Use

- Each prompt is first routed by a quick Sonnet call (effort low) that chooses Opus, Sonnet or Haiku and an effort level.
- If the router fails or answers unclearly, the turn falls back to Opus at high effort.
- The chosen pair shows in the status line, e.g. `auto: opus · high`.
- `/autoroute` shows status, `/autoroute uit` turns it off, `/autoroute aan` turns it on.
- Subagents keep their own settings.

Effort only applies to models that support it.
