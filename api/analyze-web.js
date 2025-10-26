export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    const { text } = await req.json();

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ success: false, message: "Textul este gol." }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Ești motorul Coeziv 3.14. Analizează textul folosind formula Δ (diferență logică), Fc (forța coeziunii) și gradul de Manipulare (%). Explică succint și obiectiv, în română.",
          },
          { role: "user", content: text },
        ],
      }),
    });

    const data = await gptResponse.json();
    const answer = data.choices?.[0]?.message?.content || "Analiza nu a generat conținut.";

    return new Response(JSON.stringify({ success: true, result: answer }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}
