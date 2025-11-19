#!/usr/bin/env python3
import csv
import json
import time
from datetime import datetime, timezone
from urllib import request, parse, error
from pathlib import Path

# ---------------------------------------
# Config
# ---------------------------------------
SYMBOL = "BTCUSDT"
INTERVAL = "1d"
LIMIT = 1000  # maxim permis de Binance
# Pornim "din trecut", Binance va ignora perioada fără date
START_TIMESTAMP_MS = int(datetime(2010, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)

API_URL = "https://api.binance.com/api/v3/klines"

OUT_PATH = Path("data") / "btc_daily.csv"


def fetch_klines(symbol: str, interval: str, start_time_ms: int, limit: int = 1000):
    """
    Ia un batch de candlestick-uri de la Binance.
    Returnează lista de rânduri brute (list of lists).
    """
    params = {
        "symbol": symbol,
        "interval": interval,
        "limit": limit,
        "startTime": start_time_ms,
    }
    url = API_URL + "?" + parse.urlencode(params)

    for attempt in range(5):
        try:
            with request.urlopen(url, timeout=20) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"Binance HTTP {resp.status}")
                data = resp.read().decode("utf-8")
                klines = json.loads(data)
                if not isinstance(klines, list):
                    raise RuntimeError(f"Format neașteptat: {klines}")
                return klines
        except Exception as e:
            print(f"[WARN] Eroare la fetch (încercarea {attempt+1}/5): {e}")
            time.sleep(2)

    raise RuntimeError("Nu am reușit să iau date de la Binance după 5 încercări.")


def ms_to_date(ms: int) -> str:
    return datetime.utcfromtimestamp(ms / 1000).strftime("%Y-%m-%d")


def main():
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    all_rows = []

    start = START_TIMESTAMP_MS
    print(f"[INFO] Încep descărcarea BTCUSDT {INTERVAL} de la {ms_to_date(start)}...")

    while True:
        klines = fetch_klines(SYMBOL, INTERVAL, start, LIMIT)
        if not klines:
            print("[INFO] Nu am mai primit date, mă opresc.")
            break

        print(f"[INFO] Batch cu {len(klines)} lumânări, de la {ms_to_date(klines[0][0])} "
              f"până la {ms_to_date(klines[-1][0])}")

        for k in klines:
            open_time = k[0]  # ms
            open_price = float(k[1])
            high_price = float(k[2])
            low_price = float(k[3])
            close_price = float(k[4])
            volume = float(k[5])

            all_rows.append({
                "date": ms_to_date(open_time),
                "open": open_price,
                "high": high_price,
                "low": low_price,
                "close": close_price,
                "volume": volume,
            })

        # Pregătim următorul batch
        last_open_time = klines[-1][0]
        # +1 ms ca să nu repetăm ultima lumânare
        start = last_open_time + 1

        # Mică pauză ca să nu spamăm API-ul
        time.sleep(0.3)

        # Safety: dacă suntem foarte aproape de prezent, ieșim
        now_ms = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
        if start >= now_ms:
            print("[INFO] Am ajuns la zi, mă opresc.")
            break

    if not all_rows:
        raise RuntimeError("Nu am primit niciun rând de la Binance. Verifică simbolul / API-ul.")

    # Eliminăm eventualele duplicate după dată (dacă apar)
    dedup = {}
    for row in all_rows:
        dedup[row["date"]] = row
    final_rows = [dedup[d] for d in sorted(dedup.keys())]

    print(f"[INFO] Scriu {len(final_rows)} rânduri în {OUT_PATH} ...")

    with OUT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["date", "open", "high", "low", "close", "volume"]
        )
        writer.writeheader()
        for r in final_rows:
            writer.writerow(r)

    print("[INFO] Gata, CSV actualizat.")


if __name__ == "__main__":
    main()
