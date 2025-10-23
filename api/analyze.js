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
  let resonance = "";
  const delta = Math.abs(D - L);
  if (delta < 0.15) resonance = "3.14 (coeziune echilibrată)";
  else if (delta < 0.5) resonance = "3.14 ± fluctuație minoră";
  else resonance = "3.14 ⚠ dezechilibru logic";

  // === 🧠 Conectare la GPT ===
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let interpretation = "GPT nu a oferit un răspuns.";

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "Ești modulul viu al Formulei Coeziunii 3.14Δ – un analizator logic, semantic și poetic. Răspunde concis și clar, în română.",
        },
        {
          role: "user",
          content: `
Analizează următorul text prin prisma echilibrului logic și semantic:
"${text}"

Valorile:
- D = ${D}
- L = ${L}
- Rezonanță = ${resonance}

Evaluează dacă textul este coerent, rigid sau distorsionat.
Dacă există contradicții logice sau neclarități, menționează-le.
Formulează o scurtă interpretare poetică în final.
          `,
        },
      ],
    });

    interpretation =
      completion.choices?.[0]?.message?.content?.trim() ||
      "GPT nu a returnat conținut clar.";

    // 🧩 Trunchiere controlată pentru a evita texte prea lungi
    interpretation = interpretation.slice(0, 900);
  } catch (error) {
    console.error("❌ Eroare GPT:", error);
    interpretation = `Eroare GPT: ${error.message}`;
  }

  // === 📦 Răspuns JSON complet ===
  return res.status(200).json({
    analysis: {
      D,
      L,
      resonance,
      interpretation,
      note:
        "⏳ Analiza se bazează pe echilibrul logic-semantic al textului. Valorile pot fluctua ±0.14 în funcție de densitatea informației.",
    },
  });
}
