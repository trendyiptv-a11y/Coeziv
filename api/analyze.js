// api/analyze.js
// Analizor Coeziv 3.14 — nucleu curat, fără hardcodări factuale.
// Model:
// Fc = (N × e × E) / r²
//
// N = densitatea ideilor
// e = conexiuni logice
// E = energie informațională
// r = distanță semantică / ruptură
//
// Acest motor NU decide adevăruri actuale precum titulari politici, prețuri,
// legi în vigoare sau scoruri live. Le marchează ca "requires_external_verification".

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

function frequencyMap(arr) {
  const m = {};
  for (const x of arr) m[x] = (m[x] || 0) + 1;
  return m;
}

function topConcepts(text, limit = 12) {
  const ws = words(text);
  const freq = frequencyMap(ws);
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

const LOGIC_CONNECTORS = [
  "pentru ca", "deoarece", "fiindca", "deci", "prin urmare", "rezulta",
  "daca", "atunci", "insa", "totusi", "dar", "sau", "si", "iar",
  "because", "therefore", "thus", "hence", "if", "then", "but", "however",
  "therefore", "so", "and", "or",
  "fordi", "derfor", "hvis", "sa", "men", "og", "eller"
];

const CONTRADICTION_MARKERS = [
  "dar totusi", "dar nu", "insa nu", "desi", "contrar", "imposibil",
  "fara legatura", "nu rezulta", "se contrazice",
  "however not", "although", "contradicts", "inconsistent"
];

const PRESENT_MARKERS = [
  "actual", "actualul", "actuala", "curent", "curenta", "prezent",
  "azi", "acum", "today", "now", "current", "latest", "incumbent",
  "in vigoare", "în vigoare"
];

const PRESENT_DOMAINS = [
  "presedinte", "presedintele", "president", "prim ministru", "premier",
  "ministru", "ceo", "director", "pret", "preț", "price", "bitcoin",
  "btc", "eur", "usd", "dkk", "lege", "law", "regulation", "scor",
  "score", "clasament", "weather", "vreme", "stoc", "available"
];

function countPhraseHits(text, list) {
  const t = normalize(text);
  let c = 0;
  for (const p of list) {
    const q = normalize(p);
    if (q && t.includes(q)) c++;
  }
  return c;
}

function detectsPresentDependency(text) {
  const t = normalize(text);
  const hasPresent = PRESENT_MARKERS.some(m => t.includes(normalize(m)));
  const hasDomain = PRESENT_DOMAINS.some(m => t.includes(normalize(m)));

  // Titlurile de funcții sunt prezente prin natură chiar fără "actual".
  const officeLike = /\b(presedinte|presedintele|president|premier|ministru|ceo|director|primar)\b/.test(t);

  return {
    active: Boolean((hasPresent && hasDomain) || officeLike),
    has_present_marker: hasPresent,
    has_present_domain: hasDomain || officeLike,
    reason: ((hasPresent && hasDomain) || officeLike)
      ? "Afirmația pare dependentă de prezent; motorul coeziv nu decide factual fără sursă externă actuală."
      : "Afirmația nu pare dependentă critic de prezent."
  };
}

function extractRelations(text) {
  const raw = String(text || "");
  const t = normalize(raw);
  const out = [];

  const patterns = [
    /(.+?)\s+este\s+(.+?)[.!?]?$/i,
    /(.+?)\s+e\s+(.+?)[.!?]?$/i,
    /(.+?)\s+is\s+(.+?)[.!?]?$/i,
    /(.+?)\s+are\s+(.+?)[.!?]?$/i,
    /(.+?)\s+->\s+(.+?)(?:->\s+(.+?))?$/i
  ];

  for (const rx of patterns) {
    const m = raw.match(rx);
    if (m) {
      out.push({
        subject: (m[1] || "").trim(),
        relation: m[3] ? "linked_to" : "is",
        object: (m[3] || m[2] || "").trim()
      });
      break;
    }
  }

  if (!out.length && t.includes("?")) {
    out.push({
      subject: null,
      relation: "question",
      object: raw.trim()
    });
  }

  return out;
}

function scoreDensity(text) {
  const s = sentences(text);
  const ws = words(text);
  const concepts = unique(ws);

  if (!ws.length) return 0;

  const conceptPerSentence = concepts.length / Math.max(1, s.length);
  const lexicalDiversity = concepts.length / Math.max(1, ws.length);

  // Ideal: suficient de dens, dar nu supraîncărcat.
  const densityRaw =
    1.4 * Math.min(1, conceptPerSentence / 7) +
    1.2 * Math.min(1, lexicalDiversity / 0.72) +
    0.54 * Math.min(1, ws.length / 80);

  return clamp(densityRaw);
}

function scoreConnections(text) {
  const s = sentences(text);
  const sets = sentenceConceptSets(text);
  const connectorHits = countPhraseHits(text, LOGIC_CONNECTORS);

  let repeatedLinks = 0;
  for (let i = 0; i < sets.length - 1; i++) {
    for (const x of sets[i]) {
      if (sets[i + 1].has(x)) repeatedLinks++;
    }
  }

  const relationCount = extractRelations(text).length;

  const raw =
    0.95 * Math.min(1, connectorHits / 5) +
    1.15 * Math.min(1, repeatedLinks / Math.max(1, s.length * 2)) +
    1.04 * Math.min(1, relationCount / 2);

  return clamp(raw);
}

function scoreEnergy(text) {
  const raw = String(text || "");
  const t = normalize(raw);
  const ws = words(raw);

  const strongWords = [
    "adevar", "fals", "demonstreaza", "dovada", "important", "critic",
    "urgent", "risc", "pericol", "echilibru", "viata", "suflet",
    "energie", "coerenta", "ruptura", "fragil", "confirmat",
    "contrazis", "real", "actual"
  ];

  const strongHits = strongWords.filter(w => t.includes(w)).length;
  const punctuationEnergy =
    (raw.match(/[!?]/g) || []).length +
    Math.min(3, (raw.match(/[A-ZĂÂÎȘȚ]{2,}/g) || []).length);

  const lengthEnergy = Math.min(1, ws.length / 55);

  const rawScore =
    1.25 * Math.min(1, strongHits / 5) +
    0.75 * Math.min(1, punctuationEnergy / 4) +
    1.14 * lengthEnergy;

  return clamp(rawScore);
}

function scoreDistance(text) {
  const semantic = meanSemanticDistance(text);
  const contradictions = countPhraseHits(text, CONTRADICTION_MARKERS);
  const connectors = countPhraseHits(text, LOGIC_CONNECTORS);

  // r trebuie să fie mic când textul e coerent și legat.
  let r =
    0.55 +
    semantic * 1.75 +
    Math.min(1.1, contradictions * 0.35) -
    Math.min(0.45, connectors * 0.06);

  return clamp(r, 0.35, PI_C);
}

function scoreHumanDelta(text) {
  const t = normalize(text);
  const humanTerms = [
    "viata", "suflet", "demnitate", "libertate", "iubire",
    "sens", "om", "uman", "adevar", "constiinta", "echilibru",
    "armonie", "suferinta", "vindecare", "responsabilitate"
  ];

  let hits = 0;
  for (const w of humanTerms) if (t.includes(w)) hits++;

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

  // Componenta finală V nu trebuie să fie doar Fc.
  // Dacă N/e/E sunt dezechilibrate, scorul final scade.
  const balancePenalty =
    (Math.abs(N - e) + Math.abs(e - E) + Math.abs(N - E)) / 3;

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

function verdictFromCore(core, present) {
  if (present.active && core.V >= 2.2) {
    return "🟠 Coerent structural, dar dependent de verificare factuală actuală";
  }

  if (core.V >= 2.85) return "✅ Coeziv puternic / aproape de 3.14";
  if (core.V >= 2.25) return "🟢 Coeziv stabil";
  if (core.V >= 1.55) return "🟡 Parțial coeziv / necesită clarificare";
  if (core.V >= 0.85) return "🟠 Fragil / rupturi semantice";
  return "🔴 Incoerent / structură slabă";
}

function recommendations(text, core, present) {
  const rec = [];

  if (core.N < 1.2) rec.push("Adaugă mai multe idei concrete sau termeni centrali.");
  if (core.N > 2.8 && core.e < 1.6) rec.push("Densitatea este mare, dar ideile nu sunt suficient legate logic.");
  if (core.e < 1.4) rec.push("Adaugă legături logice: deoarece, deci, prin urmare, dacă-atunci.");
  if (core.E < 1.2) rec.push("Crește energia mesajului: scop, miză, impact, direcție.");
  if (core.r > 2.1) rec.push("Redu distanța semantică: separă afirmațiile sau explică trecerea dintre idei.");
  if (present.active) rec.push("Afirmația depinde de prezent: adaugă o sursă actuală/oficială pentru verificare factuală.");

  if (!rec.length) rec.push("Structura este echilibrată; poți rafina stilistic, nu structural.");

  return rec;
}

function buildSummary(text, core, present, relations) {
  const parts = [];

  parts.push(`Densitatea ideilor N=${core.N}/3.14.`);
  parts.push(`Conexiunile logice e=${core.e}/3.14.`);
  parts.push(`Energia informațională E=${core.E}/3.14.`);
  parts.push(`Distanța semantică r=${core.r}; cu cât r este mai mică, cu atât coeziunea este mai bună.`);
  parts.push(`Rezultatul coeziv Fc=${core.Fc}/3.14.`);

  if (present.active) {
    parts.push("Afirmația are dependență de prezent; motorul nu decide adevărul factual fără sursă actuală.");
  }

  if (relations.length) {
    parts.push(`Au fost detectate ${relations.length} relații explicite în text.`);
  }

  return parts.join(" ");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST /api/analyze"
    });
  }

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    return res.status(400).json({ error: "Invalid JSON body." });
  }

  const text = String(body.text || "").trim();
  const humanMode = Boolean(body.humanMode);

  if (!text) {
    return res.status(400).json({ error: "Missing text for analysis." });
  }

  const present = detectsPresentDependency(text);
  const core = coezivCore(text, humanMode);
  const concepts = topConcepts(text);
  const relations = extractRelations(text);
  const verdict = verdictFromCore(core, present);
  const recs = recommendations(text, core, present);

  const factualStatus = present.active
    ? "requires_external_verification"
    : "not_current_dependent";

  const truthConsumption = present.active
    ? {
        level: 1,
        max: 5,
        label: "prezent neconsumat factual",
        explanation:
          "Afirmația poate fi coerentă structural, dar adevărul factual depinde de o sursă actuală/oficială."
      }
    : {
        level: round(core.V),
        max: 3.14,
        label: "coerență structurală consumată",
        explanation:
          "Motorul a consumat doar structura coezivă a afirmației, nu adevărul factual extern."
      };

  return res.status(200).json({
    engine: "coeziv-3.14-pure-core",
    version: "1.0.0-clean",
    mode: humanMode ? "ΔH" : "Δ",

    factual_status: factualStatus,

    factual_score: present.active ? 0 : core.V,
    logic_score: core.e,
    semantic_score: clamp(PI_C - core.r + 0.35),
    human_score: humanMode ? core.H : undefined,

    V: core.V,
    verdict,

    summary: buildSummary(text, core, present, relations),

    objective_refinement: recs.join(" "),

    cohesion_core: {
      N: core.N,
      e: core.e,
      E: core.E,
      r: core.r,
      H: core.H,
      Fc: core.Fc,
      V: core.V,
      formula: core.formula,
      interpretation:
        "Fc măsoară coeziunea structurală a textului, nu adevărul factual extern."
    },

    truth_consumption: truthConsumption,

    present_reality_gate: present,

    concepts,
    relations,

    diagnostics: {
      sentence_count: sentences(text).length,
      word_count: words(text).length,
      unique_concept_count: unique(words(text)).length,
      logic_connector_hits: countPhraseHits(text, LOGIC_CONNECTORS),
      contradiction_marker_hits: countPhraseHits(text, CONTRADICTION_MARKERS),
      semantic_distance_mean: round(meanSemanticDistance(text))
    },

    sources: [],
    contradiction_sources: [],
    context_sources: [],
    weak_sources: [],

    source_note:
      "Acest nucleu este strict coeziv și nu face căutare externă. Fact-checking-ul trebuie adăugat ca modul separat."
  });
}
