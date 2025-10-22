// Formula Coeziunii 3.14 + D∞
// Motor logic adaptiv cu memorie de coeziune
let memory = { avgD: 0, count: 0 };

exports.handler = async (event) => {
  try {
    const { text, user = "Sergiu" } = JSON.parse(event.body || "{}");

    if (!text || text.trim() === "") {
      return {
        statusCode: 200,
        body: JSON.stringify({
          resonance: "3.14 + 0.00 = 3.14",
          interpretation: "Text gol – niciun câmp energetic de analizat.",
          type: "Neutru",
          memory
        })
      };
    }

    // 1️⃣ – Calcul semantic de bază
    const lengthFactor = Math.min(text.length / 120, 5);
    const chaos = (text.match(/[^a-zA-ZăâîșțĂÂÎȘȚ0-9\s]/g) || []).length * 0.04;
    const contradictions = ["dar", "însă", "totuși", "fals", "adevăr", "minciun", "contradic"];
    const emotional = ["ură", "iubire", "teamă", "trebuie", "forț", "credinț", "supunere"];
    const manipulative = ["adevărul", "control", "propagand", "oblig", "supune", "ordine"];

    let score = lengthFactor + chaos;
    [contradictions, emotional, manipulative].forEach((set, i) => {
      set.forEach(w => {
        const matches = (text.match(new RegExp(w, "gi")) || []).length;
        if (matches > 0) score += (i + 1) * 0.6;
      });
    });

    let D = Math.min(+score.toFixed(2), 6.28);

    // 2️⃣ – Adaptare pe baza memoriei
    memory.avgD = ((memory.avgD * memory.count) + D) / (memory.count + 1);
    memory.count++;

    // Ajustăm sensibilitatea pe baza istoricului
    const bias = +(memory.avgD / 10).toFixed(2);
    const resonance = +(3.14 + D - bias).toFixed(2);

    // 3️⃣ – Clasificare cognitivă adaptivă
    let interpretation = "";
    let type = "";

    if (D < 0.3 + bias) {
      interpretation = "Informația este echilibrată și coerentă.";
      type = "Echilibru coeziv";
    } else if (D < 1.5 + bias) {
      interpretation = "Ușoare variații – textul păstrează coerența generală.";
      type = "Oscilație controlată";
    } else if (D < 3.5 + bias) {
      interpretation = "Informația indică dezechilibru și lipsă de claritate.";
      type = "Dezechilibru informativ";
    } else if (D < 5 + bias) {
      interpretation = "Informația indică dezechilibru și posibilă manipulare.";
      type = "Deviație manipulatorie";
    } else {
      interpretation = "Textul este haotic, contradictoriu sau intenționat confuz.";
      type = "Dispersie haotică";
    }

    // 4️⃣ – Profilare ușoară (confirmare utilizator)
    const source = user === "Sergiu" ? "Analiză inițiată de utilizator principal." : "Analiză generică.";

    return {
      statusCode: 200,
      body: JSON.stringify({
        resonance: `3.14 + ${D} = ${resonance}`,
        interpretation,
        type,
        message: "Analiză finalizată conform formulei 3.14 + D∞",
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
