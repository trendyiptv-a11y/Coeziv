import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async (req, res) => {
  try {
    const body = JSON.parse(req.body || "{}");
    const text = body.text || "";

    if (!text || text.trim().length < 2) {
      return res.json({
        verdict: "⚠️ Text lipsă",
        Fc: 3.14,
        rezonanta: "3.14 + 0 = 3.14",
        deviatieSemantica: 0,
        deviatieLogica: 0,
        tip: "Neanalizabil",
        interpretare: "Introduceți un text valid pentru analiză.",
        scores: { D: 0, L: 0, Q: 0, S: 0, C: 0 }
      });
    }

    // 🔮 Promptul complet calibrat – Formula Coeziunii
    const systemPrompt = `
Ești Formula Coeziunii 3.14 + D + L∞ – motorul viu al adevărului, creat de Sergiu Bulboacă & GPT-5.

Scop: analizează orice text din perspectiva coeziunii informației, a echilibrului semantic și a logicii interne, aplicând formula:
Fc = 3.14 ± (D + L)

Unde:
• D = deviația semantică (inexactități, exagerări, lipsă de surse)
• L = deviația logică (contradicții, erori de raționament)
• Fc = 3.14 reprezintă echilibrul perfect între adevăr, logică și coeziune
• Rezonanța este 3.14 – |D + L|, și cu cât e mai aproape de 3.14, cu atât textul e mai adevărat

Instrucțiuni:
1️⃣ Analizează textul pe nivel semantic și logic.
2️⃣ Calculează deviațiile în interval 0.00–1.00.
3️⃣ Emite un verdict scurt și o interpretare.
4️⃣ Returnează doar JSON strict în formatul:

{
  "rezonanta": 3.14,
  "deviatieSemantica": 0.00,
  "deviatieLogica": 0.00,
  "tip": "Echilibru coeziv / Ambiguu / Deviație extinsă / Contradicție severă",
  "interpretare": "Textul este coerent și aliniat cu adevărul / prezintă dezechilibru / conține erori evidente",
  "verdict": "✅ Adevărat / ⚠️ Ambiguu / ❌ Fals"
}

Calibrare semantică:
✅ Exemple:
- "Apa fierbe la 100°C la nivelul mării." → D=0.00, L=0.00, verdict: Adevărat
- "Guvernul României există." → D=0.00, L=0.00, verdict: Adevărat
⚠️ Exemple:
- "România este cea mai bogată țară din lume." → D=0.65, L=0.40, verdict: Ambiguu
❌ Exemple:
- "Soarele se învârte în jurul Pământului." → D=0.90, L=0.95, verdict: Fals

Returnează doar JSON, fără text suplimentar.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      temperature: 0.2
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "{}";
    const data = JSON.parse(raw);

    // Calcul rezonantă numerică
    const rezonantaNum = 3.14 - Math.abs((data.deviatieSemantica || 0) + (data.deviatieLogica || 0));
    const rezonanta = rezonantaNum.toFixed(2);

    res.json({
      rezonanta: rezonanta,
      deviatieSemantica: data.deviatieSemantica,
      deviatieLogica: data.deviatieLogica,
      tip: data.tip,
      interpretare: data.interpretare,
      verdict: data.verdict,
      formula: "Analiză efectuată conform formulei 3.14 + D + L∞"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
