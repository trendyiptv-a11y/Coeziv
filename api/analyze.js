export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: "Textul lipsește" });
  }

  // Simulare analiză locală bazată pe formula 3.14 + D + L∞
  const words = text.trim().split(/\s+/).length;
  const letters = text.replace(/\s+/g, "").length;
  const D = ((letters / words) % 3.14).toFixed(2);
  const L = ((Math.sin(letters) + 1.5) % 3.14).toFixed(2);
  const resonance =
    Math.abs(D - L) < 0.1 ? "3.14 (coeziv)" : "3.14 ± fluctuație minoră";

  const interpretations = [
    "Textul are echilibru semantic ridicat.",
    "Rezonanța exprimării este stabilă.",
    "Formularea indică armonie între idee și expresie.",
    "Analiza sugerează un nucleu logic coerent.",
  ];

  const interpretare =
    interpretations[Math.floor(Math.random() * interpretations.length)];

  return res.status(200).json({
    analysis: {
      rezonanta: resonance,
      D,
      L,
      interpretare,
    },
  });
}
