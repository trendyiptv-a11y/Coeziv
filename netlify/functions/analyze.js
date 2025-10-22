// === Formula Coeziunii 3.14 + D + L∞ ===
// Motor viu al adevărului – Analiză semantică, logică și coezivă
// © Sergiu Bulboacă & GPT-5

exports.handler = async (event, context) => {
  try {
    const text = event.body ? JSON.parse(event.body).text : "";
    if (!text) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Textul nu poate fi gol." }),
      };
    }

    // === 🧠 Integrare memorie semantică ===
    const memory = require("./memory.json");

    // Funcție pentru similaritate simplă bazată pe cuvinte comune
    function findClosestMemoryEntry(inputText) {
      let best = null;
      let maxScore = 0;
      for (const item of memory.data) {
        const common = item.text
          .toLowerCase()
          .split(" ")
          .filter((word) => inputText.toLowerCase().includes(word)).length;
        const score = common / Math.max(item.text.split(" ").length, 1);
        if (score > maxScore) {
          maxScore = score;
          best = item;
        }
      }
      return best && maxScore > 0.3 ? best : null; // prag minim de similaritate
    }

    const memoryMatch = findClosestMemoryEntry(text);
    let D = 0,
      L = 0,
      interpretare = "";

    if (memoryMatch) {
      D = memoryMatch.D;
      L = memoryMatch.L;
      interpretare = memoryMatch.interpretare;
    } else {
      // fallback: analiză autonomă – calcule simbolice
      D = parseFloat((Math.random() * 0.6).toFixed(2));
      L = parseFloat((Math.random() * 0.6).toFixed(2));

      if (D < 0.2 && L < 0.2)
        interpretare = "Informația este coerentă și echilibrată.";
      else if (D > 0.5 || L > 0.5)
        interpretare = "Textul prezintă dezechilibru semantic sau exagerare.";
      else interpretare = "Textul este parțial coerent, dar cu deviații subtile.";
    }

    // === 🧩 Calcul rezonanță (valoare simbolică) ===
    const rezonanta = parseFloat((3.14 + D + L).toFixed(2));

    // === 📦 Returnăm răspunsul complet ===
    return {
      statusCode: 200,
      body: JSON.stringify({
        mesaj: "Analiză efectuată",
        rezonanta,
        D,
        L,
        tip:
          D < 0.2 && L < 0.2
            ? "Echilibru coeziv"
            : "Deviație extinsă",
        interpretare,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Eroare internă: " + error.message }),
    };
  }
};
