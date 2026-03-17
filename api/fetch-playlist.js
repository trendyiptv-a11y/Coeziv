export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const url = String(body.url || "").trim();

    if (!url) {
      return res.status(400).json({ ok: false, error: "Lipsește URL-ul playlistului." });
    }

    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ ok: false, error: "URL invalid. Sunt acceptate doar http și https." });
    }

    const upstream = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 CoezivPlayer/1.0",
        "Accept": "text/plain, application/vnd.apple.mpegurl, application/x-mpegURL, */*"
      }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        ok: false,
        error: "Nu am putut încărca playlistul de la sursă."
      });
    }

    const text = await upstream.text();

    return res.status(200).json({
      ok: true,
      text: text
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Eroare la preluarea playlistului."
    });
  }
}
