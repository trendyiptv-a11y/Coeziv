// coeziv_engine.js
// CoezivEngine – motor cognitiv pentru Asistentul Coeziv 3.14
// Nu face apeluri la OpenAI sau internet. Doar analizează mesaje + istoric.
// ---------------------------------------------------------------

// Funcție de crawling simplificată
async function crawlUrl(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const html = await response.text();
        // Aici ai putea folosi un parser HTML pentru a extrage informații relevante
        console.log(html); // doar un exemplu de a arăta rezultatul
        return html; // întoarce HTML-ul sau datele extrase
    } catch (error) {
        console.error('Crawling error:', error);
        return null; // întoarce null în caz de eroare
    }
}

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

// Restul codului rămâne neschimbat...
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
        const reversed = [...(history || [])].reverse();
        const lastUserMsg = reversed.find(
            (m) => m.role === "user" && (m.content || "").trim()
        );

        if (lastUserMsg) {
            let hq = lastUserMsg.content.toLowerCase();

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

    if (!q) q = userMessage.trim();
    return q;
}

// ---------------------------------------------------------------
// CoezivEngine – punctul principal de intrare
// ---------------------------------------------------------------

// history: [{ role: "user" | "assistant" | "system", content: string }, ...]
// userMessage: string
export async function runCoezivEngine({ history, userMessage }) {
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
    const flags = detectFFlags(lastText, contextDepth_local, conflictScore_local, domains_local);
    const j_state = computeJ(contextDepth_local, conflictScore_local, flags);

    // NOUA STRUCTURĂ – policy Coeziv
    const policy = decidePolicy(j_state, flags, domains_local);

    // Inferență de intenție
    const intent = inferIntent(userMessage, history);

    // Hint pentru browsing
    const dynamicDomains = ["economie", "tehnic", "ai_advanced", "social", "politic", "ecologie"];
    const hasDynamicDomain = Object.entries(domains_local || {})
        .some(([d, v]) => v > 0.25 && dynamicDomains.includes(d));

    const needs_external_data = intent.wants_internet || hasDynamicDomain;

    // --- Identitate emergentă: trasă din comportament, nu impusă ---
    const identity_trace = {
        regime: j_state.regime,
        j_value: j_state.J,
        dominant_domains: policy?.dominant || [],
        policy_action: policy?.action || "normal_answer",
        needs_external_data,
    };

    // Dacă are nevoie de date externe, efectuează crawling
    if (needs_external_data) {
        const query = buildCohezivSearchQuery(userMessage, history);
        const crawledData = await crawlUrl(query); // apelează funcția de crawling
        // procesează datele obținute de la crawling, de exemplu:
        // poate folosi hasilții pentru a genera un răspuns
    }

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
        needs_external_data,
        identity_trace,
    };
}
