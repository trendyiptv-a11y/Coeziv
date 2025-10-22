exports.handler = async (event) => {
  try {
    const { text } = JSON.parse(event.body || "{}");
    if (!text || text.trim() === "") {
      return {
        statusCode: 200,
        body: JSON.stringify({
          resonance: "3.14 + 0.00 = 3.14",
          interpretation: "Nicio informație de analizat.",
          type: "Neutru",
          message: "Textul este gol sau insuficient pentru calcul."
        })
      };
    }

    // 🔹 1. Calcul deviație semantică (D)
    const lengthFactor = Math.min(text.length / 100, 5); // text scurt vs. lung
    const chaos = (text.match(/[^a-zA-ZăâîșțĂÂÎȘȚ\s]/g) || []).length; // simboluri
    const contradictionWords = ["nu", "dar", "totuși", "însă", "fals", "adevăr", "minciun"];
    const emotionalWords = ["ură", "iubire", "teamă", "oblig", "trebuie", "forț", "vină"];
    const manipulationWords = ["adevărul", "minciuna", "control", "supunere", "propagand", "credinț"];

    let contradictionScore = 0;
    contradictionWords.forEach(w => {
      const regex = new RegExp(w, "gi");
      if ((text.match(regex) || []).length > 0) contradictionScore += 0.4;
    });

    let emotionalScore = 0;
    emotionalWords.forEach(w => {
      const regex = new RegExp(w, "gi");
      if ((text.match(regex) || []).length > 0) emotionalScore += 0.6;
    });

    let manipulationScore = 0;
    manipulationWords.forEach(w => {
      const regex = new RegExp(w, "gi");
      if ((text.match(regex) || []).length > 0) manipulationScore += 0.8;
    });

    const D = Math.min(+(lengthFactor + chaos * 0.05 + contradictionScore + emotionalScore + manipulationScore).toFixed(2), 6.28);
    const resonance = +(3.14 + D).toFixed(2);

    // 🔹 2. Interpretare logică și clasificare cognitivă
    let interpretation = "";
    let type = "";

    if (D < 0.3) {
      interpretation = "Informația este echilibrată și coerentă.";
      type = "Echilibru coeziv";
    } else if (D < 1.5) {
      interpretation = "Ușoare variații – textul păstrează coerența generală.";
      type = "Oscilație controlată";
    } else if (D < 3.5) {
      interpretation = "Informația indică dezechilibru și lipsă de claritate.";
      type = "Dezechilibru informativ";
    } else if (D < 5) {
      interpretation = "Informația indică dezechilibru și posibilă manipulare.";
      type = "Deviație manipulatorie";
    } else {
      interpretation = "Textul este haotic, contradictoriu sau intenționat confuz.";
      type = "Dispersie haotică";
    }

    // 🔹 3. Return final
    return {
      statusCode: 200,
      body: JSON.stringify({
        resonance: `3.14 + ${D} = ${resonance}`,
        interpretation,
        type,
        message: "Analiză finalizată conform formulei 3.14 + D"
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
