// api/ask.js
// Asistent Coeziv 3.14 – CoezivEngine + RAG Coeziv + Memorie + Browsing (Serper) + Strat evolutiv
// Browsing: la cerere (UI flag sau comandă în text). NU mai „se preface” că a căutat.

import OpenAI from "openai";
import { retrieveCohezivContext } from "../coeziv_knowledge.js";
import { runCoezivEngine, buildCohezivSearchQuery } from "../coeziv_engine.js";
import { updateMemoryFromInteraction, retrieveMemoryContext } from "../coeziv_memory.js";
import { buildEvolutionLayer } from "../coeziv_evolution.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
      body: JSON.stringify({ q: query, num: 6 }),
    });

    const raw = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        text: "",
        reason: `Serper HTTP ${response.status}: ${raw.slice(0, 200)}`,
      };
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, text: "", reason: "Serper returned non-JSON" };
    }

    const results = [];
    if (Array.isArray(data.news)) {
      data.news.slice(0, 3).forEach((item) => {
        results.push(`• [ȘTIRE] ${item.title} — ${item.snippet || ""} (${item.link})`);
      });
    }
    if (Array.isArray(data.organic)) {
      data.organic.slice(0, 3).forEach((item) => {
        results.push(`• ${item.title} — ${item.snippet || ""} (${item.link})`);
      });
    }

    if (!results.length) return { ok: false, text: "", reason: "No Serper results" };

    return {
      ok: true,
      text: "Rezultate sintetizate din internet (Serper):\n" + results.join("\n"),
      reason: "",
    };
  } catch (err) {
    return { ok: false, text: "", reason: err?.message || String(err) };
  }
}

