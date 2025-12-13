// coeziv_engine.js
// CoezivEngine – motor cognitiv pentru Asistentul Coeziv 3.14
// Nu face apeluri la OpenAI sau internet. Doar analizează mesaje + istoric.

// ---------------------------------------------------------------
// Utilitare pentru domenii, erori & tensiune J
// ---------------------------------------------------------------

function detectDomains(text) {
  const keywords = {
    medical: ["tensiune", "simptom", "vaccin", "doctor", "diagnostic", "tratament", "medic"],
    legal: ["contract", "instanta", "instanță", "avocat", "lege", "proces", "judecator", "judecător"],
    politic: ["guvern", "stat", "partid", "politic", "alegeri", "parlament", "coruptie", "corupție"],
    psihologic: ["anxietate", "depresie", "teama", "teamă", "frica", "frică", "psiholog", "terapie", "emoțional", "emotional"],
    tehnic: ["algoritm", "server", "retea", "rețea", "programare", "cod", "ai", "model", "neuron"],
    neuro: ["neuron", "sinaps", "ax", "dopamin", "plasticit", "cortex", "hipocamp"],
    economie: ["pia", "infla", "capital", "ofert", "cerer", "econom", "bani", "moned", "bitcoin", "btc", "crypto", "criptomoned"],
    ecologie: ["ecosistem", "habitat", "biodivers", "specie", "lanț trofic", "poluare", "climat"],
    social: ["grup", "comunit", "institu", "colectiv", "societ", "norme", "roluri"],
    ai_advanced: ["multi-agent", "agent", "policy", "reinforcement", "memorie", "vector", "embedding"]
  };

  const lower = (text || "").toLowerCase();
  const scores = {};

  for (const [domain, words] of Object.entries(keywords)) {
    scores[domain] = words.reduce(
      (acc, w) => acc + (lower.includes(w) ? 1 : 0),
      0
    );
  }

  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;

  const normalized = {};
  for (const d of Object.keys(scores)) {
    normalized[d] = scores[d] / total;
  }

  return normalized;
}

function detectFFlags(text, contextDepth, conflictScore, domains) {
  const flags = {
    F1_domain_mix: false,
    F2_global_jump: false,
    F3_oversaturation: false
  };

  const active = Object.entries(domains).filter(([_, v]) => v > 0.2);
  if (active.length >= 2) flags.F1_domain_mix = true;

  if (contextDepth > 0.7 && conflictScore > 0) {
    flags.F3_oversaturation = true;
  }

  const personalMarkers = ["eu", "mie", "la mine", "am pățit"];
  const universalizers = ["toți", "toate", "mereu", "niciodată", "întotdeauna", "oricine", "orice"];

  const lower = (text || "").toLowerCase();
  const personal = personalMarkers.some(m => lower.includes(m));
  const universal = universalizers.some(u => lower.includes(u));
  if (personal && universal) flags.F2_global_jump = true;

  return flags;
}

function computeJ(contextDepth, conflictScore, flags) {
  const numFlags = Object.values(flags).filter(v => v).length;
  const base = 0.3 * contextDepth + 0.8 * conflictScore;
  const J = base + 0.25 * numFlags;

  let regime = "ordered";
  if (J >= 1.0) regime = "tensed";
  else if (J >= 0.5) regime = "mixed";

  return { J, regime };
}

function decidePolicy(Jstate, flags, domains) {
  const dominant = Object.entries(domains)
    .filter(([_, v]) => v > 0.2)
    .map(([d, _]) => d);

  if (Jstate.regime === "tensed") {
    if (flags.F3_oversaturation) {
      return { action: "trim_context_and_clarify", dominant };
    }
    return { action: "clarify_first", dominant };
  }

  if (flags.F1_domain_mix || flags.F2_global_jump) {
    return { action: "domain_declare_and_reframe", dominant };
  }

  if (flags.F3_oversaturation) {
    return { action: "trim_context", dominant };
  }

  return { action: "normal_answer", dominant };
}

// ---------------------------------------------------------------
// Inferență Coezivă de intenție (Intent Engine)
// ---------------------------------------------------------------

