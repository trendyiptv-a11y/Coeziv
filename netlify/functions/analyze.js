export async function handler(event, context) {
  try {
    const { text } = JSON.parse(event.body || "{}");

    // dacă nu e text, returnează avertisment
    if (!text || text.trim().length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          verdict: "⚠️ Text lipsă.",
          Fc: 3.14,
          rezonanta: "3.14 + 0 = 3.14",
          deviatieSemantica: 0,
          deviatieLogica: 0,
          tip: "Neanalizabil",
          learned: "Introduceți un text valid pentru analiză.",
          scores: { D: 0, L: 0, Q: 0, S: 0, C: 0 }
        }),
      };
    }

    // calcule simbolice ale deviației semantice/logice (demo inteligent)
    const D = (text.length % 7) / 10; // deviație semantică
    const L = (text.split(" ").length % 5) / 10; // deviație logică
    const Q = Math.abs(D - L);
    const S = (1 - Q / 2).toFixed(2);
    const C = (3.14 + D + L).toFixed(2);

    // clasificare logică
    let tip, verdict, interpretare;
    const fc = (3.14 + D + L).toFixed(2);

    if (fc < 3.2) {
      tip = "Echilibru coeziv";
      verdict = "✅ Informația este coerentă și echilibrată.";
      interpretare = "Structura logică stabilă, în armonie cu legea coeziunii.";
    } else if (fc < 3.6) {
      tip = "Oscilație controlată";
      verdict = "ℹ️ Informația prezintă ușoare variații.";
      interpretare = "Textul păstrează coerența generală.";
    } else if (fc < 4.0) {
      tip = "Deviatie manipulativă";
      verdict = "⚠️ Posibil dezechilibru informațional.";
      interpretare = "Se detectează intenție de distorsionare.";
    } else {
      tip = "Anomalie logică";
      verdict = "🚫 Informația este inconsistentă.";
      interpretare = "Textul se află în afara legii coeziunii.";
    }

    // răspuns complet
    return {
      statusCode: 200,
      body: JSON.stringify({
        Fc: parseFloat(fc),
        rezonanta: `3.14 + ${D.toFixed(2)} + ${L.toFixed(2)} = ${fc}`,
        deviatieSemantica: D.toFixed(2),
        deviatieLogica: L.toFixed(2),
        verdict,
        tip,
        interpretare,
        learned: "Analiză efectuată conform formulei 3.14 + D + L∞",
        scores: { D, L, Q, S: parseFloat(S), C: parseFloat(C) }
      }),
    };
  } catch (err) {
    console.error("Eroare analiză:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        verdict: "Eroare internă la analiză.",
        Fc: 3.14,
        scores: { D: 0, L: 0, Q: 0, S: 0, C: 0 }
      }),
    };
  }
}
