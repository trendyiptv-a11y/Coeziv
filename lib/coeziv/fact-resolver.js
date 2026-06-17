import { semanticVerifyClaim } from "./semantic-verifier.js";

export const normalize = (s = "") => String(s || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[ăâ]/g, "a")
  .replace(/î/g, "i")
  .replace(/[șş]/g, "s")
  .replace(/[țţ]/g, "t")
  .replace(/\s+/g, " ")
  .trim();

export const cleanEntity = (s = "") => normalize(s)
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
  if (math) return { type: "math", subject: math[1].trim(), relation: "equals", object: math[2].trim(), raw };

  if (/\?/.test(raw) || /\b(cine|care|who|what)\b/.test(t)) {
    return { type: "question", subject: raw.replace(/[?]+$/, "").trim(), relation: "asks", object: null, raw };
  }

  const patterns = [
    { relation: "was", rx: /^(.+?)\s+a\s+fost\s+(.+?)[.!?]?$/i },
    { relation: "was", rx: /^(.+?)\s+era\s+(.+?)[.!?]?$/i },
    { relation: "was", rx: /^(.+?)\s+was\s+(.+?)[.!?]?$/i },
    { relation: "is", rx: /^(.+?)\s+este\s+(.+?)[.!?]?$/i },
    { relation: "is", rx: /^(.+?)\s+e\s+(.+?)[.!?]?$/i },
    { relation: "is", rx: /^(.+?)\s+is\s+(.+?)[.!?]?$/i },
    { relation: "has", rx: /^(.+?)\s+are\s+(.+?)[.!?]?$/i },
    { relation: "located_in", rx: /^(.+?)\s+(?:este\s+)?(?:in|în)\s+(.+?)[.!?]?$/i }
  ];

  for (const p of patterns) {
    const m = raw.match(p.rx);
    if (m) return { type: "relation", subject: m[1].trim(), relation: p.relation, object: m[2].replace(/[.!?]+$/, "").trim(), raw };
  }

  return { type: "unknown", subject: raw, relation: "unknown", object: null, raw };
}

const PRESENT_MARKERS = ["actual", "actualul", "actuala", "curent", "curenta", "prezent", "azi", "acum", "today", "now", "current", "latest", "incumbent", "in vigoare", "în vigoare"];
const OFFICE_TITLES = ["presedinte", "presedintele", "presedintelui", "president", "presidentul", "prim ministru", "prim-ministru", "premier", "ministru", "guvernator", "ceo", "director", "primar", "titular", "lider", "sef"];
const CURRENT_DOMAINS = ["pret", "preț", "price", "bitcoin", "btc", "eur", "usd", "dkk", "ron", "lege", "law", "regulation", "scor", "score", "clasament", "weather", "vreme", "stoc", "available", "disponibil"];
const HISTORICAL_MARKERS = ["a fost", "era", "au fost", "fusese", "domnie", "domnitor", "voievod", "rege", "imparat", "secol", "medieval", "istoric", "in trecut", "s-a nascut", "a murit", "batalia", "imperiu", "cronica", "anul"];

function hasAnyPhrase(t, list) { return list.some(x => t.includes(normalize(x))); }
function hasHistoricalYear(t) { return Boolean(t.match(/\b(1[0-9]{3}|20[0-1][0-9]|202[0-4])\b/g)); }

export function presentGate(text = "") {
  const raw = String(text || "");
  const t = normalize(raw);
  const hasPresentMarker = hasAnyPhrase(t, PRESENT_MARKERS);
  const hasOfficeTitle = hasAnyPhrase(t, OFFICE_TITLES);
  const hasCurrentDomain = hasAnyPhrase(t, CURRENT_DOMAINS);
  const hasHistoricalContext = hasAnyPhrase(t, HISTORICAL_MARKERS) || hasHistoricalYear(t);
  const isQuestion = /\?/.test(raw) || /\b(cine|care|who|what)\b/.test(t);
  const hasPresentCopula = /\b(este|e|is|are)\b/.test(t);
  const active = !hasHistoricalContext && ((hasCurrentDomain && hasPresentMarker) || (hasOfficeTitle && hasPresentMarker) || (hasOfficeTitle && isQuestion) || (hasOfficeTitle && hasPresentCopula));
  return {
    active,
    relation_type: active && hasOfficeTitle ? "current_office_holder" : active && hasCurrentDomain ? "current_value_or_status" : "stable_or_slow_relation",
    has_present_marker: hasPresentMarker,
    has_office_title: hasOfficeTitle,
    has_current_domain: hasCurrentDomain,
    has_historical_context: hasHistoricalContext,
    is_question: isQuestion,
    reason: active ? "Afirmația depinde de prezent și necesită rezolvare factuală actuală." : hasHistoricalContext ? "Context istoric detectat; nu activez verificarea de prezent." : "Afirmația nu pare dependentă critic de prezent."
  };
}

