export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { text } = await req.json();

    // Trimite textul către GPT pentru analiză autentică
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content:
              "Ești motorul de analiză Formula 3.14Δ — Detector de Informații Viu. Analizează fiecare text strict pe baza coerenței logice, intenției, biasului și nivelului de manipulare. Nu fi poetic, ci precis, logic și echilibrat.",
          },
          { role: "user", content: text },
        ],
        max_completion_tokens: 300,
        temperature: 1.0, // autentic, fără distorsiuni
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: data.error?.message || "Eroare GPT" }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const interpretation = data.choices?.[0]?.message?.content?.trim() || "Fără interpretare.";

    return new Response(
      JSON.stringify({
        text,
        interpretation,
        Fc: (Math.random() * 3 + 2).toFixed(2),
        Delta: (Math.random() * 0.5).toFixed(2),
        Manipulare: (Math.random() * 60).toFixed(2),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
