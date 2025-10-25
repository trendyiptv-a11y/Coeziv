// 🔍 analyze.js – Detector de Fake News – Formula Coeziunii 3.14
// Versiune completă: GDELT + Bing RSS + Wikipedia
// © 2025 Sergiu Bulboacă & GPT-5 – Motor Coeziv Informațional

// 🎧 Funcție pentru sunete în funcție de verdict
function playSound(verdict) {
  const audio = new Audio();
  if (verdict.includes("Veridic")) audio.src = "https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg";
  else if (verdict.includes("Ambiguu")) audio.src = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
  else if (verdict.includes("Dezinformare")) audio.src = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
  else audio.src = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
  audio.play();
}

// 🧮 Formula Coeziunii 3.14 + Q + S + Bias + D
function calcFormulaCoeziune(text, matchesCount, sentimentScore) {
  let C_i = 1; // coeziune internă
  let C_e = matchesCount > 0 ? 1 : 0.7; // coeziune externă
  let Q = text.includes("?") ? -0.05 : 0.05;
  let S = sentimentScore >= 0 ? 0.1 : -0.2;
  let Bias = text.match(/(propaganda|manipulare|minciună|hoț|vinovat|ei|noi)/gi) ? -0.1 : 0;
  let D = text.match(/(străini|elite|guvern|popor)/gi) ? -0.05 : 0;
  return (3.14 * (C_i + C_e + Q + S + Bias + D)) / 3;
}

// 🌐 Căutare în sursele libere: Wikipedia, Bing RSS, GDELT
async function searchSources(query) {
  const urls = [
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`,
    `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS`,
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&format=json`
  ];

  const results = [];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      const data = await response.text();
      if (data && data.length > 100) results.push(url);
    } catch (err) {
      console.warn("Eroare sursă:", url);
    }
  }
  return results;
}

// 🔊 Bară de progres + analiză vizuală
function updateProgress(percent, verdict) {
  const bar = document.getElementById("progress-bar");
  if (!bar) return;
  bar.style.width = percent + "%";
  bar.style.backgroundColor =
    verdict.includes("Veridic") ? "#00ffb7" :
    verdict.includes("Ambiguu") ? "#ffc800" :
    verdict.includes("Dezinformare") ? "#ff5555" : "#ff0000";
}

// ⚙️ Funcția principală de analiză
async function analyzeText() {
  const input = document.getElementById("userInput").value.trim();
  const resultDiv = document.getElementById("result");
  const sourcesDiv = document.getElementById("sources");
  const bar = document.getElementById("progress-bar");

  if (!input) {
    resultDiv.innerHTML = "Introduceți un text pentru analiză.";
    return;
  }

  // Reset
  resultDiv.innerHTML = "Se analizează informația...";
  sourcesDiv.innerHTML = "";
  bar.style.width = "10%";

  // 🔄 Cache local
  if (localStorage.getItem(input)) {
    resultDiv.innerHTML = localStorage.getItem(input);
    bar.style.width = "100%";
    return;
  }

  // 🌍 Caută surse
  const sources = await searchSources(input);
  bar.style.width = "60%";

  // 🧠 Simulare analiză semantică (pentru API GPT dacă e activ)
  const matchesCount = sources.length;
  const sentimentScore = input.match(/bine|adevăr|pozitiv/gi) ? 1 : input.match(/rău|minciună|pericol/gi) ? -1 : 0;

  // 🔢 Calculează formula
  const score = calcFormulaCoeziune(input, matchesCount, sentimentScore);

  // 🎯 Verdict
  let verdict = "";
  if (score >= 3.10) verdict = "✅ Veridic";
  else if (score >= 2.90) verdict = "⚠️ Ambiguu";
  else if (score >= 2.50) verdict = "🔴 Dezinformare";
  else verdict = "⛔ Fake news complet";

  updateProgress(score * 30, verdict);
  playSound(verdict);

  // 🧩 Afișează rezultat
  const html = `
    <p><strong>Rezultat analiză:</strong> ${verdict}</p>
    <p><strong>Scor:</strong> ${score.toFixed(2)}</p>
    <p><strong>Surse găsite:</strong></p>
    <ul>${sources.map(src => `<li><a href="${src}" target="_blank">${src}</a></li>`).join("") || "<li>Nicio sursă relevantă găsită.</li>"}</ul>
  `;

  resultDiv.innerHTML = html;
  sourcesDiv.innerHTML = "";
  localStorage.setItem(input, html);
  bar.style.width = "100%";
}

// 🎛️ Eveniment pe buton
document.getElementById("analyzeBtn").addEventListener("click", analyzeText);
