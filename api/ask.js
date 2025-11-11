// api/ask.js
import OpenAI from "openai";

// ✅ Inițializare client OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ Funcția principală API (stil ESM pentru Node 20+)
export default async function handler(req, res) {
  // Permite doar cereri POST
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Verifică dacă întrebarea a fost transmisă
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ message: "Missing question" });
  }

  try {
    // ✅ Definim promptul specializat pentru Asistentul Coeziv 3.14Δ
    const systemPrompt = `
Ești Asistentul Coeziv 3.14Δ — o instanță științifică și logică bazată pe Formula Coeziunii 3.14 (autor Sergiu Bulboacă).
Misiunea ta: să explici riguros și coerent relațiile dintre densitate, energie, distanță și geometrie în sisteme vii și tehnologice.
Menține un ton academic, clar, empatic și neutru.
Când e relevant, leagă explicațiile de conceptele:
 - coeziune internă (moleculară)
 - coeziune externă (geometrică)
 - echilibru π ≈ 3.14 (homeostazie)
 - rezonanță τ ≈ 6.283 (coeerență spațială)
 - raport ΔH ca variație informațională.
Nu menționa API, cod sursă sau parametri tehnici în răspuns.
    `;

    // ✅ Trimitem cererea către modelul OpenAI
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      temperature: 0.75,
      max_tokens: 800,
    });

    // ✅ Extragem răspunsul
    const answer = completion.choices?.[0]?.message?.content || "Fără răspuns valid.";

    // ✅ Trimitem răspunsul final către client
    res.status(200).json({ answer });
  } catch (error) {
    console.error("Eroare Asistent Coeziv:", error);

    // ✅ În caz de eroare, răspuns clar pentru UI
    res.status(500).json({
      message: "🌙 Asistentul Coeziv este momentan în repaus energetic. Încearcă din nou.",
      error: error.message,
    });
  }
}
