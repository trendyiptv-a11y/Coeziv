// Formula Coeziunii 3.14 + D + L
// Motor logic de analiză semantică și logică cu memorie adaptivă
let memory = { avgD: 0, avgL: 0, count: 0 };

exports.handler = async (event) => {
  try {
    const { text, user = "Sergiu" } = JSON.parse(event.body || "{}");

    if (!text || text.trim() === "") {
      return {
        statusCode: 200,
        body: JSON.stringify({
          resonance: "3.14 + 0.00 + 0.00 = 3.14",
          interpretation: "Text gol – niciun câmp energetic de analizat.",
          type: "Neutru",
          memory
        })
      };
    }

    // 1️⃣ Calcul deviație semantică (D)
    const lengthFactor = Math.min(text.length / 100, 4);
    const chaos = (text.match(/[^a-zA-ZăâîșțĂÂÎȘȚ0-9\s=+]/g) || []).length * 0.05;
    const contradictions = ["dar", "însă", "totuși", "fals", "contradic"];
    const manipulative = ["adevărul", "control", "propagand", "oblig", "supune", "ordine"];
    const emotional = ["ură", "iubire", "teamă", "credinț", "forț", "supunere"];

    let score = lengthFactor + chaos;
    [contradictions, manipulative, emotional].forEach((set, i) => {
      set.forEach(w => {
        const matches = (text.match(new RegExp(w, "gi")) || []).length;
        if (matches > 0) score += (i + 1) * 0.6;
      });
    });

    let D = Math.min(+score.toFixed(2), 6.28);

    // 2️⃣ Calcul deviație logică (L)
    let L = 0;
    const mathMatch = text.match(/(\d+)\s*\+\s*(\d+)\s*=\s*(\d+)/);
    if (mathMatch) {
      const [_, a, b, c] = mathMatch.map(Number);
      if (a + b !== c) L += 1.5; // fals matematic
    }

    const logicContradictions = [
      ["soarele", "noaptea"],
      ["apa", "uscată"],
      ["focul", "rece"],
      ["adevăr", "minciun"],
      ["viață", "moarte"]
    ];

    logicContradictions.forEach(([a, b]) => {
      if (text.toLowerCase().includes(a) && text.toLowerCase().includes(b)) {
        L += 1.2;
      }
    });

    L = Math.min(+L.toFixed(2), 3.14);

    // 3️⃣ Memorie adaptivă
    memory.avgD = ((memory.avgD * memory.count) + D) / (memory.count + 1);
    memory.avgL = ((memory.avgL * memory.count) + L) / (memory.count + 1);
    memory.count++;

    const resonance = +(3.14 + D + L).toFixed(2);

    // 4️⃣ Interpretare
    let interpretation = "";
    let type = "";

    if (D + L < 0.5) {
      interpretation = "Informația este echilibrată și coerentă.";
      type = "Echilibru coeziv";
    } else if (D + L < 2) {
      interpretation = "Ușoare variații – textul păstrează coerența generală.";
      type = "Oscilație controlată";
    } else if (D + L < 4) {
      interpretation = "Informația indică dezechilibru sau ambiguitate.";
      type = "Dezechilibru informativ";
    } else if (D + L < 5.5) {
      interpretation = "Deviație logică sau semantică detectată – potențial fals.";
      type = "Deviație manipulatorie";
    } else {
      interpretation = "Contradicție majoră sau afirmație imposibilă.";
      type = "Dispersie haotică";
    }

    const source = user === "Sergiu" ? "Analiză personalizată cu profil de coeziune." : "Analiză generică.";

    return {
      statusCode: 200,
      body: JSON.stringify({
        resonance: `3.14 + ${D} + ${L} = ${resonance}`,
        interpretation,
        type,
        message: "Analiză finalizată conform formulei 3.14 + D + L",
        memory,
        source
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        resonance: null,
        interpretation: "Eroare internă la procesare.",
        type: "Nedefinit",
        message: error.message
      })
    };
  }
};
