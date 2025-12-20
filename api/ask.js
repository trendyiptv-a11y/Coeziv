// api/ask.js
// Asistent Coeziv 3.14 – CoezivEngine + RAG Coeziv + Memorie + Browsing (Serper) + Crawling + Strat evolutiv
// Browsing/Crawling: la cerere (UI flags sau comandă în text). Nu pretinde acces extern fără context injectat.

import OpenAI from "openai";
import { retrieveCohezivContext } from "../coeziv_knowledge.js";
import { runCoezivEngine } from "../coeziv_engine.js";
import * as CoezivOrchestrator from "../coeziv_orchestrator.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* -------------------------------------------------------------------------- */
/*                                 Helpers                                    */
/* -------------------------------------------------------------------------- */

function safeJsonParse(maybeString) {
  try {
    return typeof maybeString === "string" ? JSON.parse(maybeString) : maybeString;
  } catch {
    return null;
  }
}

function extractFirstUrl(text) {
  const m = (text || "").match(/https?:\/\/[^\s)]+/i);
  return m ? m[0] : null;
}

function extractUrlsFromText(text) {
  const matches = (text || "").match(/https?:\/\/[^\s)]+/gi) || [];
  const uniq = [];
  for (const u of matches) {
    const clean = (u || "").trim();
    if (!clean) continue;
    if (!uniq.includes(clean)) uniq.push(clean);
  }
  return uniq;
}

function stripHtmlToText(html) {
  return (html || "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Local fallback – ca să nu depindem de exporturi care pot lipsi din coeziv_engine.js
 * Scop: un query "bun" pentru Serper, dar simplu și robust.
 */
function buildCohezivSearchQuery(userMessage, history) {
  const hm = Array.isArray(history) ? history : [];
  const lastUsers = hm
    .filter((m) => m?.role === "user" && typeof m.content === "string")
    .slice(-2)
    .map((m) => m.content.trim())
    .filter(Boolean);

  const base = (userMessage || "").trim();
  const combo = [base, ...lastUsers].filter(Boolean).join(" | ");
  return combo.slice(0, 380);
}

/* -------------------------------------------------------------------------- */
/*                               Serper websearch                             */
/* -------------------------------------------------------------------------- */

async function webSearchSerper(query, { gl = "ro", hl = "ro", num = 5 } = {}) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return { ok: false, text: "", reason: "SERPER_API_KEY missing" };

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        gl,
        hl,
        num,
      }),
    });

    if (!response.ok) return { ok: false, text: "", reason: `Serper HTTP ${response.status}` };

    const data = await response.json();

    const items = []
      .concat(Array.isArray(data?.organic) ? data.organic : [])
      .slice(0, num)
      .map((r, idx) => {
        const title = r?.title || `Rezultat ${idx + 1}`;
        const link = r?.link || "";
        const snippet = r?.snippet || "";
        return `#${idx + 1} ${title}\n${snippet}\n(${link})`;
      })
      .join("\n\n");

    if (!items.trim()) return { ok: false, text: "", reason: "No Serper results" };

    return { ok: true, text: items, reason: "" };
  } catch (err) {
    return { ok: false, text: "", reason: err?.message || String(err) };
  }
}

/* -------------------------------------------------------------------------- */
/*                               Crawl raw web                                */
/* -------------------------------------------------------------------------- */

