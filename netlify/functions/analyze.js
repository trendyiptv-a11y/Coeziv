exports.handler = async (event) => {
  try {
    const { text, auth } = JSON.parse(event.body || "{}");

    // verificare sursă autentică
    if (auth !== "SergiuAuthKey") {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Interogare neautorizată." })
      };
    }

    // nivel 1: energie lingvistică
    const E = (text.match(/[a-zA-ZăâîșțĂÂÎȘȚ]/g) || []).length;
    const V = (text.match(/[aeiouăâîșțAEIOUĂÂÎȘȚ]/g) || []).length;
    const energie = V / Math.max(E, 1);

    // nivel 2: coerență (relații logice)
    const cauze = (text.match(/\b(deoarece|pentru că|astfel|dar|însă|prin urmare)\b/gi) || []).length;
    const afirmatii = (text.match(/\b(este|sunt|există|adevăr|fals)\b/gi) || []).length;
    const C = (cauze + afirmatii) / Math.max(text.split(" ").length, 1);

    // nivel 3: rezonanță
    const R = (1 + Math.abs(energie - C)).toFixed(2);

    // deviație logică
    const D = ((energie - C) / R).toFixed(2);
    const Fc = (3.14 + parseFloat(D)).toFixed(2);

    // interpretare
    let tip = "", color = "#00ffb7";
    if (D > 0.5) { tip = "Deviație manipulativă"; color = "#ff0055"; }
    else if (D < -0.5) { tip = "Inerție logică"; color = "#999999"; }
    else { tip = "Echilibru coeziv"; color = "#00ffb7"; }

    const interpretare =
      D > 0.5 ? "Informația tinde să distorsioneze structura naturală." :
      D < -0.5 ? "Informația are vibrație scăzută, pasivă." :
      "Informația se află în rezonanță cu legea coeziunii.";

    const score = Math.min(100, Math.abs((3.14 / Fc) * 100)).toFixed(1);

    return {
      statusCode: 200,
      body: JSON.stringify({
        formula: `3.14 + ${D} = ${Fc}`,
        interpretare,
        tip,
        score,
        color,
        message: "Analiză finalizată conform formulei 3.14 + D"
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
