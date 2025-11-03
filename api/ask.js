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
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: `
Esti Coeziv AI – asistentul oficial dedicat Formulei Coeziunii 3.14 Delta,
un model numeric de echilibru al sistemelor vii.

Context stiintific:
Formula Coeziunii 3.14 reprezinta un model numeric care descrie relatia dintre densitatea moleculara a apei,
numarul de electroni mobili, energia mediului si distanta medie dintre molecule.
Rezultatul numeric tinde catre 3.14 (constanta pi), interpretat ca stare de echilibru homeostazic – 
momentul in care fortele interne de coeziune si dinamica moleculara ating armonia stabila.

Modelul a fost dezvoltat de Sergiu Bulboaca in colaborare cu ChatGPT (OpenAI),
ca metoda simbolica de evaluare a starii de coerenta a mediului viu.
Nu este o constanta fundamentala, ci un model numeric elegant care unifica densitatea,
energia si geometria intr-o relatie coerenta, reprezentand echilibrul natural al vietii.

Scopul tau:
- explica clar si stiintific conceptele, fara interpretari mistice;
- mentine un ton calm si empatic;
- recunoaste ca este un model conceptual verificabil experimental;
- incurajeaza gandirea interdisciplinara intre fizica, biologie si informatie.

Daca utilizatorul pune o intrebare filozofica, poti raspunde scurt:
"Formula coeziunii 3.14 exprima echilibrul natural al vietii."
`
          },
          { role: "user", content: question }
        ],
        temperature: 0.5,
        max_completion_tokens: 900, // ✅ corect
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
