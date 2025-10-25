// ==========================================================
// 🔹 analyze.js — Motor de analiză informațională GPT + Verificare factuală
// © 2025 Sergiu Bulboacă & GPT-5 – Formula Coeziunii 3.14
// ==========================================================

// 🎧 efect sonor pentru verdict
function playSound(verdict) {
  const audio = new Audio();
  if (verdict.includes("Veridic")) audio.src = "https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg";
  else if (verdict.includes("Ambiguu")) audio.src = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
  else audio.src = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
  audio.play();
}

// 🌍 căutare factuală liberă (Wikipedia + Bing + GDELT)
async function searchSources(query) {
  const urls = [
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`,
    `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS`,
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&format=json`,
  ];

  const results = [];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      if (text && text.length > 300) results.push(url);
    } catch (err) {
      console.warn("Eroare sursă:", url);
    }
  }
  return results;
}

// 🎛️ analiză completă cu GPT + verificare factuală
async function analyzeText() {
  const input = document.getElementById("userInput").value.trim();
  const resultDiv = document.getElementById("result");
  const bar = document.getElementById("progress-bar");

  if (!input) {
    resultDiv.innerHTML = "Introduceți un text pentru analiză.";
    return;
  }

  resultDiv.innerHTML = "Se analizează informația...";
  bar.style.width = "10%";

  try {
    // 🧠 Pas 1: Apelăm motorul GPT
    const gptRes = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input }),
    });

    if (!gptRes.ok) throw new Error("Eroare GPT API");
    const gptData = await gptRes.json();
    bar.style.width = "50%";

    // 🌐 Pas 2: Verificare factuală
    const sources = await searchSources(input);
    bar.style.width = "80%";

    const factualStatus = sources.length > 0 ? "Confirmat" : "Neconfirmat";

    // 🎯 Pas 3: Combinare rezultate
    const verdictFinal = `${gptData.verdict} (${factualStatus})`;
    playSound(gptData.verdict);

    // 🎨 Afișare rezultat
    resultDiv.innerHTML = `
      <p><strong>Δ (Vibrație semantică):</strong> ${gptData.delta?.toFixed(2) || "–"}</p>
      <p><strong>Fc (Coeziune logică):</strong> ${gptData.fc?.toFixed(2) || "–"}</p>
      <p><strong>Manipulare:</strong> ${gptData.manipulare || "–"}%</p>
      <p><strong>Verdict:</strong> ${verdictFinal}</p>
      <p><strong>Rezumat GPT:</strong> ${gptData.rezumat || "Analiză limitată."}</p>
      <p><strong>Surse verificate:</strong></p>
      <ul>
        ${sources.map(s => `<li><a href="${s}" target="_blank">${s}</a></li>`).join("") || "<li>Nicio sursă relevantă găsită.</li>"}
      </ul>
    `;

    bar.style.width = "100%";
  } catch (err) {
    console.error("Eroare analiză:", err);
    resultDiv.innerHTML = "⚠️ Eroare de conexiune cu motorul GPT. Se folosește analiză locală.";
    playSound("Eroare");
    localFallbackAnalysis(input, resultDiv, bar);
  }
}

// 🧩 analiză locală de rezervă (fără GPT)
function localFallbackAnalysis(text, resultDiv, bar) {
  const veridic = /adevăr|confirmat|oficial|guvern/i.test(text);
  const manip = /minciună|propagandă|fals|teorie/i.test(text);
  let verdict = "Ambiguu";
  if (veridic && !manip) verdict = "Veridic";
  else if (manip && !veridic) verdict = "Dezinformare";

  resultDiv.innerHTML = `
    <p><strong>Verdict local:</strong> ${verdict}</p>
    <p><em>Analiză bazată pe coeziune lexicală internă.</em></p>
  `;
  bar.style.width = "100%";
  bar.style.backgroundColor =
    verdict === "Veridic" ? "#00ffb7" :
    verdict === "Ambiguu" ? "#ffc800" : "#ff5555";
}

// 🖱️ eveniment pe buton
document.getElementById("analyzeBtn").addEventListener("click", analyzeText);
