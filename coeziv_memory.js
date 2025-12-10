// coeziv_memory.js
// Coeziv Memory Engine – memorie persistentă (JSON) + conceptuală + "vectorială" simplificată

import fs from "fs";
import path from "path";

// Director în care salvăm fișierele de memorie.
// În producție pe Vercel, pentru persistență reală, ar trebui înlocuit cu un DB (KV, Postgres etc.).
const DATA_DIR = path.join(process.cwd(), "coeziv_data");

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (e) {
    console.warn("Nu pot crea directorul de memorie Coezivă:", e.message);
  }
}

function memoryFilePath(userId) {
  ensureDataDir();
  const safeId = String(userId || "default").replace(/[^a-z0-9_\-]/gi, "_");
  return path.join(DATA_DIR, `memory_${safeId}.json`);
}

// ---------- Utilitare text → "vector" foarte simplu (bag-of-words) ----------

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function textToVector(text) {
  const tokens = tokenize(text);
  const map = {};
  for (const t of tokens) {
    map[t] = (map[t] || 0) + 1;
  }
  return map;
}

function cosineSim(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const k of keys) {
    const va = a[k] || 0;
    const vb = b[k] || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ---------------------- Structura memoriei Coezive ---------------------------

/**
 * Structură de memorie:
 * {
 *   userId,
 *   createdAt,
 *   updatedAt,
 *   pattern: {
 *     style: { concise, detailed, warm, neutral },
 *     coeziv_familiarity, // 0..1
 *     avg_J,              // medie a tensiunii
 *     domains: { economie: count, tehnic: count, ... }
 *   },
 *   vectors: [
 *     {
 *       id,
 *       text,        // un fragment relevant (întrebare + răspuns)
 *       tags: [ ... ],
 *       bow         // bag-of-words simplu
 *     },
 *     ...
 *   ]
 * }
 */

function createEmptyMemory(userId) {
  const now = new Date().toISOString();
  return {
    userId: userId || "default",
    createdAt: now,
    updatedAt: now,
    pattern: {
      style: {
        concise: 0.5,
        detailed: 0.5,
        warm: 0.5,
        neutral: 0.5,
      },
      coeziv_familiarity: 0.0,
      avg_J: null,
      domains: {},
    },
    vectors: [],
  };
}

// ----------------------------- API public ------------------------------------

export function getUserMemory(userId) {
  const file = memoryFilePath(userId);
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw);
      return parsed;
    }
  } catch (e) {
    console.warn("Nu pot încărca memoria Coezivă:", e.message);
  }
  return createEmptyMemory(userId);
}

export function saveUserMemory(memory) {
  if (!memory || !memory.userId) return;
  const file = memoryFilePath(memory.userId);
  try {
    memory.updatedAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(memory, null, 2), "utf8");
  } catch (e) {
    console.warn("Nu pot salva memoria Coezivă:", e.message);
  }
}

/**
 * Actualizează memoria în funcție de o interacțiune user ↔ asistent.
 * @param {Object} params
 *  - userId
 *  - userMessage
 *  - assistantReply
 *  - engine (obiectul returnat de runCoezivEngine – cu j_state, policy, intent, identity_trace)
 */
