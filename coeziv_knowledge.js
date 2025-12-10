// coeziv_knowledge.js
// CoezivKnowledge – RAG simplu peste fișierele HTML ale Modelului Coeziv

import fs from "fs";
import path from "path";

let KNOWLEDGE_CACHE = null;

function loadKnowledge() {
  if (KNOWLEDGE_CACHE) return KNOWLEDGE_CACHE;

  const baseDir = process.cwd(); // rădăcina proiectului pe Vercel
  const knowledgeDir = path.join(baseDir, "knowledge");

  const files = [
    {
      id: "baza",
      title: "Modelul Coeziv – Bază",
      filename: "model_coeziv_baza.html",
    },
    {
      id: "extins",
      title: "Modelul Coeziv – Extins",
      filename: "model_coeziv_extins.html",
    },
    {
      id: "extra",
      title: "Modelul Coeziv – Extra",
      filename: "model_coeziv_extra.html",
    },
    {
      id: "v5",
      title: "Modelul Coeziv – v5",
      filename: "model_coeziv_v5.html",
    },
    {
      id: "vocabular",
      title: "Vocabular Coeziv Complex",
      filename: "vocabular_coeziv_complex.html",
    },
  ];

  const docs = [];

  for (const f of files) {
    try {
      const fullPath = path.join(knowledgeDir, f.filename);
      const raw = fs.readFileSync(fullPath, "utf8");

      // curățăm HTML-ul rudimentar → text
      const text = raw
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();

      docs.push({
        id: f.id,
        title: f.title,
        filename: f.filename,
        text,
      });
    } catch (err) {
      console.warn(
        `[CohezivKnowledge] Nu am putut citi fișierul ${f.filename}:`,
        err.message
      );
    }
  }

  KNOWLEDGE_CACHE = docs;
  return KNOWLEDGE_CACHE;
}

/**
 * Sparge textul în segmente mai mici (chunk-uri) pentru scorare.
 */
function chunkText(text, chunkSize = 800, overlap = 150) {
  const chunks = [];
  if (!text) return chunks;

  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const slice = text.slice(start, end).trim();
    if (slice.length > 50) {
      chunks.push(slice);
    }
    if (end === text.length) break;
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
}

/**
 * Scor simplu: număr de apariții ale keyword-urilor în chunk (case-insensitive).
 */
function scoreChunk(chunk, keywords) {
  const lower = chunk.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (!kw) continue;
    const k = kw.toLowerCase().trim();
    if (!k || k.length < 2) continue;
    // scor simplu: +1 dacă apare, +2 dacă apare de mai multe ori
    const regex = new RegExp(`\\b${escapeRegex(k)}\\b`, "gi");
    const matches = lower.match(regex);
    if (matches && matches.length > 0) {
      score += 1 + matches.length * 0.5;
    }
  }
  return score;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Construiește lista de keyword-uri pornind de la întrebarea userului și topicHint.
 */
function buildKeywords(question, topicHint) {
  const combined = (topicHint || "") + " " + (question || "");
  const lower = combined.toLowerCase();

  // scoatem elemente foarte comune
  const stopwords = [
    "si",
    "și",
    "sau",
    "este",
    "e",
    "sunt",
    "un",
    "o",
    "la",
    "in",
    "în",
    "de",
    "despre",
    "cum",
    "ce",
    "care",
    "cand",
    "când",
    "pentru",
    "cu",
    "din",
    "mai",
    "foarte",
    "mult",
    "putin",
    "puțin",
    "modelul",
    "model",
  ];

  const words = lower
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zăîâșț0-9]/gi, ""))
    .filter((w) => w && w.length > 2 && !stopwords.includes(w));

  // deduplicăm, dar păstrăm ordinea
  const seen = new Set();
  const keywords = [];
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      keywords.push(w);
    }
  }

  // dacă nu iese nimic, măcar punem topicHint brut
  if (!keywords.length && topicHint) {
    keywords.push(topicHint.toLowerCase());
  }

  return keywords;
}

/**
 * retrieveCohezivContext – funcția folosită de ask.js
 *
 * @param {string} userMessage – întrebarea actuală
 * @param {string|null} topicHint – hint venit din CoezivEngine (domeniu sau topic concret)
 * @returns {string} – fragmente relevante din baza Coezivă (sau șir gol)
 */
export function retrieveCohezivContext(userMessage, topicHint) {
  const docs = loadKnowledge();
  if (!docs || !docs.length) {
    return "";
  }

  const keywords = buildKeywords(userMessage, topicHint);
  if (!keywords.length) {
    return "";
  }

  const scoredChunks = [];

  for (const doc of docs) {
    const chunks = chunkText(doc.text);
    for (const chunk of chunks) {
      const score = scoreChunk(chunk, keywords);
      if (score > 0) {
        scoredChunks.push({
          docId: doc.id,
          title: doc.title,
          filename: doc.filename,
          text: chunk,
          score,
        });
      }
    }
  }

  if (!scoredChunks.length) {
    return "";
  }

  // sortăm după scor descrescător
  scoredChunks.sort((a, b) => b.score - a.score);

  // luăm top 3–4 fragmente
  const top = scoredChunks.slice(0, 4);

  const out = top
    .map((c, idx) => {
      return `[#${idx + 1} – ${c.title}]\n${c.text}`;
    })
    .join("\n\n---\n\n");

  return out;
}
