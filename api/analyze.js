import { verifyClaim } from "../lib/coeziv/fact-resolver.js";

// api/analyze.js
// Analizor Coeziv 3.14 — nucleu structural + verificare factuală separată.
// Principiu:
// 1. Coeziv Core măsoară structura: Fc = (N × e × E) / r²
// 2. Fact Resolver verifică afirmația: claimed_object vs resolved_object
// 3. Verdictul final combină cele două straturi fără hardcod în API.

const PI_C = 3.14;

const clamp = (n, min = 0, max = PI_C) => {
  n = Number(n);
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, n));
};

const round = (n, d = 2) => Number(Number(n || 0).toFixed(d));

const normalize = (s = "") =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ăâ]/g, "a")
    .replace(/î/g, "i")
    .replace(/[șş]/g, "s")
    .replace(/[țţ]/g, "t")
    .replace(/\s+/g, " ")
    .trim();

const STOPWORDS = new Set(`
a ai al ale am ar are as asa ati au avea avem aveti
ca care ce cel cea cei cele cu cum dar de deja din dintre dupa
e este eu fi fie fost fara in intr intre iar il imi la le lui
mai ma mi ne nu o pe pentru prin sa se si sau sunt ta te tu un una
unde va voi vor
the a an and or but if then else of to in on at by for with from as is are was were be been being
who what where when why how current actual present today now
jeg du han hun vi de det der som og eller men ikke med til fra pa
`.split(/\s+/).filter(Boolean));

const RULES = {
  logic_connectors: [
    "pentru ca", "pentru că", "deoarece", "fiindca", "fiindcă", "deci", "prin urmare",
    "rezulta", "rezultă", "daca", "dacă", "atunci", "insa", "însă", "totusi", "totuși",
    "dar", "sau", "si", "și", "iar",
    "because", "therefore", "thus", "hence", "if", "then", "but", "however", "so", "and", "or",
    "fordi", "derfor", "hvis", "så", "men", "og", "eller"
  ],
  contradiction_markers: [
    "dar totusi", "dar totuși", "dar nu", "insa nu", "însă nu", "desi", "deși", "contrar",
    "imposibil", "fara legatura", "fără legătură", "nu rezulta", "nu rezultă", "se contrazice",
    "however not", "although", "contradicts", "inconsistent"
  ],
  present_markers: [
    "actual", "actualul", "actuala", "curent", "curenta", "curentă", "prezent", "prezenta", "prezentă",
    "azi", "acum", "today", "now", "current", "latest", "incumbent", "in vigoare", "în vigoare"
  ],
  office_titles: [
    "presedinte", "presedintele", "presedintelui", "președinte", "președintele", "președintelui",
    "president", "presidentul", "presidentului", "prim ministru", "prim-ministru", "premier",
    "ministru", "ministrul", "guvernator", "guvernatorul", "ceo", "director", "directorul",
    "primar", "primarul", "titular", "titularul", "lider", "liderul", "sef", "seful", "șef", "șeful"
  ],
  current_domains: [
    "pret", "preț", "price", "bitcoin", "btc", "eur", "usd", "dkk", "ron", "lege", "law", "regulation",
    "scor", "score", "clasament", "weather", "vreme", "stoc", "available", "disponibil", "disponibila", "disponibilă"
  ],
  historical_markers: [
    "a fost", "era", "au fost", "fusese", "domnie", "domnitor", "voievod", "rege", "imparat", "împărat",
    "secol", "medieval", "istoric", "istorica", "istorică", "in trecut", "în trecut", "odinioara", "odinioară",
    "s-a nascut", "s-a născut", "a murit", "batalia", "bătălia", "imperiu", "cronica", "cronică", "anul"
  ],
  human_terms: [
    "viata", "viață", "suflet", "demnitate", "libertate", "iubire", "sens", "om", "uman",
    "adevar", "adevăr", "constiinta", "conștiință", "echilibru", "armonie", "suferinta",
    "suferință", "vindecare", "responsabilitate"
  ],
  energy_terms: [
    "adevar", "adevăr", "fals", "demonstreaza", "demonstrează", "dovada", "dovadă", "important",
    "critic", "urgent", "risc", "pericol", "echilibru", "viata", "viață", "suflet", "energie",
    "coerenta", "coerență", "ruptura", "ruptură", "fragil", "confirmat", "contrazis", "real", "actual"
  ]
};

