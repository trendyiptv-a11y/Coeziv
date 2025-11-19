from pathlib import Path
import json
from datetime import datetime, timezone

REPO_ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = REPO_ROOT / "data" / "btc_daily.csv"
JSON_PATH = REPO_ROOT / "btc_ohlc.json"

def main():
    if not CSV_PATH.exists():
        raise SystemExit(f"Nu găsesc fișierul CSV: {CSV_PATH}")

    lines = CSV_PATH.read_text(encoding="utf-8").splitlines()
    if not lines:
        raise SystemExit("CSV gol.")

    # 1) header + delimitator
    header_line = lines[0].lstrip("\ufeff").strip()  # scoatem BOM dacă există
    delimiter = ";" if ";" in header_line else ","
    headers = [h.strip() for h in header_line.split(delimiter)]

    # ne asigurăm că avem exact ce vedem și în GitHub preview
    expected = ["date", "open", "high", "low", "close"]
    if headers != expected:
        raise SystemExit(f"Header așteptat: {expected}, dar am găsit: {headers}")

    rows = []
    for line in lines[1:]:
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split(delimiter)]
        if len(parts) != len(headers):
            # rând ciudat, îl sărim
            continue

        rec = dict(zip(headers, parts))

        # parse date
        try:
            dt = datetime.strptime(rec["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        ts = int(dt.timestamp() * 1000)

        try:
            o = float(rec["open"])
            h = float(rec["high"])
            l = float(rec["low"])
            c = float(rec["close"])
        except ValueError:
            continue

        rows.append({
            "timestamp": ts,
            "open": o,
            "high": h,
            "low": l,
            "close": c,
            "volume": 0.0,  # nu avem volum în CSV, punem 0 ca placeholder
        })

    rows.sort(key=lambda x: x["timestamp"])

    JSON_PATH.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"Scris {len(rows)} lumânări în {JSON_PATH}")

if __name__ == "__main__":
    main()
