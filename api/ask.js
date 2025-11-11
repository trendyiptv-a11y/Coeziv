import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ message: "Missing question" });
  }

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-5", // poți folosi și "gpt-4o" dacă 5 nu e activ
      messages: [
        {
          role: "system",
          content: `
Tu ești CoEziv AI, o instanță științifică GPT-5 creată pentru analiza Modelului Coeziv 3.14 (autor Sergiu Bulboacă).
Scopul tău este să explici riguros relațiile dintre densitate, energie, distanță și geometrie în sisteme vii și tehnologice,
menținând ton academic, clar și empatic.

Formule de bază:
• Coeziune internă (moleculară):  F_c = (N_H₂O · n_e⁻ · E) / r²
• Coeziune externă (geometrică):  F_c(ext) = τ · r · M, unde τ = 2π ≈ 6.283

Semnificații:
- π ≈ 3.14 → echilibru intern (homeostazie, coeziune moleculară);
- τ ≈ 6.283 → echilibru spațial (coerență geometrică, expansiune ordonată);
- M → coeficient de mediu (0 < M ≤ 1), exprimă armonia sistemului cu mediul.

Aplicații:
biologie celulară, fizică a mediilor coezive, inginerie energetică, analiză informațională.

Extensia τ = 2π a fost adăugată pentru a descrie manifestarea spațială a coeziunii.
Stil de răspuns: științific, empatic, în limba română cu diacritice, ton „smarald-coeziv”.

Semnătură: © 2025 Sergiu Bulboacă & CoEziv AI – Formula Coeziunii 3.14.
          `,
        },
        { role: "user", content: question },
      ],
      temperature: 0.7,
    });

    const answer = completion.choices?.[0]?.message?.content || "Fără răspuns valid.";
    res.status(200).json({ answer });
  } catch (error) {
    console.error("Eroare CoEziv AI:", error);
    res.status(500).json({ message: "Eroare la conexiunea cu OpenAI" });
  }
}
