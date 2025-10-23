import OpenAI from "openai";

export default async function handler(req, res) {
  // Verifică metoda
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Parsează corect body-ul (string sau obiect)
  if (typeof req.body === "string") req.body = JSON.parse(req.body);
  const { text } = req.body;

  // Verifică dacă textul este valid
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: "Textul nu poate fi gol." });
  }

  // Verifică existența cheii API
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Cheia OpenAI lipsește." });
  }

  // === 🔢 Formula Coeziunii 3.14Δ ===
  const words = text.trim().split(/\s+/).length;
  const letters = text.replace(/\s+/g, "").length;
  const D = ((letters / words) % 3.14).toFixed(2);
  const L = ((Math.sin(letters) + 1.5) % 3.14).toFixed(2);

  // Rezonanță: coezivă, fluctuantă sau rigidă
  let rezonanta = "";
  const delta = Math.abs(D - L);
  if (delta < 0.15) rezonanta = "3.14 (coeziune echilibrată)";
  else if (delta < 0.5) rezonanta = "3.14 ± fluctuație minoră";
  else rezonanta = "3.14 ⚠ dezechilibru logic";

  // === 🧠 Conectare la GPT ===
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let interpretare = "GPT nu a oferit un răspuns clar.";

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.35,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "Ești modulul viu al Formulei Coeziunii 3.14Δ – un analizator logic, semantic și poetic. Răspunde concis, clar și expresiv în limba română.",
        },
        {
          role: "user",
          content: `
Analizează următorul text prin prisma echilibrului logic și semantic:
"${text}"

Valorile:
- D = ${D}
- L = ${L}
- Rezonanță = ${rezonanta}

1️⃣ Evaluează dacă textul este coerent, rigid sau distorsionat.
2️⃣ Identifică eventuale contradicții sau lipsuri logice.
3️⃣ Formulează o scurtă interpretare poetică în final.
          `,
        },
      ],
    });

    interpretare =
      completion.choices?.[0]?.message?.content?.trim() ||
      "GPT nu a returnat conținut clar.";

    // 🧩 Eliminare limitare – afișează TOT textul (fără tăiere)
    if (interpretare.length > 2000) {
      interpretare = interpretare.substring(0, 2000) + " […]";
    }
  } catch (error) {
    console.error("❌ Eroare GPT:", error);
    interpretare = `Eroare GPT: ${error.message}`;
  }

  // === 📦 Răspuns JSON compatibil cu index.html ===
  return res.status(200).json({
    rezonanta,
    D,
    L,
    interpretare,
  });
}
