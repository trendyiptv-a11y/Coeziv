// coeziv_orchestrator.js
// Orchestrator: leagă engine + memory + evolution într-un flux unic.
// Responsabilități:
// 1) Build context (memorie + evoluție) pentru SYSTEM
// 2) Oferă decizia web (need_web) + tuning meta
// 3) Commit interaction (update memorie) după ce ai răspunsul final

import { runCoezivEngine, buildCohezivSearchQuery } from "./coeziv_engine.js";
import {
  retrieveMemoryContext,
  retrieveMemoryContextText,
  updateMemoryFromInteraction,
} from "./coeziv_memory.js";
import { buildEvolutionLayer } from "./coeziv_evolution.js";

/**
 * Construiește contextul SYSTEM, decizia de web și meta pentru UI/log.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {Array<{role:string, content:string}>} args.history
 * @param {string} args.userMessage
 * @param {object} [args.options]
 * @param {number} [args.options.maxMemoryItems] default 4
 * @param {boolean} [args.options.forceWeb] dacă UI vrea să forțeze web (override)
 *
 * @returns {object}
 */
export function buildSystemContext({
  userId = "default",
  history = [],
  userMessage = "",
  options = {},
}) {
  const maxMemoryItems = Number.isFinite(options.maxMemoryItems)
    ? options.maxMemoryItems
    : 4;

  // 1) context din memorie (summary + snippets + pattern)
  const memCtx = retrieveMemoryContext({
    userId,
    query: userMessage,
    maxItems: maxMemoryItems,
  });

  // 2) engine snapshot (decizii locale)
  const engine = runCoezivEngine({ history, userMessage });

  // 3) strat evolutiv (instruire meta)
  const evo = buildEvolutionLayer({
    engine,
    memoryPattern: memCtx.pattern,
  });

  // 4) decizia web: engine + override UI
  const forceWeb = !!options.forceWeb;
  const needWeb = forceWeb ? true : !!engine.needs_external_data;

  // query pentru web (dacă se va căuta)
  const webQuery = buildCohezivSearchQuery(userMessage, history);

  // 5) SYSTEM text compus (curat + stabil)
  // Notă: aici doar compunem. Execuția web o face /api/ask.js (controller-ul).
  const memoryText = retrieveMemoryContextText({ userId, query: userMessage, maxItems: maxMemoryItems });

  const systemText = [
    "Ești Asistentul Coeziv. Respectă separarea domeniilor. Nu transforma analogiile în afirmații empirice.",
    "",
    memoryText ? memoryText.trim() : "",
    "",
    "Strat evolutiv (autoreglarе):",
    evo.textBlock.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    systemText,
    engine, // pentru UI / log
    tuning: evo.tuning, // pentru log / debugging
    memory: {
      summary: memCtx.summary,
      snippets: memCtx.snippets,
      pattern: memCtx.pattern,
    },
    web: {
      needWeb,
      forceWeb,
      query: webQuery,
    },
  };
}

/**
 * Commit după ce ai răspunsul final.
 * Actualizează memoria (avg_J, domenii, fragmente, stil etc).
 */
export function commitInteraction({
  userId = "default",
  userMessage = "",
  assistantReply = "",
  engine = null,
}) {
  return updateMemoryFromInteraction({
    userId,
    userMessage,
    assistantReply,
    engine,
  });
}
