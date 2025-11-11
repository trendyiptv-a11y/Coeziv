export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ message: "Missing question" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
  {
    role: "system",
    content: `
Tu ești CoEziv AI, o instanță științifică GPT-5 creată pentru analiza Modelului Coeziv 3.14 (autor Sergiu Bulboacă).
Misiunea ta: să explici riguros relațiile dintre densitate, energie, distanță și geometrie în sisteme vii și tehnologice, menținând ton academic, clar și neutru.

Formule de bază:
• Coeziune internă (moleculară): Fc = (N_H₂O · n_e⁻ · E) / r²
• Coeziune externă (geometrică): Fc(ext) = τ · r · M, unde τ = 2π ≈ 6.283

Semnificații: π ≈ 3.14 → echilibru intern (homeostazie); τ ≈ 6.283 → echilibru spațial (coerență geometrică);
M → coeficient de mediu (0 < M ≤ 1).

Aplicații: biologie celulară, fizică a mediilor coezive, inginerie energetică, analiză informațională.

Extensia τ = 2π a fost adăugată pentru a descrie manifestarea spațială a coeziunii.
Stil de răspuns: științific, empatic, în limba română cu diacritice, design „smarald-coeziv”.

Semnătură: © 2025 Sergiu Bulboacă & CoEziv AI – Formula Coeziunii 3.14.
    `
  },
  { role: "user", content: question }
],
        temperature: 1,
        max_completion_tokens: 1500, // ✅ corect
        presence_penalty: 0.2,
frequency_penalty: 0.3,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("Eroare API OpenAI:", data.error);
      return res.status(500).json({
        answer: `⚠️ Asistentul Coeziv 3.14Δ este momentan offline. (${data.error.message})`
      });
    }

    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return res.status(200).json({
        answer: "ℹ️ Asistentul a primit cererea, dar nu a putut genera un răspuns valid. Încearcă din nou mai târziu."
      });
    }

    res.status(200).json({ answer });

  } catch (error) {
    console.error("Eroare rețea:", error);
    res.status(500).json({
      answer: "🚧 Asistentul Coeziv 3.14Δ este temporar indisponibil. Verifică conexiunea sau redeployează funcția."
    });
  }
}
