// api/btc.js — variantă BYBIT (recomandată)

export default async function handler(req, res) {
  try {
    const url =
      "https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=D&limit=1000";

    const r = await fetch(url);
    if (!r.ok) {
      return res
        .status(502)
        .json({ error: "Eroare BYBIT: " + r.status + " " + r.statusText });
    }

    const json = await r.json();

    if (!json.result || !json.result.list) {
      return res.status(500).json({ error: "Format invalid BYBIT" });
    }

    const candles = json.result.list.map(c => ({
      timestamp: parseInt(c[0]),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5])
    }));

    res.status(200).json(candles.reverse()); // Bybit trimite invers
  } catch (e) {
    res.status(500).json({ error: "Server error", details: e.message });
  }
}