/* -------------------------------------------------------------------------- */
/*                           Raw crawling (HTML fetch)                        */
/* -------------------------------------------------------------------------- */

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
 * Crawl minimal:
 * - dacă primește URL (http/https) -> fetch direct
 * - altfel -> folosește DuckDuckGo HTML ca punct de intrare
 */
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

    // limită de volum pentru cost/latency + prompt safety
    const clipped = text.slice(0, 20000);

    return {
      ok: true,
      text: "Rezultate brute din crawling web:\n" + clipped,
      reason: "",
    };
  } catch (err) {
    return { ok: false, text: "", reason: err?.message || String(err) };
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Handler                                  */
/* -------------------------------------------------------------------------- */

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ error: "Use POST" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const userMessage = body.message || "";
    const history = Array.isArray(body.history) ? body.history : [];
    const userId = body.userId || "default";

    if (!userMessage.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    /* ------------------------------ CoezivEngine ------------------------------ */

    const engine = runCoezivEngine({ history, userMessage });

    if (engine.policy.action === "clarify_first") {
      return res.status(200).json({
        assistant_reply:
          "Întrebarea ta combină mai multe lucruri sau nu este suficient de clară. Reformulează, te rog, într-o singură propoziție clară.",
        analysis: engine,
        policy_output: engine.policy,
        used_web_search: false,
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

    /* ------------------------------ Memorie Coezivă ------------------------------ */

    let memoryContextText = "";
    let memorySummary = "";
    let memorySnippets = [];

    try {
      const memCtx = retrieveMemoryContext({ userId, query: userMessage });
      if (memCtx) {
        memorySummary = memCtx.summary || "";
        memorySnippets = Array.isArray(memCtx.snippets) ? memCtx.snippets : [];

        const parts = [];
        if (memorySummary.trim()) parts.push(memorySummary.trim());

        if (memorySnippets.length) {
          const snippetLines = memorySnippets
            .slice(0, 4)
            .map((s) => `- [sim ≈ ${Number(s.score || 0).toFixed(2)}] ${s.text}`)
            .join("\n");
          parts.push("Fragmente similare din conversații anterioare:\n" + snippetLines);
        }

        memoryContextText = parts.join("\n\n").trim();
      }
    } catch (e) {
      console.warn("Eroare retrieveMemoryContext:", e);
    }

    /* ------------------------------ Strat evolutiv ------------------------------ */

    const evolution = buildEvolutionLayer({
      engine,
      memoryPattern: null,
    });

    /* ------------------------------ Browsing: la cerere ------------------------------ */

    const lower = userMessage.toLowerCase();

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

    // detectare explicită de „citește documentul / extrage text integral”
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
    const forceCrawlRaw = body.crawl === true; // flag explicit din UI/payload

    // browsing dacă UI îl cere sau user îl cere explicit în text sau engine semnalizează
    const shouldBrowse = forceBrowseByUI || userWantsBrowseByText || engine.needs_external_data || wantsDocumentRead || forceCrawlRaw;

    let webContext = "";
    let used_web_search = false;
    let web_reason = "not requested";
    let web_mode = "none"; // "serper" | "crawl_raw" | "none"

    if (shouldBrowse) {
      let q = buildCohezivSearchQuery(userMessage, history);
      if (!q || !q.trim()) q = userMessage;

      // 🔴 document explicit -> crawl direct (nu doar search)
      if (wantsDocumentRead || forceCrawlRaw) {
        const crawl = await crawlWebRaw(q);
        if (crawl.ok && crawl.text) {
          webContext = crawl.text;
          used_web_search = true;
          web_mode = "crawl_raw";
          web_reason = "explicit_document_request";
        } else {
          used_web_search = false;
          web_mode = "none";
          web_reason = crawl.reason || "crawl_failed";
        }
      } else {
        // 🔵 caz normal -> Serper
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

- Ai voie să spui că „ai citit documentul” DOAR dacă textul documentului apare efectiv
  într-una dintre secțiunile de context extern din SYSTEM.
- Dacă există context extern, îl tratezi ca sursă orientativă și îl integrezi critic,
  fără a presupune exhaustivitate sau acuratețe absolută.
- Dacă utilizatorul cere transformări (HTML, PDF, printare),
  lucrezi STRICT pe textul prezent în SYSTEM.

────────────────────────────────────────────────────────────
MODELUL COEZIV
────────────────────────────────────────────────────────────

- Coeziv 3.14 este un model conceptual (non-fizic).
- Separare strictă a domeniilor: nu amesteci explicații juridice, tehnice, politice etc.
- Respecți regimul Coeziv curent (ordered / mixed / tensed).
- Urmezi policy-ul logic indicat (clarify, trim_context, normal_answer).

────────────────────────────────────────────────────────────
MODELUL 2π (CÂND ESTE UTIL)
────────────────────────────────────────────────────────────

Structură → Flux → Reorganizare → Noua Structură

Explici explicit în acest cadru DOAR dacă ajută claritatea răspunsului.

────────────────────────────────────────────────────────────
REGULI DE COMPORTAMENT
────────────────────────────────────────────────────────────

- Nu halucinezi surse, texte sau citate.
- Nu inventezi conținut din linkuri.
- Dacă există context extern, îl menționezi explicit.
- Dacă nu există, rămâi strict în cunoașterea internă.

Răspunsurile trebuie să fie clare, oneste, structurate și proporționale cu cererea utilizatorului.
`;

    let systemContent = baseSystem;

    if (evolution?.textBlock) {
      systemContent += `\n\nStrat de autoreglare evolutivă – parametri curenți:\n${evolution.textBlock}`;
    }

    systemContent += `\n\nContext Coeziv intern:\n${
      coezivContext ||
      "(nu a fost găsit context Coeziv specific; răspunde prudent, doar cu informații generale sigure)"
    }`;

    if (memoryContextText) {
      systemContent += `\n\nContext de memorie Coezivă:\n${memoryContextText}`;
    }

    // Semnal clar de browsing (sau lipsa lui)
    systemContent += `\n\nStare flux extern (browsing) la acest mesaj:\n- requested: ${shouldBrowse ? "DA" : "NU"}\n- executed: ${used_web_search ? "DA" : "NU"}\n- mode: ${web_mode}\n- reason: ${web_reason}\n`;

    // Injectare context extern – în secțiunea corectă, în funcție de web_mode
    if (used_web_search && webContext) {
      if (web_mode === "serper") {
        systemContent += `\n\n---\n\nContext suplimentar din căutarea pe internet (Serper):\n${webContext}\n\nInstrucțiune: integrează aceste informații și menționează că sunt orientative; citează linkurile din paranteze când sunt relevante.`;
      } else if (web_mode === "crawl_raw") {
        systemContent += `\n\n---\n\nRezultate brute din crawling web:\n${webContext.replace(/^Rezultate brute din crawling web:\n/, "")}\n\nInstrucțiune: tratează textul ca extras automat; poate conține zgomot. Extrage doar pasajele relevante și citează prudent când afirm garantat.`;
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

    /* ------------------------------ Save memory ------------------------------ */

    try {
      updateMemoryFromInteraction({
        userId,
        userMessage,
        assistantReply: reply,
        engine,
      });
    } catch (e) {
      console.warn("Eroare updateMemoryFromInteraction:", e);
    }

    return res.status(200).json({
      assistant_reply: reply,
      analysis: engine,
      policy_output: engine.policy,
      used_web_search,
      web_reason,
      web_mode,
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
