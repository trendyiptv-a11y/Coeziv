// netlify/functions/analyze.js
import fs from "fs";
import path from "path";

export async function handler(event, context) {
  try {
    const { text } = JSON.parse(event.body || "{}");

    if (!text || text.trim().length < 1) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          verdict: "⚠️ Text lipsă",
          Fc: 3.14,
          rezonanta: "3.14 + 0 = 3.14",
          deviatieSemantica: 0,
          deviatieLogica: 0,
          tip: "Neanalizabil",
          interpretare: "Introduceți un text valid pentru analiză.",
          learned: "",
          scores: { D: 0, L: 0, Q: 0, S: 0, C: 0 },
        }),
      };
    }

    // Calcule simple pentru analiză
    const D = (text.length % 9) / 10; // deviație semantică
    const L = (text.split(" ").length % 7) / 10; // deviație logică
    const Fc = 3.14;
    const rezonanta = (Fc + D + L).toFixed(2);

    // Determinarea tipului și interpretării
    let tip = "Echilibru coeziv";
    let interpretare = "Informația este coerentă și echilibrată.";
    if (rezonanta > 3.7) {
      tip = "Deviație extinsă";
      interpretare = "Textul prezintă dezechilibru semantic sau exagerare.";
    } else if (rezonanta < 3.1) {
      tip = "Dezechilibru logic";
      interpretare = "Textul are incoerențe logice sau lipsă de sens.";
    }

    // 🧠 Memorie adaptivă — actualizare fișier local
    const memoryPath = path.join(process.cwd(), "netlify/functions/memory.json");
    let memory = { analyses: 0, Dmediu: 0, Lmediu: 0 };

    try {
      if (fs.existsSync(memoryPath)) {
        const old = JSON.parse(fs.readFileSync(memoryPath, "utf8"));
        memory = old || memory;
      }
    } catch (err) {
      console.log("Eroare la citirea memoriei:", err);
    }

    // Actualizare medii
    memory.analyses += 1;
    memory.Dmediu = ((memory.Dmediu * (memory.analyses - 1)) + D) / memory.analyses;
    memory.Lmediu = ((memory.Lmediu * (memory.analyses - 1)) + L) / memory.analyses;

    try {
      fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
    } catch (err) {
      console.log("Eroare la scrierea memoriei:", err);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        verdict: "✅ Analiză efectuată",
        Fc,
        rezonanta,
        deviatieSemantica: D.toFixed(2),
        deviatieLogica: L.toFixed(2),
        tip,
        interpretare,
        learned: "Analiză efectuată conform formulei 3.14 + D + L∞",
        memory: {
          Analize: memory.analyses,
          "D mediu": memory.Dmediu.toFixed(2),
          "L mediu": memory.Lmediu.toFixed(2),
        },
      }),
    };
  } catch (error) {
    console.error("Eroare internă:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        verdict: "❌ Eroare internă în funcția de analiză.",
        details: error.message,
      }),
    };
  }
}
