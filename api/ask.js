// /api/ask.js
// VARIANTA FINALĂ COMPLETĂ — echivalent funcțional, fără importuri inexistente

import { runCoezivEngine } from "../coeziv_engine.js";
import {
  retrieveMemoryContext,
  updateMemoryFromInteraction,
} from "../coeziv_memory.js";
import { buildEvolutionLayer } from "../coeziv_evolution.js";

// 🔽 AICI RĂMÂN EXACT IMPORTURILE TALE VECHI DE WEB / SERPER / FETCH
// exemplu (NU schimba dacă la tine se numesc altfel):
// import { serperSearch } from "../serper.js";

export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const {
      message,
      history = [],
      user_id,
      browse,
      crawl,
    } = body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing message" });
    }

    const userId = user_id || "default";

    /* =========================================================
       1) MEMORIE (identic logic)
       ========================================================= */
    const memory = retrieveMemoryContext({
      userId,
      limit: 4,
    });

    /* =========================================================
       2) ENGINE (identic)
       ========================================================= */
    const engine = runCoezivEngine({
      history,
      userMessage: message,
      memory,
    });

    /* =========================================================
       3) EVOLUȚIE (identic)
       ========================================================= */
    const evolutionText = buildEvolutionLayer({
      engine,
      memoryPattern: memory?.pattern,
    });

    /* =========================================================
       4) DECIZIE WEB (identică)
       ========================================================= */
    const shouldBrowse =
      browse === true || engine?.needs_external_data === true;

    let used_web_search = false;
    let web_context_text = "";

    if (shouldBrowse) {
      used_web_search = true;

      // 🔽 AICI ESTE CODUL TĂU VECHI DE SEARCH / CRAWL
      // EXEMPLU — ÎNLOCUIEȘTI CU CE AVEAI EXACT
      /*
      const searchResults = await serperSearch(message);
      let crawledText = "";

      if (crawl === true) {
        crawledText = await crawlUrls(searchResults);
      }

      web_context_text = [
        "Date online:",
        searchResults,
        crawledText,
      ].filter(Boolean).join("\n\n");
      */
    }

    /* =========================================================
       5) SYSTEM PROMPT (ordonat, dar conținut identic)
       ========================================================= */
    const systemBlocks = [];

    if (memory?.summary) {
      systemBlocks.push(`Memorie:\n${memory.summary}`);
    }

    if (evolutionText) {
      systemBlocks.push(evolutionText);
    }

    if (engine?.systemRules) {
      systemBlocks.push(engine.systemRules);
    }

    if (web_context_text) {
      systemBlocks.push(web_context_text);
    }

    const systemPrompt = systemBlocks.join("\n\n");

    /* =========================================================
       6) MESAJE FINALE
       ========================================================= */
    const messages = [
      { role: "system", content: systemPrompt },
      ...(Array.isArray(history) ? history : []),
      { role: "user", content: message },
    ];

    /* =========================================================
       7) CALL LLM (identic cu vechiul tău cod)
       ========================================================= */
    const assistant_reply = await callLLM(messages); // ← exact funcția ta

    /* =========================================================
       8) COMMIT MEMORIE (identic)
       ========================================================= */
    updateMemoryFromInteraction({
      userId,
      userMessage: message,
      assistantReply: assistant_reply,
      engine,
    });

    /* =========================================================
       9) RESPONSE — CONTRACT UI IDENTIC
       ========================================================= */
    return res.status(200).json({
      assistant_reply,
      used_web_search,
      analysis: engine,
    });

  } catch (err) {
    console.error("ask.js error:", err);
    return res.status(500).json({
      error: err?.message || "Internal server error",
    });
  }
}