function inferIntent(userMessage, history) {
  const text = (userMessage || "").trim();
  const lower = text.toLowerCase();

  let type = "unknown";
  let subtype = null;

  if (!text) {
    return {
      type: "empty",
      subtype: null,
      wants_internet: false,
      wants_more: false,
      topic_hint: null
    };
  }

  const questionWords = ["ce", "cum", "de ce", "care", "cât", "cat", "unde", "cand", "când"];
  const isQuestion =
    text.endsWith("?") || questionWords.some(w => lower.startsWith(w + " "));

  const isMeta = [
    "ce poti sa faci",
    "ce poți să faci",
    "ce fel de asistent",
    "cine esti",
    "cine ești",
    "cum functionezi",
    "cum funcționezi"
  ].some(p => lower.includes(p));

  const isContinue = [
    "continua",
    "continuă",
    "mai departe",
    "merge mai departe",
    "spune-mi mai mult",
    "explica mai mult",
    "explică mai mult",
    "detaliaza",
    "detaliază",
    "continua tu",
    "continuă tu"
  ].some(p => lower.includes(p));

  const isSearchCommand = [
    "cauta pe internet",
    "caută pe internet",
    "cauta online",
    "caută online",
    "cauta pe net",
    "caută pe net",
    "verifica pe internet",
    "verifică pe internet",
    "fa o cautare",
    "fă o căutare",
    "cauta despre",
    "caută despre",
    "cauta stiri",
    "caută știri",
    "search",
    "look up"
  ].some(p => lower.includes(p));

  const recencyMarkers = [
    "ultimele stiri",
    "ultimele știri",
    "stiri recente",
    "știri recente",
    "noutati",
    "noutăți",
    "informatii recente",
    "informații recente",
    "acum",
    "azi",
    "recent",
    "latest",
    "latest news",
    "în timp real",
    "in timp real",
    "prețul acum",
    "pretul acum",
    "prețul",
    "pretul",
    "cotatia",
    "cotația",
    "price",
    "exchange rate",
    "market cap"
  ];
  const mentionsRecency = recencyMarkers.some(p => lower.includes(p));

  if (isMeta) {
    type = "meta";
    subtype = "about_assistant";
  } else if (isSearchCommand) {
    type = "command";
    subtype = "search";
  } else if (isContinue) {
    type = "command";
    subtype = "continue";
  } else if (isQuestion) {
    type = "question";
  } else {
    type = "statement";
  }

  const wants_internet = isSearchCommand || mentionsRecency;

  // hint de topic: uităm complet Coeziv/apa? Nu – doar îl marcăm.
  const coezivCoreMarkers = [
    "modelul coeziv",
    "model coeziv",
    "coeziv 3.14",
    "coeziv3.14",
    "3.14",
    "3,14",
    "apa",
    "apă",
    "homeostazie",
    "tensiune structurala",
    "tensiune structurală",
  ];
  const isCohezivCore = coezivCoreMarkers.some((p) => lower.includes(p));

  let topic_hint = null;
  if (isCohezivCore) topic_hint = "coeziv_core";

  // dacă mesajul e foarte vag, încercăm să luăm topicul din ultima întrebare
  const words = lower.split(/\s+/).filter(Boolean);
  if (!topic_hint && words.length <= 3 && history && history.length) {
    const reversed = [...history].reverse();
    const lastUserQ = reversed.find(
      (m) => m.role === "user" && (m.content || "").trim().endsWith("?")
    );
    if (lastUserQ) {
      topic_hint = lastUserQ.content;
    }
  }

  return {
    type,
    subtype,
    wants_internet,
    wants_more: isContinue,
    topic_hint
  };
}

// ---------------------------------------------------------------
// Coeziv Search Query – Structură → Flux → Reorganizare → S₁
// ---------------------------------------------------------------

