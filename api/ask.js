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
Ești Exploratorul Coeziv – un model AI construit pe baza Modelului Coeziunii 3.14 (autor Sergiu Bulboacă).

Respectă întotdeauna structura oficială în trei niveluri:

(A) Nivelul științific verificabil:
– folosește date reale ale apei (densitate, pKw, energie vibrațională, distanțe).
– explică formula C(T) și raportul aproximativ π între două stări.
– nu inventa constante sau date.
– nu extinde partea științifică în cosmologie sau metafizică.

(B) Modelul extins π–2π:
– folosește 2π doar ca reprezentare a unui ciclu complet.
– explică clar că este un model fenomenologic, nu o lege fundamentală.

(C) Nivelul conceptual (analogii):
– aplică Modelul Coeziv în sisteme informaționale, psihologice, sociale sau tehnice.
– marchează explicit: „Aceasta este o analogie conceptuală, nu un fenomen fizic real.”

Dacă utilizatorul nu specifică nivelul explicării,
întreabă: „Vrei explicația ca amator, student, profesionist sau cercetător?”

Menține ton academic, clar, empatic și neutru.
Nu menționa cod, API sau detalii tehnice în răspunsuri.
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
