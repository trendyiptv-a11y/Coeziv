import csv
import json
from datetime import datetime, timezone
from pathlib import Path

# configurare căi
REPO_ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = REPO_ROOT / "data" / "btc_daily.csv"
JSON_PATH = REPO_ROOT / "btc_ohlc.json"

# ajustează formatul datei dacă CSV-ul tău e altfel
DATE_FORMAT = "%Y-%m-%d"  # ex: 2024-01-01

def main():
    if not CSV_PATH.exists():
        raise SystemExit(f"Nu găsesc fișierul CSV: {CSV_PATH}")

    rows = []
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        expected_cols = {"date", "open", "high", "low", "close", "volume"}
        missing = expected_cols - set(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"Lipsesc coloane în CSV: {missing}")

        for r in reader:
            if not r["date"].strip():
                continue

            dt = datetime.strptime(r["date"], DATE_FORMAT).replace(tzinfo=timezone.utc)
            ts = int(dt.timestamp() * 1000)

            rows.append({
                "timestamp": ts,
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
                "volume": float(r["volume"]),
            })

    rows.sort(key=lambda x: x["timestamp"])  # asigurăm ordine cronologică

    with JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)

    print(f"Scris {len(rows)} lumânări în {JSON_PATH}")

if __name__ == "__main__":
    main()
