import store from "./tv-store.js";

function makeCode(length = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const playlistText = String(body.playlistText || "").trim();

    if (!playlistText) {
      return res.status(400).json({ error: "Missing playlistText" });
    }

    let code = makeCode();
    while (store.has(code)) {
      code = makeCode();
    }

    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minute
    store.set(code, {
      playlistText,
      expiresAt,
      used: false
    });

    return res.status(200).json({
      ok: true,
      code,
      expiresInMinutes: 10
    });
  } catch (err) {
    return res.status(500).json({ error: "Could not create TV code" });
  }
}