async function crawlWebRaw(urlOrQuery) {
  try {
    const input = (urlOrQuery || "").trim();
    if (!input) return { ok: false, text: "", reason: "empty input" };

    const url = /^https?:\/\//i.test(input)
      ? input
      : `https://duckduckgo.com/html/?q=${encodeURIComponent(input)}`;

    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "CoezivBot/1.0" },
    });

    if (!res.ok) return { ok: false, text: "", reason: `HTTP ${res.status}` };

    const html = await res.text();
    const text = stripHtmlToText(html);

    if (!text) return { ok: false, text: "", reason: "empty crawl text" };

    const clipped = text.slice(0, 20000);
    return { ok: true, text: clipped, reason: "" };
  } catch (err) {
    return { ok: false, text: "", reason: err?.message || String(err) };
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Handler                                   */
/* -------------------------------------------------------------------------- */

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ error: "Use POST" });
    }

    const body = safeJsonParse(req.body) || {};
    const userMessage = body.message || "";
    const history = Array.isArray(body.history) ? body.history : [];
    const userId = body.userId || "default";

    if (!userMessage.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    /* ------------------------------ Orchestrator (CoEZiv) ------------------------------ */

    const buildSystemContext =
      CoezivOrchestrator?.buildSystemContext ||
      CoezivOrchestrator?.default?.buildSystemContext;

    const commitInteraction =
      CoezivOrchestrator?.commitInteraction ||
      CoezivOrchestrator?.default?.commitInteraction;

    // Orchestratorul decide și agregă: engine + memorie + evoluție + reguli interne.
    // Dacă, din orice motiv, orchestratorul nu este disponibil, păstrăm fallback-ul stabil.
    const ctx = buildSystemContext
      ? buildSystemContext({
          userId,
          history,
          userMessage,
          options: {
            maxMemoryItems: 4,
            forceWeb: body.browse === true,
            forceCrawl: body.crawl === true,
          },
        })
      : null;

    const engine = ctx?.engine || runCoezivEngine({ history, userMessage });

    if (engine.policy.action === "clarify_first") {
      return res.status(200).json({
        assistant_reply:
          "Întrebarea ta combină mai multe lucruri sau nu este suficient de clară. Reformulează, te rog, într-o singură propoziție clară.",
        analysis: engine,
        policy_output: engine.policy,
        used_web_search: false,
        web_mode: "none",
        web_reason: "policy_clarify_first",
      });
    }

    if (engine.policy.action === "trim_context_and_clarify") {
      return res.status(200).json({
        assistant_reply:
          "Contextul este foarte mare și amestecat. Spune-mi, te rog, care este întrebarea ta principală acum, într-o frază.",
        analysis: engine,
        policy_output: engine.policy,
        used_web_search: false,
        web_mode: "none",
        web_reason: "policy_trim_context_and_clarify",
      });
    }

    const identityTrace = {
      regime: engine?.j_state?.regime || "ordered",
      j_value: typeof engine?.j_state?.J === "number" ? engine.j_state.J : null,
      dominant_domains: engine?.policy?.dominant || [],
      policy_action: engine?.policy?.action || "normal_answer",
      needs_external_data: !!engine?.needs_external_data,
    };

    /* ------------------------------ RAG Coeziv ------------------------------ */

    const dominantDomains = engine.policy.dominant || [];
    const domainHint = dominantDomains[0] || null;
    const coezivContext = retrieveCohezivContext(userMessage, domainHint);

    // Text agregat de orchestrator (memorie + evoluție + reguli engine).
    const orchestratorSystemText = (ctx?.systemText || "").trim();

    /* ------------------------------ Browsing/Crawling: la cerere ------------------------------ */

    const lower = userMessage.toLowerCase();

    const isMeta = engine?.intent?.type === "meta";
    const isMetaAboutBrowsing =
      isMeta && /document|documente|link|internet|citi|citești|citesti|crawl|brows/i.test(lower);

    const userWantsBrowseByText =
      lower.includes("cauta pe internet") ||
      lower.includes("caută pe internet") ||
      lower.includes("verifica pe internet") ||
      lower.includes("verifică pe internet") ||
      lower.includes("cauta online") ||
      lower.includes("caută online") ||
      lower.includes("in timp real") ||
      lower.includes("în timp real") ||
      lower.includes("check online") ||
      lower.includes("search online");

    const forceNewsByUI = body.news === true || body.mode === "news";
    const isNewsRequest =
      forceNewsByUI ||
      /\b(știri|stiri|news|breaking|headlines?|daily\s+brief|brief|rezumat\s+de\s+știri|rezumat\s+stiri|rezumat\s+știri)\b/i.test(lower);

    const wantsDocumentRead =
      lower.includes("citește documentul") ||
      lower.includes("citeste documentul") ||
      lower.includes("extrage textul") ||
      lower.includes("extrage conținutul") ||
      lower.includes("extrage continutul") ||
      lower.includes("textul ordonan") ||
      lower.includes("transforma in html") ||
      lower.includes("transformă în html") ||
      lower.includes("html printabil") ||
      lower.includes("printabil");

    const forceBrowseByUI = body.browse === true;
    const forceCrawlRaw = body.crawl === true;

    const shouldBrowse =
      forceBrowseByUI ||
      forceCrawlRaw ||
      wantsDocumentRead ||
      userWantsBrowseByText ||
      isNewsRequest ||
      (!isMeta && engine.needs_external_data);

    let webContext = "";
    let used_web_search = false;
    let web_reason = "not requested";
    let web_mode = "none"; // "serper" | "crawl_raw" | "none"

    if (shouldBrowse) {
      const urlInMessage = extractFirstUrl(userMessage);

      let q = buildCohezivSearchQuery(userMessage, history);
      if (!q || !q.trim()) q = userMessage;

      if (wantsDocumentRead || forceCrawlRaw) {
        const crawlTarget = urlInMessage || q;
        const crawl = await crawlWebRaw(crawlTarget);

        if (crawl.ok && crawl.text) {
          webContext = crawl.text;
          used_web_search = true;
          web_mode = "crawl_raw";
          web_reason = urlInMessage ? "explicit_document_url_crawl" : "explicit_document_request";
        } else {
          used_web_search = false;
          web_mode = "none";
          web_reason = crawl.reason || "crawl_failed";
        }
      } else {
        // For news, widen to EN/RO by using gl/hl from body (default ro). You can pass {hl:"en"} from UI if needed.
        const serper = await webSearchSerper(q, {
          gl: body.gl || "ro",
          hl: body.hl || "ro",
          num: typeof body.num === "number" ? Math.max(1, Math.min(10, body.num)) : 6,
        });

        if (serper.ok && serper.text) {
          webContext = serper.text;
          used_web_search = true;
          web_mode = "serper";
          web_reason = "ok";
        } else {
          used_web_search = false;
          web_mode = "none";
          web_reason = serper.reason || "no results";
        }
      }
    }

    // URL allowlist (anti-hallucination): the assistant may only cite URLs that appear in injected webContext.
    const allowedUrls = used_web_search ? extractUrlsFromText(webContext).slice(0, 30) : [];

    // Strict news safety: if user asks for news but we have no injected web context, return a deterministic template.
    // This prevents fabricated headlines/sources when SERPER_API_KEY is missing or browsing failed.
    if (isNewsRequest && !used_web_search) {
      const why = web_reason && web_reason !== "not requested" ? web_reason : "no_web_context_in_message";
      return res.status(200).json({
        assistant_reply:
          "În acest mesaj nu a fost injectat context extern (Serper/crawling), deci nu pot furniza un daily brief cu SURSE verificabile.\n\n" +
          "[HEADLINES]\n– (lipsă: nu există rezultate web în acest mesaj)\n\n" +
          "[DETALII]\n– (lipsă)\n\n" +
          "[CE URMĂRIM]\n– (lipsă)\n\n" +
          "Pentru a primi știri cu linkuri, activează browsing (UI: browse/news) și asigură SERPER_API_KEY, sau trimite aici linkurile/articolele pe care vrei să le sintetizez.",
        analysis: engine,
        policy_output: engine.policy,
        used_web_search: false,
        web_mode: "none",
        web_reason: `news_guard:${why}`,
      });
    }

    /* ------------------------------ SYSTEM prompt ------------------------------ */

    const baseSystem = `
Identitate emergentă:
Identitatea ta rezultă exclusiv din ceea ce faci efectiv în acest mesaj: aplici Modelul Coeziv,
folosești context Coeziv intern (knowledge), memorie Coezivă și, uneori, flux extern (browsing sau crawling),
doar dacă acestea sunt explicit prezente mai jos în SYSTEM.

────────────────────────────────────────────────────────────
REGULI DE ADEVĂR DESPRE ACCESUL LA INTERNET (OBLIGATORIU)
────────────────────────────────────────────────────────────

1) Ai voie să spui că ai folosit internetul DOAR dacă vezi în SYSTEM una dintre secțiunile:
   - „Context suplimentar din căutarea pe internet (Serper)”
   - „Rezultate brute din crawling web”

2) Dacă NU vezi niciuna dintre aceste secțiuni:
   - spui explicit:
     „Pentru acest răspuns folosesc cunoașterea internă și contextul Coeziv disponibil.”
   - NU pretinzi că ai citit linkuri, documente sau pagini externe.

3) NU folosi formulări de tip:
   - „nu pot căuta pe internet”
   - „nu am acces la internet”
   - „sunt limitat până în anul X”

4) Dacă utilizatorul cere informații „în timp real”, „din link” sau „actuale”,
   iar în SYSTEM nu există context extern,
   explici calm că răspunsul NU include flux extern la acest mesaj.

────────────────────────────────────────────────────────────
REGULI DESPRE DOCUMENTE ȘI LINKURI
────────────────────────────────────────────────────────────

- Dacă utilizatorul cere să citești un link sau document,
  iar în SYSTEM nu există crawling/webContext,
  spui: „În acest răspuns nu am textul documentului. Trimite conținutul aici sau activează crawling.”

- Când ai context extern injectat, îl tratezi ca text posibil zgomotos:
  extragi doar părțile relevante, semnalezi incertitudini, nu inventezi detalii.

────────────────────────────────────────────────────────────
DISCIPLINĂ COEZIVĂ
────────────────────────────────────────────────────────────
- Separă strict domeniile: fizic vs. biologic vs. tehnic vs. metaforic.
- Nu folosi numeric 3.14 în domenii non-termice; doar analogic, marcat.
- Nu transforma metafore în afirmații științifice.
- Când creezi concepte noi: marchează-le ca „model conceptual”.
`;

    const newsSystemPrompt = `
Ești un agent de știri specializat (News Analyst), nu un comentator și nu un rezumator generic.

Rolul tău:
- să colectezi, să verifici și să sintetizezi știri recente (ultimele 24–72h),
- să separi strict faptele de interpretări,
- să semnalezi contradicții, incertitudini și limitele concluziilor.

────────────────────────────────────────────────────────
REGULI DE ACCES LA INFORMAȚII
────────────────────────────────────────────────────────

1) Folosești informații externe (web / crawl) DOAR dacă acestea sunt prezente explicit în SYSTEM
   sub secțiuni de tip:
   - „Context suplimentar din căutarea pe internet (Serper)”
   - „Rezultate brute din crawling web”

2) Dacă NU există astfel de secțiuni, atunci:
   - NU inventezi titluri, cifre, evenimente sau surse;
   - livrezi doar un mesaj scurt că în acest mesaj nu există context web injectat.

3) SURSE:
   - În secțiunea [DETALII] la „SURSE”, ai voie să incluzi DOAR URL-uri care apar în „URL allowlist”.
   - Dacă „URL allowlist” este gol, scrii: SURSE: (none provided in this message).

────────────────────────────────────────────────────────
REGULI EDITORIALE (FOARTE STRICTE)
────────────────────────────────────────────────────────

- Nu inventa fapte.
- Nu extrapola dincolo de ce spun sursele.
- Nu amesteca știri diferite într-o singură narațiune.
- Dacă două surse se contrazic, marchezi explicit: CONTRADICȚII.
- Dacă o informație este incompletă, marchezi: INCERT.
- Nu atribui citate sau afirmații unor publicații dacă nu apar în contextul injectat.

────────────────────────────────────────────────────────
FORMAT OBLIGATORIU DE RĂSPUNS
────────────────────────────────────────────────────────

Respectă exact această structură:

[HEADLINES]
– listă scurtă de titluri (1 linie fiecare)

[DETALII]
Pentru fiecare știre:
- FAPT: ce afirmă sursele, concis
- IMPACT: de ce contează (economic / politic / tehnic)
- INCERT / CONTRADICȚII: dacă există
- SURSE: linkuri (minim 1, din allowlist)

[CE URMĂRIM]
– max. 5 puncte (evenimente, decizii, riscuri viitoare)

────────────────────────────────────────────────────────
LIMBA
────────────────────────────────────────────────────────

- EN / RO mixt:
  - Titlul în limba dominantă a sursei.
  - Explicația poate alterna EN/RO, dar rămâne clară și scurtă.
- Nu traduce forțat. Claritatea are prioritate.

────────────────────────────────────────────────────────
PRIORITĂȚI DE SELECȚIE
────────────────────────────────────────────────────────

1) Geopolitică / securitate
2) Macro-economie / piețe
3) AI / tech policy / securitate cibernetică
4) Energie / infrastructură
5) România (doar impact real, nu zgomot politic)
6) Știință (doar confirmată)

Dacă semnalul este slab:
- livrezi mai puține știri,
- NU umpli spațiul cu conținut irelevant.

────────────────────────────────────────────────────────
COMPORTAMENT
────────────────────────────────────────────────────────

- Nu scrii eseuri.
- Nu explici lanțul tău intern de raționament.
- Livrezi informație scurtă, verificabilă și proporțională cu cererea.
`;

    let systemContent = baseSystem;

    if (isNewsRequest) {
      systemContent += `\n\n${newsSystemPrompt}`;
    }

    // Model/Knowledge
    systemContent += `\n---\nContext Coeziv (knowledge):\n${coezivContext || "(none)"}\n`;

    // Context Orchestrator (memorie + evoluție + reguli)
    if (orchestratorSystemText) {
      systemContent += `\n---\nContext Orchestrator (memorie + evoluție + reguli):\n${orchestratorSystemText}\n`;
    }

    // Meta: dacă e meta despre browsing, forțăm clarificarea adevărului
    if (isMetaAboutBrowsing) {
      systemContent += `\n---\nNotă: utilizatorul întreabă meta despre browsing/crawling. Respectă regulile de adevăr și arată exact dacă există sau nu context web injectat.\n`;
    }

    // Injectare context extern în secțiunea acceptată de reguli
    if (used_web_search && webContext) {
      if (web_mode === "serper") {
        systemContent += `\n\n---\n\nContext suplimentar din căutarea pe internet (Serper):\n${webContext}\n\nInstrucțiune: integrează aceste informații și menționează că sunt orientative; citează linkurile din paranteze când sunt relevante.`;
      } else if (web_mode === "crawl_raw") {
        systemContent += `\n\n---\n\nRezultate brute din crawling web:\n${webContext}\n\nInstrucțiune: text extras automat; poate conține zgomot. Extrage doar pasajele relevante și menționează dacă anumite porțiuni sunt neclare sau incomplete.`;
      }
    }

    // URL allowlist is always included for news mode to prevent fabricated citations.
    if (isNewsRequest) {
      systemContent += `\n\n---\nURL allowlist (use ONLY these URLs in SURSE):\n${allowedUrls.length ? allowedUrls.join("\n") : "(empty)"}\n`;
    }

    systemContent += `
\n---\nMeta-trace Coeziv:
- Regim: ${identityTrace.regime}
- J: ${identityTrace.j_value !== null ? identityTrace.j_value.toFixed(2) : "nedefinit"}
- Domenii dominante: ${identityTrace.dominant_domains.length ? identityTrace.dominant_domains.join(", ") : "nedefinite clar"}
- Policy: ${identityTrace.policy_action}
`;

    /* ------------------------------ messages ------------------------------ */

    const messages = [{ role: "system", content: systemContent }];
    for (const m of history) {
      if (m?.role && m?.content) messages.push(m);
    }
    messages.push({ role: "user", content: userMessage });

    /* ------------------------------ OpenAI call ------------------------------ */

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const reply = completion.choices?.[0]?.message?.content || "";

    /* ------------------------------ Save memory (via orchestrator) ------------------------------ */

    try {
      if (commitInteraction) {
        commitInteraction({
          userId,
          userMessage,
          assistantReply: reply,
          engine,
        });
      }
    } catch (e) {
      console.warn("Eroare commitInteraction (orchestrator):", e);
    }

    return res.status(200).json({
      assistant_reply: reply,
      analysis: engine,
      policy_output: engine.policy,
      used_web_search,
      web_mode,
      web_reason,
    });
  } catch (error) {
    console.error("Eroare în /api/ask:", error);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message:
        "A apărut o eroare internă în Asistentul Coeziv. Poți încerca din nou sau poți reformula întrebarea.",
      details: error?.message || String(error),
    });
  }
}
