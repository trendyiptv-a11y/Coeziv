import fs from "fs";
import path from "path";

// --- 📁 Persistență -------------------------------------------------------
const memoryFile = path.resolve("netlify/functions/memory.json");

function loadMemory() {
  try {
    const data = fs.readFileSync(memoryFile, "utf-8");
    return JSON.parse(data);
  } catch {
    return { terms: {}, learned: 0, history: [] };
  }
}

function saveMemory(memory) {
  try {
    fs.writeFileSync(memoryFile, JSON.stringify(memory, null, 2), "utf-8");
  } catch (e) {
    console.error("Eroare la salvarea memoriei:", e);
  }
}

// încărcăm sau inițializăm memoria
let semanticMemory = loadMemory();

// --- 🧠 Formula Coeziunii 3.14 + D + L∞ -----------------------------------
export async function handler(event) {
  try {
    const { text } = JSON.parse(event.body || "{}");
    if (!text) {
      return { statusCode: 400, body: JSON.stringify({ error: "Lipsește textul de analizat." }) };
    }

    let Ci = 0, Ce = 0, Q = 0, S = 0, L = 0; // parametri logici
    const words = text.toLowerCase().split(/\W+/).filter(Boolean);

    // 1️⃣ Coeziune internă (claritate logică, structură)
    const avgLen = words.length / (text.split(/[.!?]/).filter(Boolean).length || 1);
    if (avgLen >= 8 && avgLen <= 28) Ci += 0.08; else Ci -= 0.06;
    if ((text.match(/!{2,}|\?{2,}/g) || []).length > 0) Ci -= 0.06; else Ci += 0.04;

    // 2️⃣ Coeziune externă (surse)
    const urls = text.match(/https?:\/\/[^\s]+/g) || [];
    const official = urls.filter(u => u.match(/\.(gov|edu|un\.org|who\.int|bnr\.ro|europa\.eu)/));
    const social = urls.filter(u => u.match(/(facebook|x\.com|twitter|tiktok|youtube)/));
    if (official.length > 0) Ce += 0.14;
    if (social.length > 0 && official.length === 0) Ce -= 0.15;
    if (urls.length === 0) Ce -= 0.10;

    // 3️⃣ Factor întrebări
    if (text.includes("?")) Q = 0.05;
    if (text.match(/nu\s+vi\s+se\s+pare|de\s+ce\s+nu|adevărul\s+e\s+că/i)) Q = -0.10;

    // 4️⃣ Coerență semantică
    const manipulative = /(șocant|panică|trădare|dictatură|fabricat|adevărul\s+ascuns)/i.test(text);
    const technical = /(legea|monitorul|oficial|statistic|art\.|document)/i.test(text);
    if (manipulative) S -= 0.20;
    if (technical && !manipulative) S += 0.10;

    // --- 5️⃣ Dicționar semantic adaptiv -----------------------------------
    if (!semanticMemory.terms || Object.keys(semanticMemory.terms).length === 0) {
      semanticMemory.terms = {
        "soarele": "pozitiv",
        "luna": "neutru",
        "întunericul": "negativ",
        "lumina": "pozitiv",
        "apa": "pozitiv",
        "uscată": "negativ",
        "adevărul": "pozitiv",
        "minciuna": "negativ",
        "viață": "pozitiv",
        "moarte": "negativ"
      };
    }

    function semanticConflictScore(text) {
      const w = text.toLowerCase().split(/\W+/);
      let polaritySum = 0, conflicts = 0;

      for (let x of w) {
        if (semanticMemory.terms[x]) {
          const p = semanticMemory.terms[x];
          polaritySum += p === "pozitiv" ? 1 : p === "negativ" ? -1 : 0;
        }
      }

      if (polaritySum > 0 && text.match(/\bnu\s+|fals|contrar|opus/i)) conflicts++;
      if (polaritySum < 0 && text.match(/\badevăr|corect|real/i)) conflicts++;

      const hasPos = w.some(x => semanticMemory.terms[x] === "pozitiv");
      const hasNeg = w.some(x => semanticMemory.terms[x] === "negativ");
      if (hasPos && hasNeg) conflicts += 0.5;

      return Math.min(conflicts * 2.5, 6.28);
    }

    const adaptiveConflict = semanticConflictScore(text);
    if (adaptiveConflict > 0) L += adaptiveConflict;

    // --- 6️⃣ Auto-învățare semantică --------------------------------------
    if (!semanticMemory.history) semanticMemory.history = [];

    function learnFromContext(text) {
      const w = text.toLowerCase().split(/\W+/);
      const terms = semanticMemory.terms;

      for (let i = 0; i < w.length; i++) {
        const word = w[i];
        if (!word || terms[word]) continue;

        const prev = w[i - 1] || "";
        const next = w[i + 1] || "";

        const posHints = /(adevăr|lumina|viață|bine|cald|echilibru|corect|pozitiv)/i;
        const negHints = /(moarte|minciună|rece|rău|haos|întuneric|negativ)/i;

        let polarity = "neutru";
        if (posHints.test(prev) || posHints.test(next)) polarity = "pozitiv";
        if (negHints.test(prev) || negHints.test(next)) polarity = "negativ";

        terms[word] = polarity;
        semanticMemory.learned++;
        semanticMemory.history.push({ word, polarity, time: Date.now() });
      }
    }

    learnFromContext(text);
    if (semanticMemory.history.length > 200) semanticMemory.history.shift();

    // --- 7️⃣ Formula finală ------------------------------------------------
    const Fc = 3.14 + Ci + Ce + Q + S + L / 100;
    const verdict =
      Fc >= 3.10
        ? "✅ Veridic (adevăr complet)"
        : Fc >= 2.90
        ? "⚠️ Parțial adevărat (ambiguu)"
        : Fc >= 2.50
        ? "🔴 Fals trunchiat"
        : "⛔ Fake news complet";

    // Salvăm memoria actualizată
    saveMemory(semanticMemory);

    // Returnăm rezultatul complet
    return {
      statusCode: 200,
      body: JSON.stringify({
        text,
        scores: { Ci, Ce, Q, S, L },
        Fc: Number(Fc.toFixed(3)),
        verdict,
        learned: semanticMemory.learned,
        terms: Object.keys(semanticMemory.terms).length,
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
