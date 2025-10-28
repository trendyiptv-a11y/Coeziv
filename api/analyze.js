import fs from "fs";
import path from "path";

const CACHE_FILE = path.join("/tmp", "cache.json");
let memoryCache = {};

// 🔹 Încarcă memoria persistentă (dacă există)
try {
  if (fs.existsSync(CACHE_FILE)) {
    const data = fs.readFileSync(CACHE_FILE, "utf8");
    memoryCache = JSON.parse(data || "{}");
    console.log("🧠 Memorie Coezivă reactivată:", Object.keys(memoryCache).length, "intrări");
  }
} catch (err) {
  console.warn("⚠️ Nu s-a putut citi cache-ul:", err.message);
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { text } = req.body;
    if (!text || text.trim() === "")
      return res.status(400).json({ error: "Text missing" });

    const cleanText = text.trim().toLowerCase();

    // ✅ 1. Verificare memorie
    if (memoryCache[cleanText]) {
      console.log("♻️ Cache hit:", cleanText);
      return res.status(200).json({
        ...memoryCache[cleanText],
        cached: true,
        message: "♻️ Răspuns servit din memorie persistentă Coezivă"
      });
    }

    console.log("🧠 Cache miss:", cleanText);

    // ✅ 2. Clasificare logică
    const type = detectType(cleanText);

    const scoreMap = {
      logică: 3.14,
      factuală: 3.14,
      medicală: 2.86,
      filosofică: 2.00,
      opinie: 1.57,
      neclară: 0.0
    };

    const explanations = {
      logică: `Afirmația „${text}” este o propoziție logică/matematică.`,
      factuală: `Afirmația „${text}” exprimă un fapt verificabil prin surse publice.`,
      medicală: `Afirmația „${text}” face referire la sănătate și necesită verificare științifică.`,
      filosofică: `Afirmația „${text}” conține concepte spirituale sau morale.`,
      opinie: `Afirmația „${text}” este o părere personală.`,
      neclară: `Afirmația „${text}” nu are context clar.`
    };

    let score = 0;
    if (type === "logică" && /[0-9=]/.test(text)) score = 3.14;
    else if (type === "factuală") score = 2.8;
    else if (type === "medicală") score = 2.6;
    else if (type === "filosofică") score = 1.4;
    else if (type === "opinie") score = 1.2;

    // ✅ 3. Căutare Serper (doar factual/medical)
    let sources = [];
    if (["factuală", "medicală"].includes(type)) {
      const serper = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": process.env.SERPER_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ q: text, gl: "ro", hl: "ro", num: 10 })
      });
      const result = await serper.json();
      if (result.organic && Array.isArray(result.organic)) {
        sources = result.organic
          .slice(0, 5)
          .filter(r => r.title && !r.title.toLowerCase().includes("cookie"))
          .map(r => ({
            title: r.title,
            link: r.link,
            snippet: (r.snippet || "").slice(0, 160) + "..."
          }));
      }
    }

    // ✅ 4. Construim răspunsul
    const response = {
      type,
      tipIcon: getIcon(type),
      color: getColor(type),
      verdict: getVerdict(type),
      score: score.toFixed(2),
      maxScore: scoreMap[type],
      explanation: explanations[type],
      sources,
      cached: false,
      message: "Analiză proaspătă generată de Motorul Coeziv 3.14Δ"
    };

    // ✅ 5. Salvăm în memorie + pe disc
    memoryCache[cleanText] = response;
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(memoryCache, null, 2));
      console.log("💾 Cache actualizat:", cleanText);
    } catch (err) {
      console.warn("⚠️ Eroare la scriere cache:", err.message);
    }

    res.status(200).json(response);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// 🔹 Funcții auxiliare
function detectType(text) {
  if (/^[0-9+\-*/=<> ]+$/.test(text)) return "logică";
  if (hasAny(text, ["lege","guvern","parlament","pensii","fotbal","președinte","istoric"])) return "factuală";
  if (hasAny(text, ["covid","virus","boal","tratament","doctor","spital"])) return "medicală";
  if (hasAny(text, ["dumnezeu","suflet","spirit","viață","moral","conștiință"])) return "filosofică";
  if (hasAny(text, ["cred","părere","poate","ar putea"])) return "opinie";
  return "neclară";
}

function hasAny(text, arr) { return arr.some(w => text.includes(w)); }

function getColor(t){
  return {logică:"#00ffb7",factuală:"#00aaff",medicală:"#00ffff",
          filosofică:"#ffd000",opinie:"#ff8800",neclară:"#888"}[t];
}
function getIcon(t){
  return {logică:"🧮",factuală:"📰",medicală:"💉",
          filosofică:"☯️",opinie:"💬",neclară:"❓"}[t];
}
function getVerdict(t){
  return {logică:"adevărată logic",factuală:"verificabilă factual",
          medicală:"susceptibilă de verificare științifică",
          filosofică:"interpretabilă",opinie:"subiectivă",neclară:"neclară"}[t];
}
