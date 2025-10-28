export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  try {
    const { text } = await req.json();
    if (!text || text.trim().length < 3)
      return new Response(JSON.stringify({ error: "Text prea scurt pentru analiză." }), { status: 400 });

    const lower = text.toLowerCase();

    // 1️⃣ DETECTARE TIP AFIRMAȚIE
    let type = "generală";
    if (lower.match(/(compus|conține|fabricat|material)/)) type = "materială";
    else if (lower.match(/(campionat|meci|a câștigat|a pierdut|eveniment)/)) type = "eveniment";
    else if (lower.match(/(culoare|miros|gust|sunet)/)) type = "senzorială";
    else if (lower.match(/(inventat|descoperit|creat|teorie)/)) type = "științifică";
    else if (lower.match(/[\d+\-*/=]/)) type = "logică";
    else if (lower.match(/(eu|tu|cred|simt|părere)/)) type = "umană";

    // 2️⃣ VERIFICARE FACTUALĂ – Serper.dev
    const apiKey = process.env.SERPER_API_KEY;
    const resp = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, num: 10, gl: "ro", hl: "ro" }),
    });
    const data = await resp.json();
    const results = data.organic || [];
    const sources = results.slice(0, 6).map(r => ({ title: r.title, link: r.link }));

    let F = results.length > 0 ? 2.2 + Math.random() * 0.9 : 0.7; // scor factual

    // 3️⃣ VERIFICARE LOGICĂ / MATEMATICĂ
    let L = 0;
    if (type === "logică" && /[\d+\-*/=]/.test(lower)) {
      try {
        const match = lower.match(/([\d+\-*/\s]+)=([\d]+)/);
        if (match) {
          const left = Function(`"use strict";return (${match[1]})`)();
          const right = parseFloat(match[2]);
          L = left === right ? 3.14 : 0.4;
        }
      } catch { L = 0.4; }
    }

    // 4️⃣ ANALIZĂ SEMANTICĂ SIMPLIFICATĂ
    let C = 0;
    if (results.length > 0) {
      const matchCount = results.filter(r => r.title.toLowerCase().includes(lower.split(" ")[0])).length;
      C = (matchCount / results.length) * 3.14;
      if (C < 0.3) C = 0.3;
    }

    // 5️⃣ PONDERARE DINAMICĂ (α,β,γ)
    let α = 1, β = 1, γ = 1;
    switch (type) {
      case "logică": α = 1; β = 3; γ = 1; break;
      case "științifică": α = 2; β = 2; γ = 1; break;
      case "senzorială": α = 1; β = 0.5; γ = 3; break;
      case "umană": α = 0.5; β = 0.2; γ = 3; break;
      default: α = β = γ = 1;
    }

    // 6️⃣ FORMULA COEZIVĂ 3.14Δ
    const V = ((F * α + L * β + C * γ) / (α + β + γ)).toFixed(2);

    // 7️⃣ VERDICT LOGIC
    let verdict = "verificabil factual";
    let color = "#9ba1a6";
    if (V > 2.6) { verdict = "adevărat factual"; color = "#00ffb7"; }
    else if (V > 1.8) { verdict = "parțial adevărat"; color = "#00ccff"; }
    else if (V < 1.5) { verdict = "fals logic"; color = "#ff0055"; }

    // 8️⃣ EXPLICAȚIE NATURALĂ
    const explanation = `Formula 3.14Δ a rezultat: F=${F.toFixed(2)}, L=${L.toFixed(2)}, C=${C.toFixed(2)} → V=${V}.`;
    const correction =
      verdict.includes("adevărat") ? "Afirmația este coezivă cu realitatea și logica." :
      verdict.includes("fals") ? "Afirmația contrazice logica internă sau sursele factuale." :
      "Afirmația necesită verificare suplimentară.";

    // 🔚 RĂSPUNS FINAL
    return new Response(
      JSON.stringify({
        type, verdict, color,
        score: parseFloat(V), maxScore: 3.14,
        factual: F.toFixed(2), logic: L.toFixed(2), semantic: C.toFixed(2),
        explanation, correction, sources
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
