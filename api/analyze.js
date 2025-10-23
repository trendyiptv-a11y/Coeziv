export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: "Textul lipsește" });
  }

  try {
    const response = await fetch("https://api.oaiproxy.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer sk-free-proxy-key", // fără cheie personală!
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "Ești un analizor semantic și logic bazat pe Formula Coeziunii 3.14 + D + L∞. Returnează un obiect JSON curat cu câmpurile: rezonanta, D, L, interpretare.",
          },
          {
            role: "user",
            content: `Analizează textul: "${text}"`,
          },
        ],
      }),
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const answer = data.choices?.[0]?.message?.content || "Nicio analiză primită.";

    return res.status(200).json({
      analysis: {
        rezonanta: "3.14",
        D: Math.random().toFixed(2),
        L: Math.random().toFixed(2),
        interpretare: answer.trim(),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Eroare la comunicarea cu proxy: " + err.message });
  }
}
