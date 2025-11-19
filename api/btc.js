// api/btc.js

export default async function handler(req, res) {
  try {
    const url =
      "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000";

    const r = await fetch(url);
    if (!r.ok) {
      return res
        .status(502)
        .json({ error: "Eroare Binance: " + r.status + " " + r.statusText });
    }

    const data = await r.json();
    if (!Array.isArray(data)) {
      return res.status(500).json({ error: "Format răspuns Binance invalid" });
    }

    const candles = data.map(c => ({
      timestamp: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5])
    }));

    res.status(200).json(candles);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error", details: e.message });
  }
}