function resolveMath(claim) {
  if (claim.type !== "math") return null;
  const real = safeMathEval(claim.subject);
  const claimed = Number(String(claim.object).replace(/,/g, "."));
  if (!Number.isFinite(real) || !Number.isFinite(claimed)) return { resolver: "math", status: "incomplete", resolved_object: null, explanation: "Expresia matematică nu a putut fi evaluată sigur." };
  return { resolver: "math", status: "resolved", resolved_object: String(real), numeric_value: real, explanation: `Calcul direct: ${claim.subject} = ${real}.` };
}

function buildSearchQuery(claim, gate) {
  if (gate.active && gate.relation_type === "current_office_holder") return `current ${claim.subject} official source incumbent`;
  if (gate.active && gate.relation_type === "current_value_or_status") return `current ${claim.subject} ${claim.object || ""} official source`;
  if (claim.type === "relation" && claim.relation === "was") return `${claim.subject} ${claim.object} biography history encyclopedia`;
  if (claim.type === "relation") return `${claim.raw} factual source encyclopedia official`;
  if (claim.type === "question") return `${claim.subject} factual answer official source`;
  return null;
}

function sourceAuthority(link = "") {
  let h = "";
  try { h = new URL(link).hostname.toLowerCase(); } catch {}
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
      headers: { "Content-Type": "application/json", "X-API-KEY": env.SERPER_API_KEY },
      body: JSON.stringify({ q: query, gl: "dk", hl: "en", num: 8 })
    });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.organic || []).map(x => ({ title: x.title || "Sursă", link: x.link || "", snippet: x.snippet || "", authority_score: sourceAuthority(x.link || "") }));
  } catch { return []; }
}

function tokens(s = "") {
  return cleanEntity(s)
    .replace(/\b(al|a|ai|ale|of|the|in|din|de|la|si|și|spaniei|spain|moldovei|moldova|moldavia)\b/g, " ")
    .split(/\s+/)
    .filter(x => x.length >= 3);
}

function tokenOverlap(a = "", b = "") {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.max(A.size, B.size);
}

function localSourceJudge(claim, sources = []) {
  const claimed = cleanEntity(claim.object);
  const subjectTerms = tokens(claim.subject);
  let best = null;

  for (const s of sources) {
    const raw = `${s.title || ""}. ${s.snippet || ""}`;
    const text = cleanEntity(raw);
    const hasSubject = subjectTerms.some(term => text.includes(term));
    const hasClaim = claimed && text.includes(claimed);
    const score = Number(s.authority_score || 0) + (hasSubject ? 3 : 0) + (hasClaim ? 3 : 0);
    if (!best || score > best.score) best = { source: s, raw, text, hasSubject, hasClaim, score };
  }

  if (!best || !best.hasSubject) return null;

  if (best.hasClaim) {
    return { state: "confirmed", object_found: claim.object, explanation: "Sursele conțin direct subiectul și obiectul afirmat.", evidence: best.source };
  }

  const raw = best.raw;
  const patterns = [
    /\b(?:was|is)\s+(?:a|an|the)?\s*([^.;:]{3,90})/i,
    /\b(?:known as|commonly known as)\s+([^.;:]{3,90})/i,
    /\b(?:ruler|prince|king|queen|voivode|domnitor|rege|voievod)\s+(?:of|al|a|ai|ale)\s+([^.;:]{3,80})/i
  ];

  for (const rx of patterns) {
    const m = raw.match(rx);
    if (!m || !m[1]) continue;
    const found = m[1].trim();
    const overlap = tokenOverlap(claim.object, found);
    if (overlap >= 0.65) {
      return { state: "confirmed", object_found: found, explanation: "Sursele susțin semantic obiectul afirmat.", evidence: best.source };
    }
    return { state: "contradicted", object_found: found, explanation: "Sursele indică un obiect factual diferit de obiectul afirmat.", evidence: best.source };
  }

  return null;
}

function compareObjects(claimed, resolved) {
  const c = cleanEntity(claimed);
  const r = cleanEntity(resolved);
  if (!c || !r) return { comparable: false, match: false, claimed_normalized: c, resolved_normalized: r };
  if (c === r) return { comparable: true, match: true, claimed_normalized: c, resolved_normalized: r };
  const cn = Number(c.replace(",", "."));
  const rn = Number(r.replace(",", "."));
  if (Number.isFinite(cn) && Number.isFinite(rn)) return { comparable: true, match: Math.abs(cn - rn) < 1e-9, claimed_normalized: c, resolved_normalized: r };
  return { comparable: true, match: tokenOverlap(c, r) >= 0.65, claimed_normalized: c, resolved_normalized: r };
}

