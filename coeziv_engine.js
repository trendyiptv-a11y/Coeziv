// coeziv_engine.js
// Motor cognitiv Coeziv – versiune simplificată + CONTRACT STABIL DE EXPORT

// --------------------------------------------------
// CONFIG
// --------------------------------------------------

const CONFIG = {
  WORDS_CONTEXT_MAX: 800,
  WORDS_LOCAL_MAX: 80,

  DOMAIN_ACTIVE: 0.2,
  DOMAIN_CONFLICT: 0.15,

  J_MIXED: 0.5,
  J_TENSED: 1.0,

  OVERSAT_MIN_WORDS: 60,
  OVERSAT_MIN_ACTIVE_DOMAINS: 2,

  DYNAMIC_DOMAINS: new Set([
    "economie",
    "tehnic",
    "ai_advanced",
    "social",
    "politic",
    "ecologie"
  ])
};

// --------------------------------------------------
// KEYWORDS
// --------------------------------------------------

const KEYWORDS = {
  medical: ["tensiune", "simptom", "vaccin", "doctor", "diagnostic", "tratament", "medic"],
  legal: ["contract", "instanta", "instanță", "avocat", "lege", "proces", "judecator", "judecător"],
  politic: ["guvern", "stat", "partid", "politic", "alegeri", "parlament", "coruptie", "corupție"],
  psihologic: ["anxietate", "depresie", "teama", "teamă", "frica", "frică", "psiholog", "terapie"],
  tehnic: ["algoritm", "server", "retea", "rețea", "programare", "cod", "ai", "model"],
  neuro: ["neuron", "sinaps", "dopamin", "cortex", "hipocamp"],
  economie: ["pia", "infla", "capital", "ofert", "cerer", "bani", "moned", "bitcoin", "crypto"],
  ecologie: ["ecosistem", "habitat", "biodivers", "specie", "poluare", "climat"],
  social: ["grup", "comunit", "institu", "societ", "norme"],
  ai_advanced: ["agent", "multi-agent", "policy", "reinforcement", "embedding", "vector"]
};

// --------------------------------------------------
// UTILS
// --------------------------------------------------

function tokenize(text = "") {
  return text
    .toLowerCase()
    .split(/[^a-zăâîșț0-9_+-]+/i)
    .filter(Boolean);
}

function detectDomains(tokens) {
  const counts = {};
  for (const d in KEYWORDS) counts[d] = 0;

  const set = new Set(tokens);

  for (const [domain, words] of Object.entries(KEYWORDS)) {
    for (const w of words) {
      if (set.has(w)) counts[domain]++;
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const normalized = {};
  for (const d in counts) normalized[d] = counts[d] / total;

  return normalized;
}

function activeDomains(domains, threshold = CONFIG.DOMAIN_ACTIVE) {
  return Object.entries(domains)
    .filter(([, v]) => v >= threshold)
    .map(([d]) => d);
}

function conflictScore(domains) {
  const active = Object.values(domains).filter(v => v > CONFIG.DOMAIN_CONFLICT).length;
  return active > 1 ? Math.min(active / 3, 1.0) : 0;
}

// --------------------------------------------------
// FLAGS & J
// --------------------------------------------------

function detectFFlags(tokens, domains, ctxDepth, cScore) {
  const flags = {
    F1_domain_mix: false,
    F2_global_jump: false,
    F3_oversaturation: false
  };

  const active = activeDomains(domains);
  if (active.length >= 2) flags.F1_domain_mix = true;

  const personal = ["eu", "mie", "mine", "am"];
  const universal = ["toți", "toti", "mereu", "niciodată", "oricine"];

  if (
    personal.some(w => tokens.includes(w)) &&
    universal.some(w => tokens.includes(w))
  ) {
    flags.F2_global_jump = true;
  }

  if (
    tokens.length >= CONFIG.OVERSAT_MIN_WORDS &&
    (active.length >= CONFIG.OVERSAT_MIN_ACTIVE_DOMAINS || cScore > 0)
  ) {
    flags.F3_oversaturation = true;
  }

  return flags;
}

function computeJ(ctxDepth, cScore, flags) {
  const numFlags = Object.values(flags).filter(Boolean).length;
  const J = 0.3 * ctxDepth + 0.8 * cScore + 0.25 * numFlags;

  let regime = "ordered";
  if (J >= CONFIG.J_TENSED) regime = "tensed";
  else if (J >= CONFIG.J_MIXED) regime = "mixed";

  return { J, regime };
}

function decidePolicy(jState, flags, domains) {
  const dominant = activeDomains(domains);

  if (jState.regime === "tensed") {
    return {
      action: flags.F3_oversaturation
        ? "trim_context_and_clarify"
        : "clarify_first",
      dominant
    };
  }

  if (flags.F1_domain_mix || flags.F2_global_jump) {
    return { action: "domain_declare_and_reframe", dominant };
  }

  if (flags.F3_oversaturation) {
    return { action: "trim_context", dominant };
  }

  return { action: "normal_answer", dominant };
}

// --------------------------------------------------
// INTENT
// --------------------------------------------------

function inferIntent(userMessage = "") {
  const lower = userMessage.toLowerCase();

  const isQuestion =
    userMessage.endsWith("?") ||
    ["ce", "cum", "de ce", "care", "cât", "unde"].some(w =>
      lower.startsWith(w + " ")
    );

  const wants_internet = [
    "cauta",
    "căut",
    "search",
    "latest",
    "azi",
    "acum",
    "preț",
    "price"
  ].some(w => lower.includes(w));

  return {
    type: isQuestion ? "question" : "statement",
    wants_internet
  };
}

// --------------------------------------------------
// ✅ EXPORT 1 — MOTOR PRINCIPAL
// --------------------------------------------------

export function runCoezivEngine({ history = [], userMessage = "" }) {
  const historyText = history.map(h => h.content || "").join("\n");
  const tokens = tokenize(userMessage);

  const domains = detectDomains(tokens);
  const cScore = conflictScore(domains);

  const ctxDepthLocal = Math.min(tokens.length / CONFIG.WORDS_LOCAL_MAX, 1);
  const flags = detectFFlags(tokens, domains, ctxDepthLocal, cScore);
  const j_state = computeJ(ctxDepthLocal, cScore, flags);
  const policy = decidePolicy(j_state, flags, domains);
  const intent = inferIntent(userMessage);

  const hasDynamicDomain = policy.dominant.some(d =>
    CONFIG.DYNAMIC_DOMAINS.has(d)
  );

  return {
    rho: {
      contextDepth_local: ctxDepthLocal,
      conflictScore_local: cScore,
      domains_local: domains
    },
    flags,
    j_state,
    policy,
    intent,
    needs_external_data: intent.wants_internet || hasDynamicDomain,
    identity_trace: {
      regime: j_state.regime,
      j_value: j_state.J,
      dominant_domains: policy.dominant,
      policy_action: policy.action
    }
  };
}

// --------------------------------------------------
// ✅ EXPORT 2 — BUILD SEARCH QUERY (NECESAR DE API)
// --------------------------------------------------

export function buildCohezivSearchQuery(userMessage = "", history = []) {
  if (!userMessage) return "";

  let q = userMessage.toLowerCase();

  const strip = [
    "cauta pe internet",
    "caută pe internet",
    "cauta online",
    "caută online",
    "verifica pe internet",
    "verifică pe internet",
    "search",
    "look up"
  ];

  for (const s of strip) q = q.replace(s, "");

  q = q.trim();

  if (!q && history.length) {
    const last = [...history].reverse().find(m => m.role === "user");
    if (last) q = last.content;
  }

  return q || userMessage;
}
