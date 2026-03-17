import store from "./tv-store.js";

function makeCode(length = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

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
    const playlistText = String(body.playlistText || "").trim();

    if (!playlistText) {
      return res.status(400).json({
        ok: false,
        error: "Missing playlistText"
      });
    }

    let code = makeCode();
    while (store.has(code)) {
      code = makeCode();
    }

    const expiresAt = Date.now() + 10 * 60 * 1000;

    store.set(code, {
      playlistText,
      expiresAt,
      createdAt: Date.now()
    });

    return res.status(200).json({
      ok: true,
      code,
      expiresInMinutes: 10
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Could not create TV code"
    });
  }
}