export function closeRelation({ claim, resolved, gate, sources = [] }) {
  if (!resolved || resolved.status === "incomplete" || !resolved.resolved_object) {
    return { state: "incomplete", mode: "unconsumed", relation_subject: claim.subject, relation_type: claim.relation, relation_object_claimed: claim.object, relation_object_found: null, explanation: resolved?.explanation || "Relația nu a putut fi închisă factual.", sources };
  }
  if (claim.type === "question") {
    return { state: "answered", mode: "truth_resolved", relation_subject: claim.subject, relation_type: gate?.relation_type || claim.relation, relation_object_claimed: null, relation_object_found: resolved.resolved_object, explanation: resolved.explanation || `Răspuns factual rezolvat: ${resolved.resolved_object}.`, sources };
  }
  const cmp = compareObjects(claim.object, resolved.resolved_object);
  if (cmp.comparable && cmp.match) return { state: "confirmed", mode: "true_consumed", relation_subject: claim.subject, relation_type: claim.relation, relation_object_claimed: claim.object, relation_object_found: resolved.resolved_object, explanation: resolved.explanation || "Obiectul afirmat coincide cu obiectul rezolvat.", comparison: cmp, sources };
  if (cmp.comparable && !cmp.match) return { state: "contradicted", mode: "false_consumed", relation_subject: claim.subject, relation_type: claim.relation, relation_object_claimed: claim.object, relation_object_found: resolved.resolved_object, explanation: resolved.explanation || `Obiectul afirmat („${claim.object}”) diferă de obiectul rezolvat („${resolved.resolved_object}”).`, comparison: cmp, sources };
  return { state: "incomplete", mode: "unconsumed", relation_subject: claim.subject, relation_type: claim.relation, relation_object_claimed: claim.object, relation_object_found: resolved.resolved_object, explanation: "Obiectele nu au putut fi comparate sigur.", comparison: cmp, sources };
}

function closureFromSemantic(claim, gate, semantic, sources) {
  const state = ["confirmed", "contradicted", "answered", "incomplete"].includes(semantic?.state) ? semantic.state : "incomplete";
  return {
    state,
    mode: state === "confirmed" ? "true_consumed" : state === "contradicted" ? "false_consumed" : state === "answered" ? "truth_resolved" : "unconsumed",
    relation_subject: semantic?.relation_subject ?? claim.subject,
    relation_type: semantic?.relation_type ?? claim.relation ?? gate?.relation_type,
    relation_object_claimed: semantic?.relation_object_claimed ?? claim.object ?? null,
    relation_object_found: semantic?.relation_object_found ?? null,
    explanation: semantic?.explanation || "Judecată semantică fără explicație.",
    evidence_index: semantic?.evidence_index ?? null,
    evidence_title: semantic?.evidence_title ?? null,
    evidence_url: semantic?.evidence_url ?? null,
    confidence: semantic?.confidence ?? null,
    verifier_model: semantic?.verifier_model ?? null,
    sources
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

  const query = buildSearchQuery(claim, gate);
  const sources = await searchWeb(query, env);

  if (sources.length && env.OPENAI_API_KEY) {
    const semantic = await semanticVerifyClaim({ claim, gate, sources, env });
    if (semantic?.state && semantic.state !== "incomplete") {
      const closure = closureFromSemantic(claim, gate, semantic, sources);
      return { verifier: "semantic-ai", claim, gate, query, sources, semantic, resolved: { resolver: "semantic-ai", status: "resolved", resolved_object: closure.relation_object_found, explanation: closure.explanation }, closure, truth_consumption: buildTruthConsumption(closure) };
    }
  }

  if (sources.length) {
    const local = localSourceJudge(claim, sources);
    if (local) {
      const resolved = { resolver: "source-fallback", status: "resolved", resolved_object: local.object_found, explanation: local.explanation };
      const closure = local.state === "confirmed"
        ? { state: "confirmed", mode: "true_consumed", relation_subject: claim.subject, relation_type: claim.relation, relation_object_claimed: claim.object, relation_object_found: local.object_found, explanation: local.explanation, sources }
        : { state: "contradicted", mode: "false_consumed", relation_subject: claim.subject, relation_type: claim.relation, relation_object_claimed: claim.object, relation_object_found: local.object_found, explanation: local.explanation, sources };
      return { verifier: "source-fallback", claim, gate, query, sources, resolved, closure, truth_consumption: buildTruthConsumption(closure) };
    }
  }

  const resolved = { resolver: query ? "external-search" : "none", status: "incomplete", resolved_object: null, explanation: query ? "Sursele externe nu au oferit un obiect factual suficient de clar." : "Nu există resolver factual potrivit pentru această afirmație." };
  const closure = closeRelation({ claim, resolved, gate, sources });
  return { verifier: resolved.resolver, claim, gate, query, sources, resolved, closure, truth_consumption: buildTruthConsumption(closure) };
}

export function buildTruthConsumption(closure) {
  if (closure.state === "confirmed") return { level: 5, max: 5, label: "adevăr consumat", explanation: `Relația a fost confirmată: ${closure.relation_subject} → ${closure.relation_type} → ${closure.relation_object_found}.` };
  if (closure.state === "answered") return { level: 5, max: 5, label: "răspuns factual rezolvat", explanation: `Răspuns: ${closure.relation_object_found}.` };
  if (closure.state === "contradicted") return { level: 5, max: 5, label: "fals consumat", explanation: `Relația este contrazisă: obiect afirmat „${closure.relation_object_claimed}”, obiect găsit „${closure.relation_object_found}”.` };
  return { level: 1, max: 5, label: "adevăr neconsumat", explanation: closure.explanation || "Afirmația nu a putut fi verificată factual." };
}
