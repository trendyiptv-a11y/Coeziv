// Motor Coeziv 3.14Δ / 3.14ΔH
// Regimuri de adevăr + rafinare obiectivă pe straturi: știință, limbaj, vibrație.

const COEZIV_ANALYSIS_MODEL = process.env.COEZIV_ANALYSIS_MODEL || process.env.COEZIV_MODEL || "gpt-4.1";
const COEZIV_SOURCE_MODEL = process.env.COEZIV_SOURCE_MODEL || process.env.COEZIV_MODEL || "gpt-4.1-mini";

function usesResponsesAPI(model) { return String(model || "").toLowerCase().startsWith("gpt-5"); }
function stripDiacritics(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ă|â/g, "a").replace(/Ă|Â/g, "A").replace(/î/g, "i").replace(/Î/g, "I").replace(/ș|ş/g, "s").replace(/Ș|Ş/g, "S").replace(/ț|ţ/g, "t").replace(/Ț|Ţ/g, "T"); }
function normalizedText(value) { return stripDiacritics(String(value || "").toLowerCase()); }
function readResponsesText(data) { if (typeof data?.output_text === "string") return data.output_text; const parts = []; for (const item of data?.output || []) for (const c of item?.content || []) { if (typeof c?.text === "string") parts.push(c.text); if (typeof c?.value === "string") parts.push(c.value); } return parts.join("\n"); }

