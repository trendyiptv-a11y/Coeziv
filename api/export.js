import fs from "fs";
import path from "path";

const CACHE_FILE = path.join("/tmp", "cache.json");

export default async function handler(req, res) {
  try {
    // Permitem doar metoda GET
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Metodă neacceptată. Folosește GET." });
    }

    // Verificăm dacă fișierul de cache există
    if (!fs.existsSync(CACHE_FILE)) {
      return res.status(404).json({
        error: "Nu există memorie Coezivă salvată.",
        message: "Motorul nu a efectuat încă nicio analiză."
      });
    }

    // Citim conținutul memoriei persistente
    const rawData = fs.readFileSync(CACHE_FILE, "utf8");
    const cacheData = JSON.parse(rawData || "{}");

    // Optional: filtrare după tip (ex: ?type=factuală)
    const { type } = req.query;
    const filtered = type
      ? Object.fromEntries(
          Object.entries(cacheData).filter(([_, v]) => v.type === type)
        )
      : cacheData;

    // Header pentru descărcare JSON
    res.setHeader("Content-Disposition", "attachment; filename=memorie_coezivă.json");
    res.setHeader("Content-Type", "application/json");

    // Returnăm fișierul
    res.status(200).json(filtered);

  } catch (error) {
    res.status(500).json({ error: "Eroare la export", details: error.message });
  }
}
