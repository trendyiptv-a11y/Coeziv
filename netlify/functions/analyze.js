export async function handler(event) {
  try {
    const { text } = JSON.parse(event.body || "{}");
    if (!text) {
      return { statusCode: 400, body: JSON.stringify({ error: "Lipsește textul pentru analiză." }) };
    }

    // 1️⃣ Normalizăm textul
    const clean = text.replace(/[^a-zA-ZăâîșțĂÂÎȘȚ ]/g, "").toLowerCase().trim();

    // 2️⃣ Calculăm deviația "D"
    const vowels = clean.match(/[aeiouăâî]/g)?.length || 0;
    const consonants = clean.match(/[bcdfghjklmnpqrstvwxyzșț]/g)?.length || 0;
    const ratio = vowels && consonants ? vowels / consonants : 0;
    const D = Math.abs((ratio - 0.38) * 10).toFixed(2); // deviația optimă ~0.38

    // 3️⃣ Calculăm forța totală
    const resonance = (3.14 + parseFloat(D)).toFixed(2);

    // 4️⃣ Interpretare logică după formula 3.14 + D
    let interpretation = "";
    let type = "";
    if (D < 0.2) {
      interpretation = "Informația se află în rezonanță cu legea coeziunii.";
      type = "Echilibru coeziv";
    } else if (D < 0.8) {
      interpretation = "Informația prezintă ușoare fluctuații, dar rămâne coerentă.";
      type = "Oscilație controlată";
    } else if (D < 1.5) {
      interpretation = "Informația are deviații semnificative de sens.";
      type = "Dezechilibru parțial";
    } else {
      interpretation = "Informația indică dezechilibru și posibilă manipulare.";
      type = "Deviație manipulativă";
    }

    // 5️⃣ Răspuns final
    return {
      statusCode: 200,
      body: JSON.stringify({
        resonance: `3.14 + ${D} = ${resonance}`,
        interpretation,
        type,
        message: "Analiză finalizată conform formulei 3.14 + D",
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Eroare la analiză", details: err.message }) };
  }
}
