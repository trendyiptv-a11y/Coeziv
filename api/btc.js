// api/btc.js – BTC OHLC daily din Coinpaprika

export default async function handler(req, res) {
  try {
    // Istoric BTC din 2013 până azi, OHLC daily
    const url =
      "https://api.coinpaprika.com/v1/coins/btc-bitcoin/ohlcv/historical?start=2013-01-01&limit=5000";

    const r = await fetch(url);
    if (!r.ok) {
      return res
        .status(502)
        .json({ error: "Eroare Coinpaprika: " + r.status + " " + r.statusText });
    }

    const data = await r.json();
    if (!Array.isArray(data)) {
      return res.status(500).json({ error: "Date invalide Coinpaprika" });
    }

    // Coinpaprika dă: { time_open, open, high, low, close, volume, ... }
    const candles = data.map(c => ({
      timestamp: new Date(c.time_open).getTime(),  // ms
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume
    }));

    res.status(200).json(candles);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error", details: e.message });
  }
}