async function callOpenAIText({ model, system, user, temperature }) {
  if (usesResponsesAPI(model)) {
    const resp = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model, instructions: system, input: user }) });
    if (!resp.ok) { const error = new Error("OpenAI request failed"); error.status = resp.status; error.detail = (await resp.text())?.slice(0, 800); error.model = model; error.endpoint = "responses"; throw error; }
    return readResponsesText(await resp.json());
  }
  const resp = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model, temperature, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
  if (!resp.ok) { const error = new Error("OpenAI request failed"); error.status = resp.status; error.detail = (await resp.text())?.slice(0, 800); error.model = model; error.endpoint = "chat/completions"; throw error; }
  const data = await resp.json(); return data?.choices?.[0]?.message?.content || "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed. Use POST /api/analyze" });
  let body = {}; try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); } catch { return res.status(400).json({ error: "Invalid JSON body." }); }
  const { text, humanMode } = body;
  if (!text || typeof text !== "string") return res.status(400).json({ error: "Missing text for analysis." });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "Server misconfigured: OPENAI_API_KEY is missing." });

  try {
    const gptPrompt = `
Ești Motorul Coeziv 3.14Δ — un sistem de analiză factuală, logică și semantică bazat pe Formula Coeziunii 3.14Δ.

Analizează afirmația conform axelor:
1. Factual (F) – adevărul obiectiv verificabil.
2. Logic (L) – coerența cauză-efect.
3. Semantic (C) – claritatea termenilor și adecvarea la context.

Acordă pentru fiecare o valoare între 0 și 3.14, apoi calculează V=(F+L+C)/3.
Returnează DOAR JSON VALID:
{
  "factual_score": number,
  "logic_score": number,
  "semantic_score": number,
  "V": number,
  "verdict": "scurt",
  "summary": "explicație scurtă pe baza F, L și C"
}

Afirmația:
"${text}"
`.trim();

    const content = await callOpenAIText({ model: COEZIV_ANALYSIS_MODEL, temperature: 0.25, system: "Ești un evaluator de adevăr conform Formulei Coeziunii 3.14Δ. Răspunde strict cu JSON valid, fără markdown.", user: gptPrompt });

    function extractJson(str) { const fenced = str.match(/```json\s*([\s\S]*?)\s*```/) || str.match(/```\s*([\s\S]*?)\s*```/); if (fenced) return fenced[1].trim(); const start = str.indexOf("{"); const end = str.lastIndexOf("}"); if (start !== -1 && end !== -1 && end > start) return str.slice(start, end + 1); return str.trim(); }
    function extractJsonArray(str) { const fenced = str.match(/```json\s*([\s\S]*?)\s*```/) || str.match(/```\s*([\s\S]*?)\s*```/); const raw = fenced ? fenced[1].trim() : str.trim(); const start = raw.indexOf("["); const end = raw.lastIndexOf("]"); if (start !== -1 && end !== -1 && end > start) return raw.slice(start, end + 1); return raw; }
    let gptJson; try { gptJson = JSON.parse(extractJson(content)); } catch { gptJson = { factual_score: 1.57, logic_score: 1.57, semantic_score: 1.57, V: 1.57, verdict: "Ambiguu (parsare eșuată)", summary: "Modelul nu a întors JSON pur; s-a folosit fallback." }; }
    const safe = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(n, 3.14)) : 1.57; };

    let F = safe(gptJson.factual_score), L = safe(gptJson.logic_score), C = safe(gptJson.semantic_score);

    function buildSearchQueries(txt) {
      const clean = String(txt || "").trim().slice(0, 180), cleanNoDia = stripDiacritics(clean);
      const negatives = "-teren -terasament -geotehnic -tapiterie -tapiserie -honda -compactarea -pământuri -pamanturi -soluri";
      return [...new Set([
        clean ? `"${clean}" ${negatives}` : null,
        cleanNoDia && cleanNoDia !== clean ? `"${cleanNoDia}" ${negatives}` : null,
        `"Model Coeziv" "Sergiu Bulboacă" ${negatives}`, `"Model Coeziv" "Sergiu Bulboaca" ${negatives}`,
        `"Modelul Coeziv" "Sergiu Bulboacă" ${negatives}`, `"Modelului Coeziv" "Sergiu Bulboaca" ${negatives}`,
        `"Formula Coeziunii" "Sergiu Bulboacă" ${negatives}`, `"Formula Coeziunii" "Sergiu Bulboaca" ${negatives}`,
        `"3.14ΔH" OR "3.14 ΔH" OR "3.14DH" ${negatives}`, `"Exploratorul Coeziv" ${negatives}`, `"Analizor Coeziv" ${negatives}`
      ].filter(Boolean))].slice(0, 14);
    }
    function normalizeLink(link) { try { const url = new URL(String(link || "")); url.hash = ""; return url.href.replace(/\/$/, ""); } catch { return String(link || ""); } }
    function isInternalSource(link) { const value = String(link || "").toLowerCase(); return value.includes("coeziv.vercel.app") || value.includes("github.com/trendyiptv-a11y/coeziv") || value.includes("chatgpt.com/g/"); }
    function sourceRelevanceScore(source, inputText) {
      const haystack = `${source.title || ""} ${source.snippet || ""} ${source.link || ""}`.toLowerCase(); const input = String(inputText || "").toLowerCase();
      const haystackNoDia = stripDiacritics(haystack).toLowerCase(), inputNoDia = stripDiacritics(input).toLowerCase();
      const goodTerms = ["model coeziv", "modelul coeziv", "modelului coeziv", "formula coeziunii", "3.14", "3.14δh", "3.14Δh", "sergiu bulboacă", "sergiu bulboaca", "analizor coeziv", "exploratorul coeziv", "coeziv"];
      const badTerms = ["terasament", "terasamente", "pământuri coezive", "pamanturi coezive", "sol coeziv", "soluri coezive", "geotehnic", "geotehnică", "geotehnica", "compactarea", "tapiteria", "tapiserie", "honda"];
      let score = 0; for (const term of goodTerms) { const t = term.toLowerCase(), tNoDia = stripDiacritics(t).toLowerCase(); if (haystack.includes(t) || haystackNoDia.includes(tNoDia)) score += t === "coeziv" ? 0.35 : 1.5; if (input.includes(t) || inputNoDia.includes(tNoDia)) score += 0.15; } for (const term of badTerms) { const t = term.toLowerCase(), tNoDia = stripDiacritics(t).toLowerCase(); if (haystack.includes(t) || haystackNoDia.includes(tNoDia)) score -= 4; } if (isInternalSource(source.link)) score -= 2; return score;
    }
    async function collectSerperResults(inputText) {
      if (!process.env.SERPER_API_KEY) return []; const queries = buildSearchQueries(inputText), seen = new Set(), results = [];
      for (const q of queries) try { const serp = await fetch("https://google.serper.dev/search", { method: "POST", headers: { "Content-Type": "application/json", "X-API-KEY": process.env.SERPER_API_KEY }, body: JSON.stringify({ q, gl: "ro", hl: "ro", num: 10 }) }); if (!serp.ok) continue; const serpData = await serp.json(); for (const r of (serpData?.organic || [])) { const link = normalizeLink(r.link || ""); if (!link || seen.has(link)) continue; seen.add(link); results.push({ index: results.length, title: r.title || "Sursă", link, snippet: r.snippet || "", heuristic_score: sourceRelevanceScore(r, inputText), is_internal: isInternalSource(link) }); if (results.length >= 30) return results; } } catch {}
      return results;
    }
    async function classifyOnlineSourcesWithAI(candidateSources, inputText) {
      if (!candidateSources.length) return []; const compactSources = candidateSources.slice(0, 25).map((s, index) => ({ index, title: String(s.title || "").slice(0, 160), snippet: String(s.snippet || "").slice(0, 300), link: String(s.link || "").slice(0, 220) }));
      const classifyPrompt = `Clasifică rezultatele online pentru afirmația: "${inputText}".
Entitatea urmărită: Modelul Coeziv 3.14 / Formula Coeziunii / 3.14ΔH / Analizor Coeziv / Exploratorul Coeziv / Sergiu Bulboacă/Bulboaca.
Relevant doar dacă vorbește despre această entitate ca model, concept, proiect sau aplicație. Nu confunda cu geotehnică, soluri, terasamente, tapiserie, materiale.
Sursele interne/proprii coeziv.vercel.app, chatgpt.com/g/... și github.com/trendyiptv-a11y/Coeziv NU sunt independente.
Returnează DOAR JSON ARRAY VALID: [{"index":number,"relevant":boolean,"source_type":"independent"|"internal"|"keyword_collision"|"irrelevant","confidence":number,"reason":"scurt"}]
Surse: ${JSON.stringify(compactSources)}`;
      try { const raw = await callOpenAIText({ model: COEZIV_SOURCE_MODEL, temperature: 0, system: "Ești un filtru semantic de surse online. Răspunde numai cu JSON array valid.", user: classifyPrompt }); const classifications = JSON.parse(extractJsonArray(raw)); return Array.isArray(classifications) ? classifications : []; } catch { return []; }
    }
    async function getIndependentOnlineSources(inputText) {
      const candidates = await collectSerperResults(inputText); if (!candidates.length) return { sources: [], note: "Nu am găsit surse externe independente suficient de relevante." };
      const classifications = await classifyOnlineSourcesWithAI(candidates, inputText); const byIndex = new Map(classifications.map((c) => [Number(c.index), c]));
      let accepted = candidates.map((s, index) => ({ ...s, classification: byIndex.get(index) })).filter((s) => { const c = s.classification; return c && c.relevant === true && c.source_type === "independent" && Number(c.confidence || 0) >= 0.55 && !s.is_internal; }).sort((a, b) => Number(b.classification?.confidence || 0) - Number(a.classification?.confidence || 0)).slice(0, 5).map((s) => ({ title: s.title, link: s.link }));
      if (!accepted.length && !classifications.length) accepted = candidates.filter((s) => s.heuristic_score > 1.5 && !s.is_internal).sort((a, b) => b.heuristic_score - a.heuristic_score).slice(0, 3).map((s) => ({ title: s.title, link: s.link }));
      return { sources: accepted, note: accepted.length ? "Sursele au fost filtrate semantic ca surse externe independente relevante." : "Nu am găsit surse externe independente suficient de relevante." };
    }
    function getPublicPresence() { const items = [{ title: "Analizor Coeziv 3.14", link: "https://coeziv.vercel.app" }, { title: "Documentație publică a Modelului Coeziv", link: "https://coeziv.vercel.app/document/index.html" }, { title: "Colecții Coezive", link: "https://coeziv.vercel.app/document/collections.html" }, { title: "Repository public Coeziv", link: "https://github.com/trendyiptv-a11y/Coeziv" }]; if (process.env.COEZIV_GPT_URL) items.unshift({ title: "Exploratorul Coeziv – GPT public", link: process.env.COEZIV_GPT_URL }); return items; }

    function classifyClaimIntent(inputText) {
      const t = normalizedText(inputText);
      const mentionsPerson = /\bsergiu\b/.test(t) || /\bbulboaca\b/.test(t);
      const mentionsProject = /(model\s+coeziv|modelul\s+coeziv|modelului\s+coeziv|formula\s+coeziunii|analizor\s+coeziv|exploratorul\s+coeziv|coeziv\s*3\.?14)/.test(t);
      const externalValidation = /(nasa|esa|validat\s+oficial|validare\s+oficiala|certificat|aprobat|recunoscut\s+oficial|universitate|institutie|instituție|guvern|minister|peer\s*review|review\s*academic|studiu\s+academic|publicat\s+stiintific|publicat\s+științific)/.test(t);
      const semanticCollision = /(soluri?|pamanturi|pământuri|geotehnic|terasament|argila|argilă).*(model\s+coeziv|coeziv\s*3\.?14)|(model\s+coeziv|coeziv\s*3\.?14).*(soluri?|pamanturi|pământuri|geotehnic|terasament|argila|argilă)/.test(t);
      const identityRelation = /(autor|autorul|creator|creatorul|initiator|initiatorul|fondator|fondatorul|dezvoltator|dezvoltatorul|a\s+creat|creat\s+de|conceput\s+de|apartine|este\s+creat)/.test(t);
      const publicPresence = /(prezent\s+online|prezenta\s+online|proiecte\s+digitale|documentatie|documentație|site|github|gpt\s+public)/.test(t);
      const interrogativeIdentity = /\?/.test(String(inputText || "")) && /(este|e|cine)/.test(t) && /(autor|autorul|creator|creatorul|initiator|fondator)/.test(t);
      const internalCohesive = mentionsProject && !externalValidation && !semanticCollision;
      if (externalValidation) return "external_validation";
      if (semanticCollision) return "semantic_collision";
      if (mentionsPerson && mentionsProject && (identityRelation || publicPresence || interrogativeIdentity)) return "identity_presence";
      if (internalCohesive) return "internal_cohesive";
      return "general_scientific";
    }
    function shouldShowPublicPresence(intent) { return intent === "identity_presence" || intent === "internal_cohesive"; }
    function guardedVerdict(baseV, F, intent, hasIndependentSources, isHumanMode = false) {
      if (intent === "external_validation" && !hasIndependentSources && F < 0.8) return "🔴 Nesusținut factual / probabil fals";
      if (intent === "semantic_collision") return "🟠 Confuzie semantică / necesită separarea termenilor";
      if (baseV >= 2.8) return isHumanMode ? "🌿 Adevăr coeziv uman puternic" : "✅ Coerență ridicată";
      if (baseV >= 2.2) return isHumanMode ? "🌱 Coerență umană bună" : "🟢 Probabil adevărat / coerent";
      if (baseV >= 1.5) return isHumanMode ? "⚖️ Echilibru parțial uman" : "🟡 Parțial adevărat / necesită clarificări";
      if (baseV >= 0.8) return isHumanMode ? "🌫️ Rezonanță umană slabă" : "🟠 Coerență slabă";
      return isHumanMode ? "⚠️ Dezechilibru ΔH" : "🔴 Probabil fals / incoerent";
    }
    function generateCohesiveExplanation(F, L, C, H, intent, isHumanMode = false, identityPresenceSupport = false, hasIndependentSources = false) {
      const parts = [];
      if (intent === "external_validation" && !hasIndependentSources) parts.push("Afirmația cere validare externă oficială. Nu au fost găsite surse externe independente sau oficiale care să confirme afirmația. Prezența publică proprie nu constituie validare oficială externă.");
      else if (intent === "semantic_collision") parts.push("Afirmația pare să amestece sensuri diferite ale termenului „coeziv”. Termenul tehnic din geotehnică trebuie separat de Modelul Coeziv 3.14 ca proiect conceptual distinct.");
      else if (identityPresenceSupport) parts.push("Nivelul factual este parțial susținut de prezența publică proprie a proiectului, dar nu de validare externă independentă.");
      else parts.push(F < 1.5 ? "Nivelul factual este slab: afirmația are puține elemente verificabile direct." : "Nivelul factual indică existența unor elemente verificabile.");
      parts.push(L < 1.5 ? "Nivelul logic necesită clarificare: legătura cauză–efect nu este complet consolidată." : "Nivelul logic este relativ coerent.");
      parts.push(C < 1.5 ? "Nivelul semantic este fragil: termenii pot avea mai multe sensuri." : "Nivelul semantic arată o direcție coerentă de interpretare.");
      if (isHumanMode) parts.push(H < 1.5 ? "Nivelul ΔH este redus: componenta umană, etică sau integratoare este slab exprimată." : "Nivelul ΔH indică o rezonanță umană prezentă.");
      return parts.join(" ");
    }
    function buildObjectiveRefinement({ intent, text, F, L, C, hasIndependentSources, publicPresenceCount, identityPresenceSupport }) {
      const hasOwnPresence = publicPresenceCount > 0;
      const t = normalizedText(text);
      const parts = [];
      if (intent === "external_validation") {
        parts.push("Știință: afirmația cere confirmare externă oficială; în lipsa unei surse independente sau instituționale, componenta factuală domină verdictul și rămâne nesusținută.");
        parts.push("Limbaj: termenii de tip «validat oficial», «NASA», «certificat» sau «recunoscut oficial» impun un standard de dovadă mai ridicat decât simpla existență publică a proiectului.");
        parts.push("Vibrație/coerență: prezența proprie poate arăta existență și continuitate, dar nu poate substitui validarea unei autorități externe.");
        if (/soluri?|pamanturi|pământuri|geotehnic|terasament/.test(t)) parts.push("Observație semantică: afirmația conține și o posibilă coliziune între termenul tehnic «coeziv» din geotehnică și Modelul Coeziv 3.14 ca proiect conceptual.");
      } else if (intent === "semantic_collision") {
        parts.push("Știință: termenii tehnici trebuie evaluați în domeniul lor propriu; geotehnica și modelul conceptual Coeziv 3.14 nu pot fi echivalate doar pentru că folosesc același cuvânt.");
        parts.push("Limbaj: nodul principal este coliziunea semantică a termenului «coeziv», care are sensuri diferite în contexte diferite.");
        parts.push("Vibrație/coerență: afirmația pierde coerență prin amestecarea planurilor, nu prin inexistența proiectului.");
      } else if (intent === "identity_presence") {
        parts.push("Știință: afirmația este susținută la nivel de existență publică proprie, nu la nivel de validare externă independentă.");
        parts.push("Limbaj: relația autor/proiect este formulată suficient de clar pentru a fi verificată prin prezența publică a proiectului.");
        parts.push("Vibrație/coerență: informația este coerentă cu continuitatea documentației, GPT-ului public, site-ului și repository-ului.");
      } else if (intent === "internal_cohesive") {
        parts.push("Știință: afirmația se referă la cadrul intern al Modelului Coeziv; verificarea ține de documentația proiectului, nu de validare externă automată.");
        parts.push("Limbaj: termenii trebuie păstrați în interiorul cadrului Coeziv pentru a evita confuzii cu sensuri tehnice din alte domenii.");
        parts.push("Vibrație/coerență: analiza urmărește dacă afirmația clarifică și ordonează modelul sau dacă amestecă niveluri diferite.");
      } else {
        parts.push(F < 1.5 ? "Știință: componenta factuală este slabă sau insuficient verificată prin date directe." : "Știință: există o bază factuală parțială sau moderată, dar rămâne necesară verificarea prin surse relevante.");
        parts.push(C < 1.5 ? "Limbaj: termenii sunt fragili sau pot produce ambiguități." : "Limbaj: formularea este relativ coerentă semantic.");
        parts.push(L < 1.5 ? "Vibrație/coerență: legătura internă a afirmației este încă instabilă." : "Vibrație/coerență: afirmația are o structură internă relativ ordonată.");
      }
      if (identityPresenceSupport && hasOwnPresence) parts.push("Limită obiectivă: prezența publică proprie susține existența/identitatea proiectului, dar nu trebuie folosită ca probă pentru certificare, autoritate externă sau validare științifică independentă.");
      if (hasIndependentSources) parts.push("Notă: sursele externe afișate au trecut filtrul semantic de relevanță, dar trebuie citite în contextul afirmației concrete.");
      return parts.join(" ");
    }
    function calcHumanResonance(txt) { const lower = String(txt || "").toLowerCase(); const positive = ["viață", "viata", "suflet", "adevăr", "adevar", "iubire", "armonie", "echilibru", "sens", "demnitate", "libertate", "conștiință", "constiinta", "responsabilitate", "claritate", "vindecare", "coerență", "coerenta", "coeziune", "energie"]; const constructive = ["cum putem", "soluție", "solutie", "îmbunătăți", "imbunatati", "înțelege", "intelege", "corecta", "echilibra", "repara", "clarifica", "construi", "dezvolta"]; const negative = ["ură", "ura", "minciună", "minciuna", "manipulare", "distrugere", "frică", "frica", "haos", "abuz", "dezbinare"]; let score = 0.5; for (const word of positive) if (lower.includes(word)) score += 0.35; for (const phrase of constructive) if (lower.includes(phrase)) score += 0.45; for (const word of negative) if (lower.includes(word)) score -= 0.25; if (lower.length > 80) score += 0.25; if (/[?]/.test(txt)) score += 0.15; return Math.max(0, Math.min(score, 3.14)); }

    const intent = classifyClaimIntent(text);
    const fullPublicPresence = getPublicPresence();
    const sourceResult = await getIndependentOnlineSources(text);
    const hasIndependentSources = sourceResult.sources.length > 0;
    const identityPresenceSupport = intent === "identity_presence" && fullPublicPresence.length > 0 && !hasIndependentSources;
    if (identityPresenceSupport) F = Math.max(F, 2.05);
    if (intent === "external_validation" && !hasIndependentSources) F = Math.min(F, 0.7);
    if (intent === "semantic_collision") { F = Math.min(F, 1.2); C = Math.min(C, 1.6); }

    const publicPresenceToShow = shouldShowPublicPresence(intent) ? fullPublicPresence : [];
    const H = humanMode ? calcHumanResonance(text) : 0;
    const Vnum = humanMode ? (F + L + C + H) / 4 : (F + L + C) / 3;
    const V = Number(Vnum.toFixed(2));
    const summary = generateCohesiveExplanation(F, L, C, H, intent, Boolean(humanMode), identityPresenceSupport, hasIndependentSources);
    const objectiveRefinement = buildObjectiveRefinement({ intent, text, F, L, C, hasIndependentSources, publicPresenceCount: fullPublicPresence.length, identityPresenceSupport });

    return res.status(200).json({
      mode: humanMode ? "ΔH" : "Δ",
      factual_score: F,
      logic_score: L,
      semantic_score: C,
      human_score: humanMode ? H : undefined,
      V,
      verdict: guardedVerdict(V, F, intent, hasIndependentSources, Boolean(humanMode)),
      summary: summary || gptJson.summary || "—",
      objective_refinement: objectiveRefinement,
      sources: sourceResult.sources,
      source_note: intent === "external_validation" ? "Nu am găsit surse externe oficiale sau independente suficient de relevante." : sourceResult.note,
      public_presence: publicPresenceToShow,
      public_presence_note: "Prezență publică proprie; descrie existența proiectului, dar nu reprezintă validare independentă.",
      claim_intent: intent,
      models: { analysis: COEZIV_ANALYSIS_MODEL, source_filter: COEZIV_SOURCE_MODEL, analysis_endpoint: usesResponsesAPI(COEZIV_ANALYSIS_MODEL) ? "responses" : "chat/completions", source_endpoint: usesResponsesAPI(COEZIV_SOURCE_MODEL) ? "responses" : "chat/completions" },
    });
  } catch (err) {
    return res.status(500).json({ error: "OpenAI request failed", status: err?.status || 500, detail: String(err?.detail || err?.message || err).slice(0, 800), model: err?.model || COEZIV_ANALYSIS_MODEL, endpoint: err?.endpoint || (usesResponsesAPI(COEZIV_ANALYSIS_MODEL) ? "responses" : "chat/completions") });
  }
}