export function buildCohezivSearchQuery(userMessage, history) {
  if (!userMessage) return "";

  let q = userMessage.toLowerCase();

  const patternsToStrip = [
    "cauta pe internet",
    "caută pe internet",
    "cauta online",
    "caută online",
    "cauta pe net",
    "caută pe net",
    "verifica pe internet",
    "verifică pe internet",
    "cauta despre",
    "caută despre",
    "cauta informatii despre",
    "caută informații despre",
    "cauta stiri despre",
    "caută știri despre",
    "fa o cautare pe internet",
    "fă o căutare pe internet"
  ];

  for (const p of patternsToStrip) {
    q = q.replace(p, "");
  }

  q = q.replace(/\s+/g, " ").trim();

  const isTooShort = !q || q.split(" ").length <= 2;

  if (isTooShort) {
    // S₀ – STRUCTURĂ: ultima întrebare clară a utilizatorului
    const reversed = [...(history || [])].reverse();
    const lastUserMsg = reversed.find(
      (m) => m.role === "user" && (m.content || "").trim()
    );

    if (lastUserMsg) {
      let hq = lastUserMsg.content.toLowerCase();

      // R – REORGANIZARE: scoatem formule generice, păstrăm subiectul
      const historyStrip = [
        "ce pret are",
        "ce preț are",
        "cat este pretul",
        "cât este prețul",
        "cat este",
        "cât este",
        "imi poti spune",
        "îmi poți spune",
        "vreau sa stiu",
        "vreau să știu"
      ];
      for (const p of historyStrip) {
        hq = hq.replace(p, "");
      }

      hq = hq.replace(/\s+/g, " ").trim();
      if (hq) {
        q = hq;
      }
    }
  }

  // S₁ – NOUA STRUCTURĂ: dacă tot e gol, măcar întoarcem mesajul brut
  if (!q) q = userMessage.trim();

  return q;
}

// ---------------------------------------------------------------
// CoezivEngine – punctul principal de intrare
// ---------------------------------------------------------------

// history: [{ role: "user" | "assistant" | "system", content: string }, ...]
// userMessage: string
export function runCoezivEngine({ history, userMessage }) {
  const historyText = (history || [])
    .map(h => h.content || "")
    .join("\n")
    .trim();
  const lastText = (userMessage || "").trim();

  // STRUCTURĂ globală
  const fullText = (historyText + "\n" + lastText).trim();
  const wordCountGlobal = fullText.split(/\s+/).filter(Boolean).length;
  const contextDepth_global = Math.min(wordCountGlobal / 800, 1.0);
  const domains_global = detectDomains(fullText);
  const activeDomains_global = Object.values(domains_global).filter(v => v > 0.15).length;
  const conflictScore_global =
    activeDomains_global > 1 ? Math.min(activeDomains_global / 3, 1.0) : 0;

  // FLUX local
  const wordCountLocal = lastText.split(/\s+/).filter(Boolean).length;
  const contextDepth_local = Math.min(wordCountLocal / 80, 1.0);
  const domains_local = detectDomains(lastText);
  const activeDomains_local = Object.values(domains_local).filter(v => v > 0.15).length;
  const conflictScore_local =
    activeDomains_local > 1 ? Math.min(activeDomains_local / 3, 1.0) : 0;

  // REORGANIZARE – erori locale + J_local
  const flags = detectFFlags(
    lastText,
    contextDepth_local,
    conflictScore_local,
    domains_local
  );
  const j_state = computeJ(contextDepth_local, conflictScore_local, flags);

  // NOUA STRUCTURĂ – policy Coeziv
  const policy = decidePolicy(j_state, flags, domains_local);

  // Inferență de intenție (tip întrebare / comandă / etc.)
  const intent = inferIntent(userMessage, history);

  // Hint pentru browsing: engine-ul NU cheamă internetul, doar semnalizează
  const dynamicDomains = ["economie", "tehnic", "ai_advanced", "social", "politic", "ecologie"];
  const hasDynamicDomain = Object.entries(domains_local || {})
    .some(([d, v]) => v > 0.25 && dynamicDomains.includes(d));

  const needs_external_data = intent.wants_internet || hasDynamicDomain;

// --- Identitate emergentă: trasă din comportament, nu impusă ---

  const identity_trace = {
    // modul în care percepi tensiunea întrebării
    regime, // ex: "ordered" | "mixed" | "tensed"

    // "tensiunea" globală
    j_value: J,

    // ce domenii par dominante în această întrebare
    dominant_domains: policy?.dominant || [],

    // ce fel de acțiune logică ai luat
    policy_action: policy?.action || "normal_answer",

    // ai nevoie sau nu de date externe
    needs_external_data,
  };
  
  return {
    rho: {
      contextDepth_global,
      conflictScore_global,
      domains_global,
      contextDepth_local,
      conflictScore_local,
      domains_local
    },
    flags,
    j_state,
    policy,
    intent,
    needs_external_data
  };
}
