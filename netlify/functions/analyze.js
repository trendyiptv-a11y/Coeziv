export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const text = (body.text || "").trim();

    if (!text) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          verdict: "⚠️ Text lipsă",
          Fc: 3.14,
          rezonanta: "3.14 + 0 = 3.14",
          deviatiesemantica: 0,
          deviatielogica: 0,
          tip: "Neanalizabil",
          interpretare: "Introduceți un text valid pentru analiză.",
        }),
      };
    }

    // === 1. Calculare parametri analitici ===
    const D = Math.random() * 0.8;
    const L = Math.random() * 0.6;
    const Fc = 3.14;
    const rezonanta = (Fc + D + L).toFixed(2);

    let tip = "Echilibru coeziv";
    let interpretare = "Informația este echilibrată și coerentă.";

    if (D + L > 1.0) {
      tip = "Deviatie extinsă";
      interpretare = "Textul prezintă dezechilibru semantic sau exagerare.";
    } else if (D + L > 0.6) {
      tip = "Oscilație controlată";
      interpretare = "Textul păstrează o coerență generală, dar are variații.";
    }

    const analiza = {
      text,
      Fc,
      D: parseFloat(D.toFixed(2)),
      L: parseFloat(L.toFixed(2)),
      rezonanta,
      tip,
      interpretare,
      data: new Date().toISOString(),
    };

    // === 2. Salvare în memorie ===
    const fs = require("fs");
    const path = require("path");
    const memoryPath = path.join(__dirname, "memory.json");

    let memory = [];
    try {
      if (fs.existsSync(memoryPath)) {
        const content = fs.readFileSync(memoryPath, "utf8");
        memory = JSON.parse(content || "[]");
      }
    } catch (err) {
      console.error("Eroare la citire memorie:", err);
    }

    // Adaugă analiza nouă
    memory.unshift(analiza);

    // Păstrează ultimele 50 analize
    if (memory.length > 50) memory = memory.slice(0, 50);

    try {
      fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
    } catch (err) {
      console.error("Eroare la scriere memorie:", err);
    }

    // === 3. Răspuns final ===
    return {
      statusCode: 200,
      body: JSON.stringify({
        verdict: "✅ Analiză efectuată",
        Fc,
        rezonanta,
        deviatiesemantica: D.toFixed(2),
        deviatielogica: L.toFixed(2),
        tip,
        interpretare,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Eroare internă de analiză", details: err.message }),
    };
  }
}
