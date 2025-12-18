// coeziv_engine_simplified.js
// Versiune simplificată: domenii -> flags -> J -> policy -> intent

const CONFIG = {
  WORDS_CONTEXT_MAX: 800,
  WORDS_LOCAL_MAX: 80,

  DOMAIN_ACTIVE: 0.20,
  DOMAIN_CONFLICT: 0.15,

  J_MIXED: 0.5,
  J_TENSED: 1.0,

  // oversaturation: folosim densitate, nu doar lungime
  OVERSAT_MIN_WORDS: 60,
  OVERSAT_MIN_ACTIVE_DOMAINS: 2,

  DYNAMIC_DOMAINS: new Set(["economie", "tehnic", "ai_advanced", "social", "politic", "ecologie"])
};

const KEYWORDS = {
  medical: ["tensiune", "simptom", "vaccin", "doctor", "diagnostic", "tratament", "medic"],
  legal: ["contract", "instanta", "instanță", "avocat", "lege", "proces", "judecator", "judecător"],
  politic: ["guvern", "stat", "partid", "politic", "alegeri", "parlament", "coruptie", "corupție"],
  psihologic: ["anxietate", "depresie", "teama", "teamă", "frica", "frică", "psiholog", "terapie", "emoțional", "emotional"],
  tehnic: ["algoritm", "server", "retea", "rețea", "programare", "cod", "ai", "model", "neuron"],
  neuro: ["neuron", "sinaps", "ax", "dopamin", "plasticit", "cortex", "hipocamp"],
  economie: ["pia", "infla", "capital", "ofert", "cerer", "econom", "bani", "moned", "bitcoin", "btc", "crypto", "criptomoned"],
  ecologie: ["ecosistem", "habitat", "biodivers", "specie", "lanț", "poluare", "climat"],
  social: ["grup", "comunit", "institu", "colectiv", "societ", "norme", "roluri"],
  ai_advanced: ["multi-agent", "agent", "policy", "reinforcement", "memorie", "vector", "embedding"]
};

// --- util ---
function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .split(/[^a-zăâîșț0-9_+-]+/i)
    .filter(Boolean);
}

function wordCount(text) {
  return tokenize(text).length;
}