function words(text = "") {
  return normalize(text)
    .replace(/[^a-z0-9ăâîșț\- ]/gi, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

function sentences(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const parts = raw
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [raw];
}

function unique(arr) {
  return [...new Set(arr)];
}

function countPhraseHits(text, list) {
  const t = normalize(text);
  let count = 0;
  for (const item of list) {
    const q = normalize(item);
    if (q && t.includes(q)) count++;
  }
  return count;
}

function hasAnyPhrase(t, list) {
  return list.some(x => t.includes(normalize(x)));
}

function hasHistoricalYear(t) {
  const years = t.match(/\b(1[0-9]{3}|20[0-1][0-9]|202[0-4])\b/g);
  return Boolean(years && years.length);
}

function topConcepts(text, limit = 12) {
  const freq = {};
  for (const w of words(text)) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

function sentenceConceptSets(text) {
  return sentences(text).map(s => new Set(words(s)));
}

function jaccardDistance(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = new Set([...a, ...b]).size;
  return union ? 1 - inter / union : 0;
}

function meanSemanticDistance(text) {
  const sets = sentenceConceptSets(text);
  if (sets.length <= 1) return 0.35;

  let sum = 0;
  let count = 0;
  for (let i = 0; i < sets.length - 1; i++) {
    sum += jaccardDistance(sets[i], sets[i + 1]);
    count++;
  }
  return count ? sum / count : 0.35;
}

function detectsPresentDependency(text) {
  const raw = String(text || "");
  const t = normalize(raw);

  const has_present_marker = hasAnyPhrase(t, RULES.present_markers);
  const has_office_title = hasAnyPhrase(t, RULES.office_titles);
  const has_current_domain = hasAnyPhrase(t, RULES.current_domains);
  const has_historical_context = hasAnyPhrase(t, RULES.historical_markers) || hasHistoricalYear(t);
  const is_question = /\?/.test(raw) || /\b(cine|care|who|what)\b/.test(t);
  const has_present_copula = /\b(este|e|is|are)\b/.test(t);

  const active = Boolean(
    !has_historical_context && (
      (has_current_domain && has_present_marker) ||
      (has_office_title && has_present_marker) ||
      (has_office_title && is_question) ||
      (has_office_title && has_present_copula)
    )
  );

  let relation_type = "stable_or_slow_relation";
  if (active && has_office_title) relation_type = "current_office_holder";
  else if (active && has_current_domain) relation_type = "current_value_or_status";

  return {
    active,
    relation_type,
    has_present_marker,
    has_office_title,
    has_current_domain,
    has_historical_context,
    is_question,
    reason: active
      ? "Afirmația pare dependentă de prezent; adevărul factual cere rezolvare externă actuală."
      : has_historical_context
        ? "Context istoric detectat; nu activez verificarea de prezent."
        : "Afirmația nu pare dependentă critic de prezent."
  };
}

function extractRelations(text) {
  const raw = String(text || "").trim();
  const t = normalize(raw);
  const out = [];

  const math = raw.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/);
  if (math) {
    return [{ subject: math[1].trim(), relation: "equals", object: math[2].trim() }];
  }

  const patterns = [
    { relation: "is", rx: /^(.+?)\s+este\s+(.+?)[.!?]?$/i },
    { relation: "is", rx: /^(.+?)\s+e\s+(.+?)[.!?]?$/i },
    { relation: "is", rx: /^(.+?)\s+is\s+(.+?)[.!?]?$/i },
    { relation: "has", rx: /^(.+?)\s+are\s+(.+?)[.!?]?$/i },
    { relation: "linked_to", rx: /^(.+?)\s+->\s+(.+?)(?:->\s+(.+?))?$/i }
  ];

  for (const p of patterns) {
    const m = raw.match(p.rx);
    if (m) {
      out.push({ subject: (m[1] || "").trim(), relation: p.relation, object: (m[3] || m[2] || "").trim() });
      break;
    }
  }

  if (!out.length && t.includes("?")) out.push({ subject: null, relation: "question", object: raw });
  return out;
}

function scoreDensity(text) {
  const ss = sentences(text);
  const ws = words(text);
  const concepts = unique(ws);
  if (!ws.length) return 0;

  const conceptPerSentence = concepts.length / Math.max(1, ss.length);
  const lexicalDiversity = concepts.length / Math.max(1, ws.length);

  return clamp(
    1.4 * Math.min(1, conceptPerSentence / 7) +
    1.2 * Math.min(1, lexicalDiversity / 0.72) +
    0.54 * Math.min(1, ws.length / 80)
  );
}

function scoreConnections(text) {
  const ss = sentences(text);
  const sets = sentenceConceptSets(text);
  const connectorHits = countPhraseHits(text, RULES.logic_connectors);

  let repeatedLinks = 0;
  for (let i = 0; i < sets.length - 1; i++) {
    for (const x of sets[i]) if (sets[i + 1].has(x)) repeatedLinks++;
  }

  return clamp(
    0.95 * Math.min(1, connectorHits / 5) +
    1.15 * Math.min(1, repeatedLinks / Math.max(1, ss.length * 2)) +
    1.04 * Math.min(1, extractRelations(text).length / 2)
  );
}

function scoreEnergy(text) {
  const raw = String(text || "");
  const t = normalize(raw);
  const ws = words(raw);

  const strongHits = RULES.energy_terms.filter(w => t.includes(normalize(w))).length;
  const punctuationEnergy = (raw.match(/[!?]/g) || []).length + Math.min(3, (raw.match(/[A-ZĂÂÎȘȚ]{2,}/g) || []).length);

  return clamp(
    1.25 * Math.min(1, strongHits / 5) +
    0.75 * Math.min(1, punctuationEnergy / 4) +
    1.14 * Math.min(1, ws.length / 55)
  );
}

function scoreDistance(text) {
  const semantic = meanSemanticDistance(text);
  const contradictions = countPhraseHits(text, RULES.contradiction_markers);
  const connectors = countPhraseHits(text, RULES.logic_connectors);

  const r = 0.55 + semantic * 1.75 + Math.min(1.1, contradictions * 0.35) - Math.min(0.45, connectors * 0.06);
  return clamp(r, 0.35, PI_C);
}

function scoreHumanDelta(text) {
  const t = normalize(text);
  let hits = 0;
  for (const w of RULES.human_terms) if (t.includes(normalize(w))) hits++;
  return clamp(0.45 + hits * 0.32);
}

function coezivCore(text, humanMode = false) {
  const N = scoreDensity(text);
  const e = scoreConnections(text);
  const E = scoreEnergy(text);
  const r = scoreDistance(text);
  const H = humanMode ? scoreHumanDelta(text) : undefined;

  const FcRaw = (N * e * E) / Math.max(0.01, r * r);
  const Fc = clamp(FcRaw);
  const balancePenalty = (Math.abs(N - e) + Math.abs(e - E) + Math.abs(N - E)) / 3;
  const V = clamp(Fc - balancePenalty * 0.35 + (humanMode ? H * 0.08 : 0));

  return {
    N: round(N),
    e: round(e),
    E: round(E),
    r: round(r),
    H: humanMode ? round(H) : undefined,
    Fc_raw: round(FcRaw),
    Fc: round(Fc),
    V: round(V),
    balance_penalty: round(balancePenalty),
    formula: "Fc = (N × e × E) / r²"
  };
}

function sentenceScore(sentence, previousSet = null) {
  const ws = words(sentence);
  const concepts = unique(ws);
  const set = new Set(ws);
  const connectorHits = countPhraseHits(sentence, RULES.logic_connectors);
  const contradictionHits = countPhraseHits(sentence, RULES.contradiction_markers);

  const N = clamp(1.35 * Math.min(1, concepts.length / 8) + 1.1 * Math.min(1, ws.length / 22));
  const e = clamp(1.65 * Math.min(1, connectorHits / 2) + (previousSet ? 1.25 * Math.min(1, [...set].filter(x => previousSet.has(x)).length / 3) : 0.7));
  const E = scoreEnergy(sentence);
  const distance_from_previous = previousSet ? jaccardDistance(previousSet, set) : 0;

  const issues = [];
  if (ws.length < 3) issues.push("propoziție foarte scurtă; are puțini termeni utili");
  if (concepts.length < 3) issues.push("densitate conceptuală redusă");
  if (connectorHits === 0 && ws.length > 8) issues.push("lipsește o legătură logică explicită");
  if (previousSet && distance_from_previous > 0.82) issues.push("distanță semantică mare față de propoziția anterioară");
  if (contradictionHits > 0) issues.push("posibilă tensiune sau contradicție internă");

  return { text: sentence, N: round(N), e: round(e), E: round(E), distance_from_previous: round(distance_from_previous), issues };
}

function explainBySentence(text) {
  const out = [];
  let previousSet = null;

  sentences(text).forEach((s, index) => {
    const score = sentenceScore(s, previousSet);
    out.push({ index: index + 1, ...score });
    previousSet = new Set(words(s));
  });

  return out;
}

function buildConcreteRefinement(sentenceExplanations, present, verification) {
  const out = [];

  for (const item of sentenceExplanations) {
    if (item.issues.length) {
      out.push(`Propoziția ${item.index}: „${item.text}” — ${item.issues.join("; ")}.`);
    }
  }

  const state = verification?.closure?.state;
  if (state === "confirmed") {
    out.push(`Verificarea factuală a confirmat relația: ${verification.closure.relation_subject} → ${verification.closure.relation_type} → ${verification.closure.relation_object_found}.`);
  } else if (state === "answered") {
    out.push(`Verificarea factuală a rezolvat răspunsul: ${verification.closure.relation_object_found}.`);
  } else if (state === "contradicted") {
    out.push(`Verificarea factuală contrazice afirmația: obiect afirmat „${verification.closure.relation_object_claimed}”, obiect găsit „${verification.closure.relation_object_found}”.`);
  } else if (present.active) {
    out.push(`Afirmația depinde de prezent: ${present.reason}`);
  }

  if (!out.length) out.push("Textul este structural echilibrat; nu apar rupturi majore între propoziții.");
  return out.join(" ");
}

function structuralVerdict(core, present) {
  if (present.active && core.V >= 2.2) return "🟠 Coerent structural, dar dependent de verificare factuală actuală";
  if (core.V >= 2.85) return "✅ Coeziv puternic / aproape de 3.14";
  if (core.V >= 2.25) return "🟢 Coeziv stabil";
  if (core.V >= 1.55) return "🟡 Parțial coeziv / necesită clarificare";
  if (core.V >= 0.85) return "🟠 Fragil / rupturi semantice";
  return "🔴 Incoerent / structură slabă";
}

function finalVerdict(baseVerdict, verification) {
  const state = verification?.closure?.state;
  if (state === "confirmed") return `✅ Adevăr factual confirmat + ${baseVerdict}`;
  if (state === "answered") return `✅ Răspuns factual rezolvat + ${baseVerdict}`;
  if (state === "contradicted") return "🔴 Fals factual consumat";
  return baseVerdict;
}

function factualScoreFromVerification(verification, present, core) {
  const state = verification?.closure?.state;
  if (state === "confirmed" || state === "answered") return PI_C;
  if (state === "contradicted") return 0;
  if (present.active) return 0;
  return core.V;
}

function factualStatusFromVerification(verification, present) {
  const state = verification?.closure?.state;
  if (state === "confirmed") return "factual_confirmed";
  if (state === "answered") return "factual_answered";
  if (state === "contradicted") return "factual_contradicted";
  if (present.active) return "requires_external_verification";
  return "not_current_dependent";
}

function buildSummary(core, present, relations, verification) {
  const parts = [];
  parts.push(`Coeziune structurală: N=${core.N}/3.14, e=${core.e}/3.14, E=${core.E}/3.14, r=${core.r}.`);
  parts.push(`Rezultatul coeziv este Fc=${core.Fc}/3.14.`);

  const state = verification?.closure?.state;
  if (state === "confirmed") parts.push("Afirmația a fost confirmată factual prin închiderea relației.");
  else if (state === "answered") parts.push("Întrebarea a primit un răspuns factual rezolvat.");
  else if (state === "contradicted") parts.push("Afirmația a fost contrazisă factual prin comparația obiect afirmat vs obiect găsit.");
  else if (present.active) parts.push("Afirmația depinde de prezent și cere sursă actuală/oficială.");
  else parts.push("Motorul a consumat structura afirmației; adevărul factual extern nu este complet rezolvat.");

  if (relations.length) parts.push(`Au fost detectate ${relations.length} relații explicite în text.`);
  return parts.join(" ");
}

function semanticScoreFromDistance(r) {
  return clamp(PI_C - r + 0.35);
}

function safeSources(verification) {
  return Array.isArray(verification?.sources) ? verification.sources : [];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST /api/analyze" });
  }

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch {
    return res.status(400).json({ error: "Invalid JSON body." });
  }

  const text = String(body.text || "").trim();
  const humanMode = Boolean(body.humanMode);

  if (!text) {
    return res.status(400).json({ error: "Missing text for analysis." });
  }

  try {
    const present = detectsPresentDependency(text);
    const core = coezivCore(text, humanMode);
    const concepts = topConcepts(text);
    const relations = extractRelations(text);
    const explanations = explainBySentence(text);
    const verification = await verifyClaim(text, process.env);
    const baseVerdict = structuralVerdict(core, present);
    const verdict = finalVerdict(baseVerdict, verification);
    const factual_score = factualScoreFromVerification(verification, present, core);
    const factual_status = factualStatusFromVerification(verification, present);
    const sources = safeSources(verification);

    return res.status(200).json({
      engine: "coeziv-3.14-core-plus-fact-verifier",
      version: "1.2.0-factual-workflow",
      mode: humanMode ? "ΔH" : "Δ",

      factual_status,
      factual_score,
      logic_score: core.e,
      semantic_score: semanticScoreFromDistance(core.r),
      human_score: humanMode ? core.H : undefined,

      V: core.V,
      verdict,
      structural_verdict: baseVerdict,

      summary: buildSummary(core, present, relations, verification),
      objective_refinement: buildConcreteRefinement(explanations, present, verification),

      cohesion_core: {
        N: core.N,
        e: core.e,
        E: core.E,
        r: core.r,
        H: core.H,
        Fc: core.Fc,
        V: core.V,
        balance_penalty: core.balance_penalty,
        formula: core.formula,
        interpretation: "Fc măsoară coeziunea structurală; factual_verification verifică relația afirmată."
      },

      factual_verification: verification,
      relation_closure: verification?.closure || null,
      truth_consumption: verification?.truth_consumption || {
        level: present.active ? 1 : round(core.V),
        max: present.active ? 5 : 3.14,
        label: present.active ? "prezent neconsumat factual" : "coerență structurală consumată",
        explanation: present.active
          ? "Afirmația poate fi coerentă structural, dar adevărul factual depinde de o sursă actuală/oficială."
          : "Motorul a consumat doar structura coezivă a afirmației."
      },

      present_reality_gate: {
        ...present,
        verifier_gate: verification?.gate || null
      },

      concepts,
      relations,
      explanations,

      diagnostics: {
        sentence_count: sentences(text).length,
        word_count: words(text).length,
        unique_concept_count: unique(words(text)).length,
        logic_connector_hits: countPhraseHits(text, RULES.logic_connectors),
        contradiction_marker_hits: countPhraseHits(text, RULES.contradiction_markers),
        semantic_distance_mean: round(meanSemanticDistance(text)),
        verifier: verification?.verifier || "none",
        closure_state: verification?.closure?.state || "incomplete"
      },

      sources,
      contradiction_sources: verification?.closure?.state === "contradicted" ? sources : [],
      context_sources: verification?.closure?.state === "incomplete" ? sources : [],
      weak_sources: [],

      source_note: sources.length
        ? "Sursele provin din modulul factual; nucleul coeziv rămâne separat de verificarea externă."
        : "Nucleul coeziv este determinist. Modulul factual nu a returnat surse externe pentru această afirmație."
    });
  } catch (err) {
    return res.status(500).json({
      error: "Analyzer failed",
      detail: String(err?.message || err).slice(0, 800)
    });
  }
}
