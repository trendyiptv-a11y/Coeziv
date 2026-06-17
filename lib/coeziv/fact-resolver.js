// lib/coeziv/fact-resolver.js
// Modul generic de verificare factuală.
// Nu calculează coeziunea. Nu dă scor coeziv.
// Primește afirmația, extrage relația și încearcă să o închidă factual.
//
// Principiu:
// claimed_object = obiectul afirmat de utilizator
// resolved_object = obiectul găsit prin calcul, regulă stabilă sau sursă externă
//
// Nu hardcodăm persoane sau adevăruri politice punctuale în codul API.
// Codăm metode: calcul, clasificare stabilă, căutare externă, extragere relațională, comparație.

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
    { type: "relation", relation: "was", rx: /^(.+?)\s+a\s+fost\s+(.+?)[.!?]?$/i },
    { type: "relation", relation: "was", rx: /^(.+?)\s+era\s+(.+?)[.!?]?$/i },
    { type: "relation", relation: "was", rx: /^(.+?)\s+was\s+(.+?)[.!?]?$/i },
    { type: "relation", relation: "is", rx: /^(.+?)\s+este\s+(.+?)[.!?]?$/i },
    { type: "relation", relation: "is", rx: /^(.+?)\s+e\s+(.+?)[.!?]?$/i },
    { type: "relation", relation: "is", rx: /^(.+?)\s+is\s+(.+?)[.!?]?$/i },
    { type: "relation", relation: "has", rx: /^(.+?)\s+are\s+(.+?)[.!?]?$/i },
    { type: "relation", relation: "located_in", rx: /^(.+?)\s+(?:este\s+)?(?:in|în)\s+(.+?)[.!?]?$/i }
  ];

  for (const p of patterns) {
    const m = raw.match(p.rx);
    if (m) {
      return {
        type: p.type,
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
  "actual", "actualul", "actuala", "curent", "curenta", "prezent", "azi", "acum",
  "today", "now", "current", "latest", "incumbent", "in vigoare", "în vigoare"
];

const OFFICE_TITLES = [
  "presedinte", "presedintele", "presedintelui", "president", "presidentul",
  "prim ministru", "prim-ministru", "premier", "ministru", "guvernator",
  "ceo", "director", "primar", "titular", "lider", "sef"
];

const CURRENT_DOMAINS = [
  "pret", "preț", "price", "bitcoin", "btc", "eur", "usd", "dkk", "ron",
  "lege", "law", "regulation", "scor", "score", "clasament", "weather", "vreme",
  "stoc", "available", "disponibil"
];

const HISTORICAL_MARKERS = [
  "a fost", "era", "au fost", "fusese", "domnie", "domnitor", "voievod", "rege",
  "imparat", "secol", "medieval", "istoric", "in trecut", "s-a nascut", "a murit",
  "batalia", "imperiu", "cronica", "anul"
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

  // Reguli stabile de categorie, nu hardcod politic/persoane curente.
  // Pentru istorie, modulul extern generic este preferat.

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
    if (o.includes("100") || o.includes("fierbe") || o.includes("boiling")) {
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
  if (gate.active && gate.relation_type === "current_office_holder") {
    return `current ${claim.subject} official source incumbent`;
  }

  if (gate.active && gate.relation_type === "current_value_or_status") {
    return `current ${claim.subject} ${claim.object || ""} official source`;
  }

  if (claim.relation === "was") {
    return `${claim.subject} biography was ${claim.object} Britannica Wikipedia official source`;
  }

  if (claim.relation === "is" || claim.relation === "located_in" || claim.relation === "has") {
    return `${claim.raw} factual source Britannica Wikipedia official`;
  }

  return null;
}

function sourceAuthority(link = "") {
  const h = (() => {
    try {
      return new URL(link).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();

  if (/(gov|government|presidency|president|europa\.eu|un\.org|who\.int|cdc\.gov|nist\.gov|official|reuters|apnews|bbc|ft\.com|bloomberg)/.test(h)) return 5;
  if (/(wikipedia|britannica|edu|university|nytimes|theguardian|washingtonpost|history|encyclopedia)/.test(h)) return 4;
  if (/(blog|forum|reddit|facebook|youtube|tiktok|x\.com|twitter)/.test(h)) return 1;
  return 2;
}

async function searchWeb(query, env = process.env) {
  if (!env.SERPER_API_KEY || !query) return [];

  try {
    const r = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": env.SERPER_API_KEY
      },
      body: JSON.stringify({ q: query, gl: "dk", hl: "en", num: 8 })
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

function tokenizeMeaning(s = "") {
  return cleanEntity(s)
    .replace(/\b(este|e|is|was|a fost|era|the|of|al|a|ai|ale|in|în|din|de|la|si|și|spaniei|spain|romaniei|romania)\b/g, " ")
    .split(/\s+/)
    .filter(x => x.length >= 3);
}

function overlapScore(a = "", b = "") {
  const A = new Set(tokenizeMeaning(a));
  const B = new Set(tokenizeMeaning(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.max(A.size, B.size);
}

function bestSourceEvidence(claim, sources) {
  const subjectTerms = tokenizeMeaning(claim.subject);
  const claimedObject = cleanEntity(claim.object);
  let best = null;

  for (const s of sources) {
    const raw = `${s.title || ""}. ${s.snippet || ""}`;
    const text = cleanEntity(raw);
    const hasSubject = subjectTerms.length
      ? subjectTerms.some(term => text.includes(term))
      : false;

    const hasClaimedObject = claimedObject && text.includes(claimedObject);
    const evidenceScore = Number(s.authority_score || 0) + (hasSubject ? 2 : 0) + (hasClaimedObject ? 2 : 0);

    if (!best || evidenceScore > best.score) {
      best = { source: s, raw, text, hasSubject, hasClaimedObject, score: evidenceScore };
    }
  }

  return best;
}

function extractResolvedObjectFromSources(claim, gate, sources) {
  const combined = sources.map(s => `${s.title}. ${s.snippet}`).join("\n");
  const raw = combined;

  if (gate.relation_type === "current_office_holder") {
    const patterns = [
      /([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+){1,3})\s+(?:is|este)\s+(?:the\s+)?(?:current\s+)?(?:president|prime minister|mayor|ceo|director)/,
      /(?:current|incumbent)\s+(?:president|prime minister|mayor|ceo|director)\s+(?:is|:)\s+([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+){1,3})/,
      /(?:president|președinte|presedinte).*?:\s*([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+){1,3})/
    ];

    for (const rx of patterns) {
      const m = raw.match(rx);
      if (m && m[1]) {
        return { resolved_object: m[1].trim(), extraction_method: "pattern_current_office_holder" };
      }
    }

    const fallback = raw.match(/([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+){1,3}),\s+(?:president|președinte|presedinte)/);
    if (fallback && fallback[1]) {
      return { resolved_object: fallback[1].trim(), extraction_method: "fallback_title_apposition" };
    }
  }

  if (claim.relation === "was" || claim.relation === "is") {
    const evidence = bestSourceEvidence(claim, sources);
    if (!evidence || !evidence.hasSubject) {
      return { resolved_object: null, extraction_method: "none" };
    }

    if (evidence.hasClaimedObject) {
      return {
        resolved_object: claim.object,
        extraction_method: "source_contains_claimed_relation",
        evidence_title: evidence.source.title,
        evidence_url: evidence.source.link
      };
    }

    const objectCandidates = [];
    const patterns = [
      /\b(?:was|is)\s+(?:a|an|the)?\s*([^.;:]{3,90})/i,
      /\b(?:known as|commonly known as)\s+([^.;:]{3,90})/i,
      /\b(?:ruler|prince|king|queen|voivode|domnitor|rege|voievod)\s+(?:of|al|a|ai|ale)\s+([^.;:]{3,80})/i
    ];

    for (const rx of patterns) {
      const m = evidence.raw.match(rx);
      if (m && m[1]) objectCandidates.push(m[1].trim());
    }

    const resolved = objectCandidates[0] || null;
    return {
      resolved_object: resolved,
      extraction_method: resolved ? "generic_historical_relation_pattern" : "source_subject_without_claimed_object",
      evidence_title: evidence.source.title,
      evidence_url: evidence.source.link
    };
  }

  return { resolved_object: null, extraction_method: "none" };
}

function compareObjects(claimed, resolved) {
  const c = cleanEntity(claimed);
  const r = cleanEntity(resolved);

  if (!c || !r) return { comparable: false, match: false, claimed_normalized: c, resolved_normalized: r };
  if (c === r) return { comparable: true, match: true, claimed_normalized: c, resolved_normalized: r };

  const cn = Number(c.replace(",", "."));
  const rn = Number(r.replace(",", "."));
  if (Number.isFinite(cn) && Number.isFinite(rn)) {
    return { comparable: true, match: Math.abs(cn - rn) < 1e-9, claimed_normalized: c, resolved_normalized: r };
  }

  const overlap = overlapScore(c, r);
  return { comparable: true, match: overlap >= 0.72, claimed_normalized: c, resolved_normalized: r, overlap };
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
      explanation: resolved.explanation || `Obiectul afirmat („${claim.object}”) diferă de obiectul rezolvat („${resolved.resolved_object}”).`,
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

function buildResolvedFromExtraction(extraction, resolverName, fallbackExplanation) {
  return extraction.resolved_object
    ? {
        resolver: resolverName,
        status: "resolved",
        resolved_object: extraction.resolved_object,
        extraction_method: extraction.extraction_method,
        evidence_title: extraction.evidence_title,
        evidence_url: extraction.evidence_url,
        explanation: fallbackExplanation || `Relație rezolvată din surse externe: ${extraction.resolved_object}.`
      }
    : {
        resolver: resolverName,
        status: "incomplete",
        resolved_object: null,
        extraction_method: extraction.extraction_method,
        explanation: "Sursele externe nu au oferit un obiect factual suficient de clar."
      };
}

export async function verifyClaim(text, env = process.env) {
  const claim = extractClaim(text);
  const gate = presentGate(text);

  const math = resolveMath(claim);
  if (math) {
    const closure = closeRelation({ claim, resolved: math, gate, sources: [] });
    return { verifier: "math", claim, gate, resolved: math, closure, truth_consumption: buildTruthConsumption(closure) };
  }

  const stable = classifyStableKnowledge(claim);
  if (stable) {
    const closure = closeRelation({ claim, resolved: stable, gate, sources: [] });
    return { verifier: stable.resolver, claim, gate, resolved: stable, closure, truth_consumption: buildTruthConsumption(closure) };
  }

  const query = buildSearchQuery(claim, gate);
  if (query) {
    const sources = await searchWeb(query, env);
    const extraction = extractResolvedObjectFromSources(claim, gate, sources);
    const resolverName = gate.active ? "external-present" : "external-stable";
    const resolved = buildResolvedFromExtraction(extraction, resolverName);
    const closure = closeRelation({ claim, resolved, gate, sources });

    return {
      verifier: resolverName,
      claim,
      gate,
      query,
      sources,
      resolved,
      closure,
      truth_consumption: buildTruthConsumption(closure)
    };
  }

  const resolved = {
    resolver: "none",
    status: "incomplete",
    resolved_object: null,
    explanation: "Nu există resolver factual potrivit pentru această afirmație."
  };

  const closure = closeRelation({ claim, resolved, gate, sources: [] });
  return { verifier: "none", claim, gate, resolved, closure, truth_consumption: buildTruthConsumption(closure) };
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
