import OpenAI from "openai";

export default async function handler(req, res) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const query = req.query.q || "Latest news about space discoveries 2025";

  try {
    const response = await client.responses.create({
      model: "gpt-5", // poți folosi și "gpt-4.1" dacă nu ai acces complet
      tools: [{ type: "web_search" }],
      input: [
        {
          role: "user",
          content: query
        }
      ]
    });

    const text = response.output_text || "Fără text în răspuns.";
    const citations = response.output?.[0]?.citations || [];
    const sources = citations.map((c) => c.url);

    // HTML minimalist, responsive
    const html = `
      <!DOCTYPE html>
      <html lang="ro">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>GPT WebSearch Status</title>
        <style>
          body {
            background-color: #0d1117;
            color: #c9d1d9;
            font-family: 'Segoe UI', sans-serif;
            text-align: center;
            padding: 2rem;
          }
          h1 { color: #00ffb7; }
          input {
            padding: 0.5rem;
            border-radius: 8px;
            border: none;
            width: 80%;
            margin-bottom: 1rem;
          }
          button {
            padding: 0.6rem 1.2rem;
            background-color: #00ffb7;
            border: none;
            border-radius: 10px;
            color: #0d1117;
            font-weight: bold;
            cursor: pointer;
          }
          .ok { color: #00ffb7; font-weight: bold; }
          .err { color: #ff3b3b; font-weight: bold; }
          .sources { margin-top: 1rem; text-align: left; max-width: 600px; margin-inline: auto; }
          a { color: #58a6ff; text-decoration: none; }
        </style>
      </head>
      <body>
        <h1>🧠 GPT-5 Web Search Test</h1>
        <form method="get" action="/api/webcheck-ui">
          <input type="text" name="q" placeholder="Scrie o întrebare..." value="${query}" />
          <br><button type="submit">Analizează</button>
        </form>

        <div style="margin-top:2rem;">
          <p class="ok">✅ Web search funcțional!</p>
          <p><strong>Întrebare:</strong> ${query}</p>
          <p><strong>Răspuns:</strong> ${text}</p>
          ${
            sources.length
              ? `<div class="sources"><strong>🔗 Surse:</strong><ul>${sources
                  .map((u) => `<li><a href="${u}" target="_blank">${u}</a></li>`)
                  .join("")}</ul></div>`
              : `<p class="err">⚠️ Fără surse citate (posibil răspuns din modelul intern).</p>`
          }
        </div>
      </body>
      </html>
    `;

    res.status(200).send(html);
  } catch (error) {
    console.error("❌ Eroare:", error.message);

    const html = `
      <html><body style="background:#0d1117;color:#ff3b3b;font-family:Segoe UI;text-align:center;padding:2rem">
        <h1>❌ Eroare API</h1>
        <p>${error.message}</p>
      </body></html>
    `;
    res.status(500).send(html);
  }
}
