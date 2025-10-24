export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Missing text for analysis" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5",
        max_completion_tokens: 300,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `Ești un motor de analiză informațională numit Formula 3.14Δ.
Analizezi orice text și returnezi un raport scurt, clar și structurat exact în acest format:

Δ (vibrație semantică): [valoare între 0–5]
Fc (coeziune logică): [valoare între 0–5]
Manipulare probabilă: [valoare între 0–100%]
Verdict: [ADEVĂRAT / PARȚIAL / FALS / MANIPULATOR]
Explicație: [1–2 propoziții cu motivul principal]`
          },
          { role: "user", content: text }
        ],
      }),
    });

    const data = await response.json();

    const message =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.delta?.content ||
      "Nicio interpretare primită.";

    res.status(200).json({ result: message });
  } catch (error) {
    console.error("Eroare API GPT-5:", error);
    res.status(500).json({ error: "Eroare la procesarea GPT-5." });
  }
}