export function updateMemoryFromInteraction({
  userId,
  userMessage,
  assistantReply,
  engine,
}) {
  const mem = getUserMemory(userId);

  // 1) Actualizare pattern conceptual
  if (engine && engine.j_state) {
    const J = typeof engine.j_state.J === "number" ? engine.j_state.J : null;
    if (J !== null) {
      if (mem.pattern.avg_J == null) mem.pattern.avg_J = J;
      else mem.pattern.avg_J = mem.pattern.avg_J * 0.8 + J * 0.2;
    }
  }

  if (engine && engine.policy && Array.isArray(engine.policy.dominant)) {
    for (const d of engine.policy.dominant) {
      mem.pattern.domains[d] = (mem.pattern.domains[d] || 0) + 1;
    }
  }

  // dacă utilizatorul menționează Modelul Coeziv tot mai des, crește familiaritatea
  const lower = (userMessage || "").toLowerCase();
  const coezivMarkers = ["modelul coeziv", "model coeziv", "coeziv 3.14", "3.14", "homeostazie"];
  if (coezivMarkers.some((m) => lower.includes(m))) {
    mem.pattern.coeziv_familiarity = Math.min(
      1,
      mem.pattern.coeziv_familiarity + 0.05
    );
  }

  // ajustăm puțin stilul în funcție de feedback textual direct
  if (lower.includes("mai detaliat") || lower.includes("explică mai mult")) {
    mem.pattern.style.detailed = Math.min(1, mem.pattern.style.detailed + 0.05);
    mem.pattern.style.concise = Math.max(0, mem.pattern.style.concise - 0.05);
  }
  if (lower.includes("mai pe scurt") || lower.includes("pe scurt")) {
    mem.pattern.style.concise = Math.min(1, mem.pattern.style.concise + 0.05);
    mem.pattern.style.detailed = Math.max(0, mem.pattern.style.detailed - 0.05);
  }

  // 2) Actualizare memorie "vectorială" simplă – stocăm doar unele interacțiuni
  const combined = `${userMessage || ""}\n---\n${assistantReply || ""}`.trim();
  if (combined.length > 40) {
    const bow = textToVector(combined);
    const id = `m_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    mem.vectors.push({
      id,
      text: combined,
      tags: engine && engine.policy && engine.policy.dominant
        ? engine.policy.dominant
        : [],
      bow,
    });

    // limităm numărul de fragmente ca să nu crească la infinit
    if (mem.vectors.length > 200) {
      mem.vectors = mem.vectors.slice(mem.vectors.length - 200);
    }
  }

  saveUserMemory(mem);
  return mem;
}

/**
 * Returnează context din memorie pentru un query nou:
 * - un mic rezumat conceptual (pattern)
 * - câteva fragmente similare
 */
export function retrieveMemoryContext({ userId, query, maxItems = 4 }) {
  const mem = getUserMemory(userId);
  const summaryParts = [];

  // Rezumat conceptual
  const pf = mem.pattern;
  if (pf) {
    const styleHints = [];
    if (pf.style.detailed > pf.style.concise + 0.1) styleHints.push("preferință: explicații detaliate");
    if (pf.style.concise > pf.style.detailed + 0.1) styleHints.push("preferință: răspunsuri concise");
    if (pf.style.warm > 0.6) styleHints.push("preferință: ton cald");
    if (pf.style.neutral > 0.6) styleHints.push("preferință: ton mai neutru");

    const domainsSorted = Object.entries(pf.domains || {}).sort(
      (a, b) => b[1] - a[1]
    );
    const topDomains = domainsSorted.slice(0, 3).map(([d, _]) => d);

    summaryParts.push(
      `Profil Coeziv: familiaritate cu Modelul Coeziv ≈ ${pf.coeziv_familiarity.toFixed(
        2
      )}, domenii des abordate: ${
        topDomains.length ? topDomains.join(", ") : "încă neclar"
      }.`
    );
    if (pf.avg_J != null) {
      summaryParts.push(`Tensiune medie J observată ≈ ${pf.avg_J.toFixed(2)}.`);
    }
    if (styleHints.length) {
      summaryParts.push(`Observații de stil: ${styleHints.join("; ")}.`);
    }
  }

  // Fragmente similare
  let snippets = [];
  const qBow = textToVector(query || "");
  if (mem.vectors && mem.vectors.length && Object.keys(qBow).length) {
    const scored = mem.vectors.map((v) => ({
      item: v,
      score: cosineSim(qBow, v.bow || {}),
    }));
    scored.sort((a, b) => b.score - a.score);
    snippets = scored
      .filter((x) => x.score > 0.1)
      .slice(0, maxItems)
      .map((x) => ({
        text: x.item.text,
        score: x.score,
        tags: x.item.tags || [],
      }));
  }

  return {
    summary: summaryParts.join(" "),
    snippets,
  };
}
