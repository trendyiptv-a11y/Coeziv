// lib/coeziv/fact-resolver.js
// Modul generic de verificare factuală.
// Nu calculează coeziunea. Nu dă scor coeziv.
// Primește afirmația, extrage relația, încearcă să o închidă factual.
//
// Principiu:
// claimed_object = obiectul afirmat de utilizator
// resolved_object = obiectul găsit prin calcul, regulă stabilă sau sursă externă
//
// Dacă claimed_object === resolved_object => confirmed
// Dacă sunt diferite => contradicted
// Dacă nu poate rezolva => incomplete

const PI_C = 3.14;

export const normalize = (s = "") =>
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

export const cleanEntity = (s = "") =>
  normalize(s)
    .replace(/[.,!?;:()[\]{}"']/g, "")
    .replace(/\b(domnul|doamna|dl|dna|mr|mrs|ms|the|a|an)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

function round(n, d = 2) {
  return Number(Number(n || 0).toFixed(d));
}

function safeMathEval(expr = "") {
  const normalized = String(expr || "")
    .trim()
    .replace(/[×xX]/g, "*")
    .replace(/÷/g, "/")
    .replace(/,/g, ".")
    .replace(/\^/g, "**");

  if (!/^[0-9+\-*/().\s*]+$/.test(normalized)) return null;

  try {
    const result = Function(`"use strict"; return (${normalized})`)();
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export function extractClaim(text = "") {
  const raw = String(text || "").trim();
  const t = normalize(raw);

  const math = raw.match(/^\s*([0-9+\-*/×xX÷().\s]+)\s*=\s*([0-9.,]+)\s*$/);
  if (math) {
    return {
      type: "math",
      subject: math[1].trim(),
      relation: "equals",
      object: math[2].trim(),
      raw
    };
  }

  const isQuestion = /\?/.test(raw) || /\b(cine|care|who|what)\b/.test(t);

  if (isQuestion) {
    return {
      type: "question",
      subject: raw.replace(/[?]+$/, "").trim(),
      relation: "asks",
      object: null,
      raw
    };
  }

  const patterns = [
    { relation: "is", rx: /^(.+?)\s+este\s+(.+?)[.!?]?$/i },
    { relation: "is", rx: /^(.+?)\s+e\s+(.+?)[.!?]?$/i },
    { relation: "is", rx: /^(.+?)\s+is\s+(.+?)[.!?]?$/i },
    { relation: "has", rx: /^(.+?)\s+are\s+(.+?)[.!?]?$/i },
    { relation: "located_in", rx: /^(.+?)\s+(?:este\s+)?(?:in|în)\s+(.+?)[.!?]?$/i }
  ];

  for (const p of patterns) {
    const m = raw.match(p.rx);
    if (m) {
      return {
        type: "relation",
        subject: m[1].trim(),
        relation: p.relation,
        object: m[2].replace(/[.!?]+$/, "").trim(),
        raw
      };
    }
  }

  return {
    type: "unknown",
    subject: raw,
    relation: "unknown",
    object: null,
    raw
  };
}

const PRESENT_MARKERS = [
  "actual",
  "actualul",
  "actuala",
  "curent",
  "curenta",
  "prezent",
  "azi",
  "acum",
  "today",
  "now",
  "current",
  "latest",
  "incumbent",
  "in vigoare",
  "în vigoare"
];

const OFFICE_TITLES = [
  "presedinte",
  "presedintele",
  "presedintelui",
  "president",
  "presidentul",
  "prim ministru",
  "prim-ministru",
  "premier",
  "ministru",
  "guvernator",
  "ceo",
  "director",
  "primar",
  "titular",
  "lider",
  "sef"
];

const CURRENT_DOMAINS = [
  "pret",
  "preț",
  "price",
  "bitcoin",
  "btc",
  "eur",
  "usd",
  "dkk",
  "ron",
  "lege",
  "law",
  "regulation",
  "scor",
  "score",
  "clasament",
  "weather",
  "vreme",
  "stoc",
  "available",
  "disponibil"
];

const HISTORICAL_MARKERS = [
  "a fost",
  "era",
  "au fost",
  "fusese",
  "domnie",
  "domnitor",
  "voievod",
  "rege",
  "imparat",
  "secol",
  "medieval",
  "istoric",
  "in trecut",
  "s-a nascut",
  "a murit",
  "batalia",
  "imperiu",
  "cronica",
  "anul"
];

function hasAnyPhrase(t, list) {
  return list.some(x => t.includes(normalize(x)));
}

function hasHistoricalYear(t) {
  const years = t.match(/\b(1[0-9]{3}|20[0-1][0-9]|202[0-4])\b/g);
  return Boolean(years && years.length);
}

export function presentGate(text = "") {
  const raw = String(text || "");
  const t = normalize(raw);

  const hasPresentMarker = hasAnyPhrase(t, PRESENT_MARKERS);
  const hasOfficeTitle = hasAnyPhrase(t, OFFICE_TITLES);
  const hasCurrentDomain = hasAnyPhrase(t, CURRENT_DOMAINS);
  const hasHistoricalContext = hasAnyPhrase(t, HISTORICAL_MARKERS) || hasHistoricalYear(t);
  const isQuestion = /\?/.test(raw) || /\b(cine|care|who|what)\b/.test(t);
  const hasPresentCopula = /\b(este|e|is|are)\b/.test(t);

  const active =
    !hasHistoricalContext &&
    (
      hasCurrentDomain && hasPresentMarker ||
      hasOfficeTitle && hasPresentMarker ||
      hasOfficeTitle && isQuestion ||
      hasOfficeTitle && hasPresentCopula
    );

  let relation_type = "stable_or_slow_relation";

  if (active && hasOfficeTitle) relation_type = "current_office_holder";
  else if (active && hasCurrentDomain) relation_type = "current_value_or_status";

  return {
    active,
    relation_type,
    has_present_marker: hasPresentMarker,
    has_office_title: hasOfficeTitle,
    has_current_domain: hasCurrentDomain,
    has_historical_context: hasHistoricalContext,
    is_question: isQuestion,
    reason: active
      ? "Afirmația depinde de prezent și necesită rezolvare factuală actuală."
      : hasHistoricalContext
        ? "Context istoric detectat; nu activez verificarea de prezent."
        : "Afirmația nu pare dependentă critic de prezent."
  };
}

function resolveMath(claim) {
  if (claim.type !== "math") return null;

  const real = safeMathEval(claim.subject);
  const claimed = Number(String(claim.object).replace(/,/g, "."));

  if (!Number.isFinite(real) || !Number.isFinite(claimed)) {
    return {
      resolver: "math",
      status: "incomplete",
      resolved_object: null,
      explanation: "Expresia matematică nu a putut fi evaluată sigur."
    };
  }

  return {
    resolver: "math",
    status: "resolved",
    resolved_object: String(real),
    numeric_value: real,
    explanation: `Calcul direct: ${claim.subject} = ${real}.`
  };
}

function classifyStableKnowledge(claim) {
  const s = cleanEntity(claim.subject);
  const o = cleanEntity(claim.object);

  // Nu sunt hardcoduri de persoane sau politică.
  // Sunt reguli stabile de categorie, demonstrative.
  // Acest bloc poate fi extins ulterior dintr-un fișier JSON de reguli.

  if (s.includes("brazilia") || s.includes("brazil") || s.includes("brasil")) {
    if (claim.relation === "is" || claim.relation === "located_in") {
      return {
        resolver: "stable-geography",
        status: "resolved",
        resolved_object: "America de Sud",
        explanation: "Regulă geografică stabilă: Brazilia aparține Americii de Sud."
      };
    }
  }

  if (s.includes("romania") || s.includes("românia")) {
    if (claim.relation === "is" || claim.relation === "located_in") {
      return {
        resolver: "stable-geography",
        status: "resolved",
        resolved_object: "Europa",
        explanation: "Regulă geografică stabilă: România este în Europa."
      };
    }
  }

  if (s.includes("apa") || s.includes("apă") || s.includes("water") || s.includes("h2o")) {
    const obj = o;
    if (obj.includes("100") || obj.includes("fierbe") || obj.includes("boiling")) {
      return {
        resolver: "stable-physics-chemistry",
        status: "resolved",
        resolved_object: "100°C la presiune atmosferică standard",
        explanation: "Regulă fizico-chimică stabilă: apa fierbe aproximativ la 100°C la 1 atm."
      };
    }
  }

  return null;
}

function buildSearchQuery(claim, gate) {
  if (!gate.active) return null;

  if (gate.relation_type === "current_office_holder") {
    return `current ${claim.subject} official source incumbent`;
  }

  if (gate.relation_type === "current_value_or_status") {
    return `current ${claim.subject} ${claim.object || ""} official source`;
  }

  return `${claim.raw} current official source`;
}

function sourceAuthority(link = "") {
  const h = (() => {
    try {
      return new URL(link).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();

  if (
    /(gov|government|presidency|president|europa\.eu|un\.org|who\.int|cdc\.gov|nist\.gov|official|reuters|apnews|bbc|ft\.com|bloomberg)/.test(h)
  ) {
    return 5;
  }

  if (/(wikipedia|britannica|edu|university|nytimes|theguardian|washingtonpost)/.test(h)) {
    return 4;
  }

  if (/(blog|forum|reddit|facebook|youtube|tiktok|x\.com|twitter)/.test(h)) {
    return 1;
  }

  return 2;
}

async function searchWeb(query, env = process.env) {
  if (!env.SERPER_API_KEY || !query) {
    return [];
  }

  try {
    const r = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": env.SERPER_API_KEY
      },
      body: JSON.stringify({
        q: query,
        gl: "dk",
        hl: "en",
        num: 8
      })
    });

    if (!r.ok) return [];

    const data = await r.json();

    return (data.organic || []).map(x => ({
      title: x.title || "Sursă",
      link: x.link || "",
      snippet: x.snippet || "",
      authority_score: sourceAuthority(x.link || "")
    }));
  } catch {
    return [];
  }
}

function extractResolvedObjectFromSources(claim, gate, sources) {
  const combined = sources
    .map(s => `${s.title} ${s.snippet}`)
    .join("\n");

  const t = normalize(combined);

  // Fără nume hardcodate.
  // Extrage generic după tipar: "X is the current/president..."
  // Pentru limba română/engleză se caută titlu + nume propriu în surse.

  if (gate.relation_type === "current_office_holder") {
    const patterns = [
      /([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+){1,3})\s+(?:is|este)\s+(?:the\s+)?(?:current\s+)?(?:president|prime minister|mayor|ceo|director)/,
      /(?:current|incumbent)\s+(?:president|prime minister|mayor|ceo|director)\s+(?:is|:)\s+([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+){1,3})/,
      /(?:president|președinte|presedinte).*?:\s*([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+){1,3})/
    ];

    const raw = combined;

    for (const rx of patterns) {
      const m = raw.match(rx);
      if (m && m[1]) {
        return {
          resolved_object: m[1].trim(),
          extraction_method: "pattern_current_office_holder"
        };
      }
    }

    // fallback: dacă snippet-ul conține formulare „X, president of...”
    const fallback = raw.match(/([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+){1,3}),\s+(?:president|președinte|presedinte)/);
    if (fallback && fallback[1]) {
      return {
        resolved_object: fallback[1].trim(),
        extraction_method: "fallback_title_apposition"
      };
    }
  }

  return {
    resolved_object: null,
    extraction_method: "none"
  };
}

function compareObjects(claimed, resolved) {
  const c = cleanEntity(claimed);
  const r = cleanEntity(resolved);

  if (!c || !r) {
    return {
      comparable: false,
      match: false,
      claimed_normalized: c,
      resolved_normalized: r
    };
  }

  if (c === r) {
    return {
      comparable: true,
      match: true,
      claimed_normalized: c,
      resolved_normalized: r
    };
  }

  // Pentru valori matematice sau expresii numerice.
  const cn = Number(c.replace(",", "."));
  const rn = Number(r.replace(",", "."));

  if (Number.isFinite(cn) && Number.isFinite(rn)) {
    return {
      comparable: true,
      match: Math.abs(cn - rn) < 1e-9,
      claimed_normalized: c,
      resolved_normalized: r
    };
  }

  return {
    comparable: true,
    match: false,
    claimed_normalized: c,
    resolved_normalized: r
  };
}

export function closeRelation({ claim, resolved, gate, sources = [] }) {
  if (!resolved || resolved.status === "incomplete" || !resolved.resolved_object) {
    return {
      state: "incomplete",
      mode: "unconsumed",
      relation_subject: claim.subject,
      relation_type: claim.relation,
      relation_object_claimed: claim.object,
      relation_object_found: null,
      explanation: resolved?.explanation || "Relația nu a putut fi închisă factual.",
      sources
    };
  }

  // Întrebările nu au obiect afirmat; dacă găsim obiect, sunt answered.
  if (claim.type === "question") {
    return {
      state: "answered",
      mode: "truth_resolved",
      relation_subject: claim.subject,
      relation_type: gate?.relation_type || claim.relation,
      relation_object_claimed: null,
      relation_object_found: resolved.resolved_object,
      explanation: resolved.explanation || `Răspuns factual rezolvat: ${resolved.resolved_object}.`,
      sources
    };
  }

  const cmp = compareObjects(claim.object, resolved.resolved_object);

  if (cmp.comparable && cmp.match) {
    return {
      state: "confirmed",
      mode: "true_consumed",
      relation_subject: claim.subject,
      relation_type: claim.relation,
      relation_object_claimed: claim.object,
      relation_object_found: resolved.resolved_object,
      explanation: resolved.explanation || "Obiectul afirmat coincide cu obiectul rezolvat.",
      comparison: cmp,
      sources
    };
  }

  if (cmp.comparable && !cmp.match) {
    return {
      state: "contradicted",
      mode: "false_consumed",
      relation_subject: claim.subject,
      relation_type: claim.relation,
      relation_object_claimed: claim.object,
      relation_object_found: resolved.resolved_object,
      explanation:
        resolved.explanation ||
        `Obiectul afirmat („${claim.object}”) diferă de obiectul rezolvat („${resolved.resolved_object}”).`,
      comparison: cmp,
      sources
    };
  }

  return {
    state: "incomplete",
    mode: "unconsumed",
    relation_subject: claim.subject,
    relation_type: claim.relation,
    relation_object_claimed: claim.object,
    relation_object_found: resolved.resolved_object,
    explanation: "Obiectele nu au putut fi comparate sigur.",
    comparison: cmp,
    sources
  };
}

export async function verifyClaim(text, env = process.env) {
  const claim = extractClaim(text);
  const gate = presentGate(text);

  // 1. Matematică: calcul direct.
  const math = resolveMath(claim);
  if (math) {
    const closure = closeRelation({
      claim,
      resolved: math,
      gate,
      sources: []
    });

    return {
      verifier: "math",
      claim,
      gate,
      resolved: math,
      closure,
      truth_consumption: buildTruthConsumption(closure)
    };
  }

  // 2. Cunoaștere stabilă demonstrativă.
  // Ulterior poate fi mutată în rules.json.
  const stable = classifyStableKnowledge(claim);
  if (stable) {
    const closure = closeRelation({
      claim,
      resolved: stable,
      gate,
      sources: []
    });

    return {
      verifier: stable.resolver,
      claim,
      gate,
      resolved: stable,
      closure,
      truth_consumption: buildTruthConsumption(closure)
    };
  }

  // 3. Prezent: caută extern, dar generic.
  if (gate.active) {
    const query = buildSearchQuery(claim, gate);
    const sources = await searchWeb(query, env);

    const extraction = extractResolvedObjectFromSources(claim, gate, sources);

    const resolved = extraction.resolved_object
      ? {
          resolver: "external-present",
          status: "resolved",
          resolved_object: extraction.resolved_object,
          extraction_method: extraction.extraction_method,
          explanation: `Relație dependentă de prezent rezolvată din surse externe: ${extraction.resolved_object}.`
        }
      : {
          resolver: "external-present",
          status: "incomplete",
          resolved_object: null,
          extraction_method: extraction.extraction_method,
          explanation: "Sursele externe nu au oferit un obiect factual suficient de clar."
        };

    const closure = closeRelation({
      claim,
      resolved,
      gate,
      sources
    });

    return {
      verifier: "external-present",
      claim,
      gate,
      query,
      sources,
      resolved,
      closure,
      truth_consumption: buildTruthConsumption(closure)
    };
  }

  // 4. Necunoscut / neverificat.
  const resolved = {
    resolver: "none",
    status: "incomplete",
    resolved_object: null,
    explanation: "Nu există resolver factual potrivit pentru această afirmație."
  };

  const closure = closeRelation({
    claim,
    resolved,
    gate,
    sources: []
  });

  return {
    verifier: "none",
    claim,
    gate,
    resolved,
    closure,
    truth_consumption: buildTruthConsumption(closure)
  };
}

export function buildTruthConsumption(closure) {
  if (closure.state === "confirmed") {
    return {
      level: 5,
      max: 5,
      label: "adevăr consumat",
      explanation: `Relația a fost confirmată: ${closure.relation_subject} → ${closure.relation_type} → ${closure.relation_object_found}.`
    };
  }

  if (closure.state === "answered") {
    return {
      level: 5,
      max: 5,
      label: "răspuns factual rezolvat",
      explanation: `Răspuns: ${closure.relation_object_found}.`
    };
  }

  if (closure.state === "contradicted") {
    return {
      level: 5,
      max: 5,
      label: "fals consumat",
      explanation: `Relația este contrazisă: obiect afirmat „${closure.relation_object_claimed}”, obiect găsit „${closure.relation_object_found}”.`
    };
  }

  return {
    level: 1,
    max: 5,
    label: "adevăr neconsumat",
    explanation: closure.explanation || "Afirmația nu a putut fi verificată factual."
  };
}
