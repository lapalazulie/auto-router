import type { ModelEffort, Register } from 'claude-code'

type Choice = { model: string; effort: ModelEffort; why: string }

const MODELS: Record<string, string> = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
}
const EFFORTS: readonly ModelEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']

// Kwaliteit boven kosten: bij twijfel of fouten altijd het sterkste model.
const FALLBACK: Choice = { model: 'opus', effort: 'high', why: 'standaard (geen oordeel)' }

const ROUTER = `Je bent een router voor een AI-codeerassistent. Kies voor het verzoek hieronder het model en effort-niveau dat het JUISTE, volledige antwoord oplevert. Kosten spelen GEEN rol: kies alleen een lichter model of lagere effort als dat de kwaliteit aantoonbaar niet raakt.

Modellen:
- opus: het sterkste model. Standaard voor alles met code, analyse, schrijven, plannen, debuggen, onderzoek, of meerdere stappen.
- sonnet: alleen voor eenvoudige, eenduidige vragen of kleine bewerkingen waar elk sterk model hetzelfde juiste antwoord geeft.
- haiku: alleen voor triviale berichten (groet, bedankje, "ok", een ja/nee-bevestiging).

Effort (hoe diep het model nadenkt):
- low: triviaal
- medium: eenvoudig
- high: normaal werk (standaard bij twijfel)
- xhigh: lastig: lastige bugs, architectuur, meerstaps-taken, subtiele logica
- max: zeer moeilijk: wiskunde/bewijzen, security, grote refactors, kritieke correctheid

Twijfel je? Kies hoger. Antwoord met ALLEEN JSON: {"model":"opus|sonnet|haiku","effort":"low|medium|high|xhigh|max","why":"max 8 woorden"}`

function parse(text: string): Choice | undefined {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return undefined
  try {
    const j = JSON.parse(m[0]) as Partial<Choice>
    if (typeof j.model !== 'string' || !(j.model in MODELS)) return undefined
    if (!EFFORTS.includes(j.effort as ModelEffort)) return undefined
    return { model: j.model, effort: j.effort as ModelEffort, why: String(j.why ?? '').slice(0, 80) }
  } catch {
    return undefined
  }
}

export const register: Register = on => {
  let isOn = true
  let pending: Choice | undefined
  let current: { turnId: string; choice: Choice } | undefined
  let last: Choice | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'autoroute',
      description: 'Automatische model/effort-keuze: aan, uit of status',
    })
    return next(e)
  })

  on('command.run', { command: 'autoroute' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'uit' || arg === 'off') {
      isOn = false
      $.ui.status(undefined)
      return { text: 'Auto-router staat uit: de sessie gebruikt weer het gewone model en effort.' }
    }
    if (arg === 'aan' || arg === 'on') {
      isOn = true
      return { text: 'Auto-router staat aan.' }
    }
    const state = isOn ? 'aan' : 'uit'
    const l = last ? `Laatste keuze: ${last.model} / ${last.effort} (${last.why}).` : 'Nog geen keuze gemaakt.'
    return { text: `Auto-router staat ${state}. ${l} Gebruik /autoroute aan of /autoroute uit.` }
  })

  on('prompt.submit', async ($, e, next) => {
    // Alleen echte, getypte prompts die een nieuwe beurt starten.
    if (!isOn || e.command || e.isMeta || e.turnId || e.text.trim() === '') return next(e)

    const r = await $.model.complete({
      model: 'claude-sonnet-5-5',
      system: ROUTER,
      prompt: `Verzoek:\n"""\n${e.text.slice(0, 6000)}\n"""`,
      maxTokens: 200,
      effort: 'low',
      timeoutMs: 15000,
    }).catch(() => undefined)

    pending = (r && r.isAnswered && parse(r.text)) || FALLBACK
    last = pending
    $.ui.status(`auto: ${pending.model} · ${pending.effort}`)
    return next(e)
  }).catch(($, e, next) => {
    // Faalt de router, dan gaat de prompt gewoon door op het sterkste model.
    pending = FALLBACK
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined && pending) {
      current = { turnId: e.turnId, choice: pending }
      pending = undefined
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // Alleen de hoofdlus; subagents houden hun eigen instellingen.
    if (!isOn || e.agentId !== undefined || !current || current.turnId !== e.turnId) return yield* next(e)
    const { model, effort } = current.choice
    return yield* next({
      ...e,
      model: MODELS[model] ?? e.model,
      ...(e.effort !== undefined ? { effort } : {}),
    })
  })
}
