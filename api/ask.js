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

async function webSearchSerper(query) {
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
        gl: "ro",
        hl: "ro",
        num: 5,
      }),
    });

    if (!response.ok) return { ok: false, text: "", reason: `Serper HTTP ${response.status}` };

    const data = await response.json();

    const items = []
      .concat(Array.isArray(data?.organic) ? data.organic : [])
      .slice(0, 5)
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
        const serper = await webSearchSerper(q);

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

    let systemContent = baseSystem;

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