function detectDomainsByTokens(tokens) {
  const counts = {};
  for (const d of Object.keys(KEYWORDS)) counts[d] = 0;

  // index rapid: set pentru tokens
  const tset = new Set(tokens);

  for (const [domain, words] of Object.entries(KEYWORDS)) {
    for (const w of words) {
      // dacă keyword are spațiu ("multi-agent") îl tratăm ca token exact sau ca prezență directă
      if (w.includes("-") || w.includes("_")) {
        if (tset.has(w)) counts[domain] += 1;
      } else {
        if (tset.has(w)) counts[domain] += 1;
      }
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const normalized = {};
  for (const d of Object.keys(counts)) normalized[d] = counts[d] / total;
  return normalized;
}

function topDomains(domains, threshold = CONFIG.DOMAIN_ACTIVE) {
  return Object.entries(domains)
    .filter(([, v]) => v >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([d]) => d);
}

function conflictScore(domains) {
  const active = Object.values(domains).filter(v => v > CONFIG.DOMAIN_CONFLICT).length;
  return active > 1 ? Math.min(active / 3, 1.0) : 0;
}

function detectFFlags(text, tokens, domains, ctxDepth, cScore) {
  const flags = { F1_domain_mix: false, F2_global_jump: false, F3_oversaturation: false };

  const active = topDomains(domains, CONFIG.DOMAIN_ACTIVE);
  if (active.length >= 2) flags.F1_domain_mix = true;

  const personalMarkers = ["eu", "mie", "mine", "am", "pățit", "patit"];
  const universalizers = ["toți", "toti", "toate", "mereu", "niciodată", "niciodata", "întotdeauna", "intotdeauna", "oricine", "orice"];

  const hasPersonal = personalMarkers.some(m => tokens.includes(m));
  const hasUniversal = universalizers.some(u => tokens.includes(u));
  if (hasPersonal && hasUniversal) flags.F2_global_jump = true;

  // oversaturation: nu doar "lung", ci lung + multi-domeniu (sau conflict)
  const wc = tokens.length;
  if (wc >= CONFIG.OVERSAT_MIN_WORDS && (active.length >= CONFIG.OVERSAT_MIN_ACTIVE_DOMAINS || cScore > 0)) {
    flags.F3_oversaturation = true;
  }

  return flags;
}

function computeJ(ctxDepth, cScore, flags) {
  const numFlags = Object.values(flags).filter(Boolean).length;
  const J = (0.3 * ctxDepth) + (0.8 * cScore) + (0.25 * numFlags);

  let regime = "ordered";
  if (J >= CONFIG.J_TENSED) regime = "tensed";
  else if (J >= CONFIG.J_MIXED) regime = "mixed";
  return { J, regime };
}

function decidePolicy(jState, flags, domains) {
  const dominant = topDomains(domains, CONFIG.DOMAIN_ACTIVE);

  if (jState.regime === "tensed") {
    if (flags.F3_oversaturation) return { action: "trim_context_and_clarify", dominant };
    return { action: "clarify_first", dominant };
  }

  if (flags.F1_domain_mix || flags.F2_global_jump) {
    return { action: "domain_declare_and_reframe", dominant };
  }

  if (flags.F3_oversaturation) return { action: "trim_context", dominant };

  return { action: "normal_answer", dominant };
}

// Intent simplificat (păstrăm ce folosești)
function inferIntent(userMessage, history) {
  const text = (userMessage || "").trim();
  const lower = text.toLowerCase();
  if (!text) return { type: "empty", subtype: null, wants_internet: false, wants_more: false, topic_hint: null };

  const isMeta = ["ce poti sa faci", "ce poți să faci", "cine esti", "cine ești", "cum functionezi", "cum funcționezi"]
    .some(p => lower.includes(p));

  const isContinue = ["continua", "continuă", "mai departe", "spune-mi mai mult", "explica mai mult", "explică mai mult", "detaliaza", "detaliază"]
    .some(p => lower.includes(p));

  const isSearchCommand = ["cauta pe internet", "caută pe internet", "cauta online", "caută online", "verifica pe internet", "verifică pe internet", "search", "look up"]
    .some(p => lower.includes(p));

  const isQuestion = text.endsWith("?") || ["ce", "cum", "de ce", "care", "cât", "cat", "unde", "cand", "când"].some(w => lower.startsWith(w + " "));

  let type = "statement", subtype = null;
  if (isMeta) { type = "meta"; subtype = "about_assistant"; }
  else if (isSearchCommand) { type = "command"; subtype = "search"; }
  else if (isContinue) { type = "command"; subtype = "continue"; }
  else if (isQuestion) { type = "question"; }

  const wants_internet = isSearchCommand || ["ultimele", "azi", "acum", "recent", "latest", "price", "exchange rate"].some(p => lower.includes(p));

  // topic hint minimal (fără "magie")
  const topic_hint = ["modelul coeziv", "coeziv 3.14", "3.14", "apă", "apa", "2π", "2pi"].some(p => lower.includes(p))
    ? "coeziv_core"
    : null;

  return { type, subtype, wants_internet, wants_more: isContinue, topic_hint };
}

// --- API principal ---
export function runCoezivEngine({ history, userMessage }) {
  const historyText = (history || []).map(h => h.content || "").join("\n");
  const lastText = (userMessage || "").trim();

  const tokensLocal = tokenize(lastText);
  const domainsLocal = detectDomainsByTokens(tokensLocal);

  const wcGlobal = wordCount(historyText + "\n" + lastText);
  const wcLocal = tokensLocal.length;

  const contextDepth_global = Math.min(wcGlobal / CONFIG.WORDS_CONTEXT_MAX, 1.0);
  const contextDepth_local = Math.min(wcLocal / CONFIG.WORDS_LOCAL_MAX, 1.0);

  const cScoreLocal = conflictScore(domainsLocal);
  const flags = detectFFlags(lastText, tokensLocal, domainsLocal, contextDepth_local, cScoreLocal);
  const j_state = computeJ(contextDepth_local, cScoreLocal, flags);
  const policy = decidePolicy(j_state, flags, domainsLocal);
  const intent = inferIntent(userMessage, history);

  const dominant = policy?.dominant || [];
  const hasDynamicDomain = dominant.some(d => CONFIG.DYNAMIC_DOMAINS.has(d));
  const needs_external_data = Boolean(intent.wants_internet || hasDynamicDomain);

  return {
    rho: {
      contextDepth_global,
      contextDepth_local,
      conflictScore_local: cScoreLocal,
      domains_local: domainsLocal
    },
    flags,
    j_state,
    policy,
    intent,
    needs_external_data,
    identity_trace: {
      regime: j_state.regime,
      j_value: j_state.J,
      dominant_domains: dominant,
      policy_action: policy.action,
      needs_external_data
    }
  };
}
