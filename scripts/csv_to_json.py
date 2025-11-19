import csv
import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = REPO_ROOT / "data" / "btc_daily.csv"
JSON_PATH = REPO_ROOT / "btc_ohlc.json"

def main():
    if not CSV_PATH.exists():
        raise SystemExit(f"Nu găsesc fișierul CSV: {CSV_PATH}")

    rows = []
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        expected = ["date", "open", "high", "low", "close"]
        if reader.fieldnames != expected:
            raise SystemExit(f"Header așteptat: {expected}, dar am găsit: {reader.fieldnames}")

        for r in reader:
            if not r["date"].strip():
                continue

            dt = datetime.strptime(r["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            ts = int(dt.timestamp() * 1000)

            rows.append({
                "timestamp": ts,
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
                "volume": 0.0,   # nu ai volum în CSV, punem 0 ca placeholder
            })

    rows.sort(key=lambda x: x["timestamp"])

    with JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)

    print(f"Scris {len(rows)} lumânări în {JSON_PATH}")

if __name__ == "__main__":
    main()
