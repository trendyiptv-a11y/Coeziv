import store from "./tv-store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const code = String(body.code || "").trim().toUpperCase();

    if (!code) {
      return res.status(400).json({ error: "Missing code" });
    }

    const record = store.get(code);

    if (!record) {
      return res.status(404).json({ error: "Code not found" });
    }

    if (record.used) {
      return res.status(410).json({ error: "Code already used" });
    }

    if (Date.now() > record.expiresAt) {
      store.delete(code);
      return res.status(410).json({ error: "Code expired" });
    }

    record.used = true;
    store.set(code, record);

    return res.status(200).json({
      ok: true,
      playlistText: record.playlistText
    });
  } catch (err) {
    return res.status(500).json({ error: "Could not load TV code" });
  }
}
