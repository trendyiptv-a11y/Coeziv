import store from "./tv-store.js";

function cleanupExpired() {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (!value || !value.expiresAt || now > value.expiresAt) {
      store.delete(key);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    cleanupExpired();

    const body = req.body || {};
    const code = String(body.code || "").trim().toUpperCase();

    if (!code) {
      return res.status(400).json({
        ok: false,
        error: "Missing code"
      });
    }

    const record = store.get(code);

    if (!record) {
      return res.status(404).json({
        ok: false,
        error: "Code not found"
      });
    }

    if (Date.now() > record.expiresAt) {
      store.delete(code);
      return res.status(410).json({
        ok: false,
        error: "Code expired"
      });
    }

    return res.status(200).json({
      ok: true,
      playlistText: record.playlistText
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Could not load TV code"
    });
  }
}
