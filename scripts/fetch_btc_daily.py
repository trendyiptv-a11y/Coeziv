#!/usr/bin/env python3
import csv
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib import request

OUT_PATH = Path("data") / "btc_daily.csv"
START_TS = 1293840000  # 2011-01-01 aproximativ


def fetch_json(url: str):
    req = request.Request(
        url,
        headers={
            "User-Agent": "Cohesiv-BTC-Monitor/1.0",
            "Accept": "application/json",
        },
    )
    with request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_cryptocompare_batch(to_ts: int):
    url = (
        "https://min-api.cryptocompare.com/data/v2/histoday"
        f"?fsym=BTC&tsym=USD&limit=2000&toTs={to_ts}"
    )
    data = fetch_json(url)
    if data.get("Response") != "Success":
        raise RuntimeError(data)
    return data["Data"]["Data"]


def cryptocompare_full_history():
    print("[INFO] Fetch CryptoCompare full history...")
    all_rows = []
    to_ts = int(time.time())

    while True:
        batch = fetch_cryptocompare_batch(to_ts)
        if not batch:
            break

        print(
            f"[INFO] CryptoCompare batch: {len(batch)} zile, până la "
            f"{datetime.fromtimestamp(batch[0]['time'], timezone.utc).strftime('%Y-%m-%d')}"
        )

        for k in batch:
            if k.get("open") == 0:
                continue
            all_rows.append({
                "date": datetime.fromtimestamp(k["time"], timezone.utc).strftime("%Y-%m-%d"),
                "open": float(k["open"]),
                "high": float(k["high"]),
                "low": float(k["low"]),
                "close": float(k["close"]),
                "volume": float(k.get("volumefrom", 0)),
            })

        oldest_ts = batch[0]["time"]
        if oldest_ts < START_TS:
            break
        to_ts = oldest_ts - 86400
        time.sleep(0.2)

    return all_rows


def kraken_recent_daily():
    print("[INFO] Fetch Kraken public recent daily candles fallback...")
    url = "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440"
    data = fetch_json(url)
    if data.get("error"):
        raise RuntimeError(data.get("error"))

    result = data.get("result", {})
    pair_key = next((k for k in result.keys() if k != "last"), None)
    if not pair_key:
        raise RuntimeError("Kraken response does not contain OHLC data")

    rows = []
    for item in result[pair_key]:
        # Kraken OHLC: time, open, high, low, close, vwap, volume, count
        ts = int(float(item[0]))
        rows.append({
            "date": datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d"),
            "open": float(item[1]),
            "high": float(item[2]),
            "low": float(item[3]),
            "close": float(item[4]),
            "volume": float(item[6]),
        })

    print(
        f"[INFO] Kraken recent rows: {len(rows)}, "
        f"latest={rows[-1]['date'] if rows else 'n/a'} "
        f"close={rows[-1]['close'] if rows else 'n/a'}"
    )
    return rows


def load_existing_rows():
    if not OUT_PATH.exists():
        return []
    rows = []
    with OUT_PATH.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            try:
                rows.append({
                    "date": r["date"],
                    "open": float(r["open"]),
                    "high": float(r["high"]),
                    "low": float(r["low"]),
                    "close": float(r["close"]),
                    "volume": float(r.get("volume", 0) or 0),
                })
            except Exception:
                continue
    return rows


def merge_rows(existing, fresh):
    by_date = {r["date"]: r for r in existing}
    for r in fresh:
        by_date[r["date"]] = r
    return [by_date[d] for d in sorted(by_date.keys())]


def write_rows(rows):
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    rows.sort(key=lambda r: r["date"])
    with OUT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["date", "open", "high", "low", "close", "volume"])
        writer.writeheader()
        for r in rows:
            writer.writerow(r)
    print(f"[INFO] Total zile: {len(rows)}")
    print(f"[INFO] Scris în {OUT_PATH}")


def main():
    existing = load_existing_rows()
    try:
        fresh = cryptocompare_full_history()
        if not fresh:
            raise RuntimeError("CryptoCompare returned no rows")
        final_rows = fresh
        print("[OK] CryptoCompare source used.")
    except Exception as exc:
        print(f"[WARN] CryptoCompare failed: {exc}")
        try:
            fresh = kraken_recent_daily()
            if not fresh:
                raise RuntimeError("Kraken returned no rows")
            final_rows = merge_rows(existing, fresh)
            print("[OK] Kraken fallback used and merged with existing CSV.")
        except Exception as exc2:
            print(f"[WARN] Kraken fallback failed: {exc2}")
            if existing:
                final_rows = existing
                print("[WARN] All live sources failed. Keeping existing data/btc_daily.csv.")
            else:
                raise RuntimeError("All BTC data sources failed and no existing CSV is available") from exc2

    write_rows(final_rows)


if __name__ == "__main__":
    main()
