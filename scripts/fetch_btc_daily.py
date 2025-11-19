import csv
import urllib.request

# Alege sursa:
#  - Binance_BTCUSDT_d.csv  -> date din 2017 până azi (USDT)
#  - Bitstamp_BTCUSD_d.csv  -> date ~din 2011 până azi (USD)

SRC_URL = "https://www.cryptodatadownload.com/cdd/Bitstamp_BTCUSD_d.csv"
OUT_PATH = "data/btc_daily.csv"


def download_text(url: str) -> list[str]:
    """Descarcă fișierul CSV ca listă de linii (stringuri)."""
    with urllib.request.urlopen(url) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return raw.splitlines()


def main() -> None:
    print(f"Descarc date BTC de la: {SRC_URL}")
    lines = download_text(SRC_URL)

    # CryptoDataDownload pune câteva linii de comentariu la început (# ...)
    data_lines = [ln for ln in lines if not ln.startswith("#") and ln.strip()]

    reader = csv.DictReader(data_lines)

    # Datele sunt în ordine inversă (cel mai nou → cel mai vechi)
    rows = list(reader)
    rows.reverse()

    # Scriem în formatul tău obișnuit:
    # date,open,high,low,close,volume
    with open(OUT_PATH, "w", newline="") as f_out:
        writer = csv.writer(f_out)
        writer.writerow(["date", "open", "high", "low", "close", "volume"])

        for r in rows:
            # Coloanele din CryptoDataDownload:
            # unix, date, symbol, open, high, low, close, Volume BTC, Volume USD/USDT, tradecount
            date = r.get("date") or r.get("Date")
            open_ = r.get("open") or r.get("Open")
            high = r.get("high") or r.get("High")
            low = r.get("low") or r.get("Low")
            close = r.get("close") or r.get("Close")
            volume_btc = r.get("Volume BTC") or r.get("Volume.BTC")

            if not date:
                # sărim orice linie ciudată
                continue

            writer.writerow([date, open_, high, low, close, volume_btc])

    print(f"Gata. Am scris CSV în: {OUT_PATH}")


if __name__ == "__main__":
    main()
