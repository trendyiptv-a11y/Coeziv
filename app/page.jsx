"use client";
import { useState } from "react";

export default function Home() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!text.trim()) return alert("Introdu o afirmație pentru analiză.");
    setLoading(true);
    setResult(null);

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    setResult(data);
    setLoading(false);
  };

  const getVerdictClass = (v) => {
    if (v === "coeziv") return "pulse-green";
    if (v === "parțial") return "pulse-yellow";
    return "pulse-red";
  };

  return (
    <main className="container">
      <h1>Motor Coeziv 3.14Δ</h1>
      <p>Analiză factuală și semantică în timp real</p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Scrie o afirmație pentru verificare..."
      />
      <button onClick={analyze}>{loading ? "Analizăm..." : "Analizează informația"}</button>

      {result && (
        <div className="result">
          <div className={`verdict ${getVerdictClass(result.verdict)}`}>
            {result.verdict === "coeziv"
              ? "🟢 Analiză Coezivă – informația este consistentă factual."
              : result.verdict === "parțial"
              ? "🟡 Analiză parțială – sursele sunt insuficiente sau contradictorii."
              : "🔴 Informație incoerentă – nu se confirmă factual."}
          </div>

          <div className="bar-container">
            <div
              className="bar-fill"
              style={{ width: `${(result.score / 3.14) * 100}%` }}
            ></div>
          </div>

          <div className="score">
            Scor coeziune: {result.score?.toFixed(2)} / 3.14
          </div>
          <div className="interpretation">{result.interpretation}</div>

          <div className="sources">
            {result.sources?.length
              ? result.sources.map((s, i) => (
                  <div key={i} className="source">
                    🔗 <a href={s.link} target="_blank">{s.title}</a>
                  </div>
                ))
              : <p className="warning">⚠️ Nicio sursă relevantă găsită.</p>}
          </div>
        </div>
      )}
    </main>
  );
}
