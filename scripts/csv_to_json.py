import csv
import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = REPO_ROOT / "data" / "btc_daily.csv"
JSON_PATH = REPO_ROOT / "btc_ohlc.json"

# Acceptăm multe variante de nume de coloane
CANDIDATES = {
    "date": ["date", "time", "timestamp", "datetime"],
    "open": ["open", "o"],
    "high": ["high", "h"],
    "low": ["low", "l"],
    "close": ["close", "c", "adj close", "adj_close"],
    "volume": ["volume", "vol", "volum"],
}

def find_column(fieldnames, logical_name):
    """Caută cea mai bună potrivire pentru coloana logică (ex. 'open')."""
    fields_lower = [f.strip().lower() for f in fieldnames]
    for candidate in CANDIDATES[logical_name]:
        if candidate in fields_lower:
            idx = fields_lower.index(candidate)
            return fieldnames[idx]
    return None

def main():
    if not CSV_PATH.exists():
        raise SystemExit(f"Nu găsesc fișierul CSV: {CSV_PATH}")

    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise SystemExit("CSV fără header (prima linie).")

        fields = reader.fieldnames

        col_date   = find_column(fields, "date")
        col_open   = find_column(fields, "open")
        col_high   = find_column(fields, "high")
        col_low    = find_column(fields, "low")
        col_close  = find_column(fields, "close")
        col_volume = find_column(fields, "volume")

        missing = [name for name, col in [
            ("date", col_date),
            ("open", col_open),
            ("high", col_high),
            ("low", col_low),
            ("close", col_close),
            ("volume", col_volume),
        ] if col is None]

        if missing:
            raise SystemExit(f"Nu pot găsi coloanele logice: {missing}. "
                             f"Header găsit: {fields}")

        rows = []
        for r in reader:
            raw_date = r[col_date].strip()
            if not raw_date:
                continue

            # încercăm mai multe formate de dată
            parsed = None
            for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d.%m.%Y", "%Y/%m/%d"):
                try:
                    parsed = datetime.strptime(raw_date, fmt)
                    break
                except ValueError:
                    continue
            if not parsed:
                # dacă nu putem parsa, sărim peste rând
                continue

            dt = parsed.replace(tzinfo=timezone.utc)
            ts = int(dt.timestamp() * 1000)

            try:
                rows.append({
                    "timestamp": ts,
                    "open": float(r[col_open]),
                    "high": float(r[col_high]),
                    "low": float(r[col_low]),
                    "close": float(r[col_close]),
                    "volume": float(r[col_volume]),
                })
            except ValueError:
                # dacă o valoare nu e numerică, sărim peste rând
                continue

    rows.sort(key=lambda x: x["timestamp"])

    with JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)

    print(f"Scris {len(rows)} lumânări în {JSON_PATH}")

if __name__ == "__main__":
    main()
