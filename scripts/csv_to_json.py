from pathlib import Path
import json
from datetime import datetime, timezone

REPO_ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = REPO_ROOT / "data" / "btc_daily.csv"
JSON_PATH = REPO_ROOT / "btc_ohlc.json"

def main():
    if not CSV_PATH.exists():
        raise SystemExit(f"Nu găsesc fișierul CSV: {CSV_PATH}")

    text = CSV_PATH.read_text(encoding="utf-8")
    # împărțim în linii și eliminăm liniile complet goale
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    if len(lines) < 2:
        raise SystemExit("CSV nu conține suficient date.")

    # prima linie = header (nu o mai verificăm)
    header_line = lines[0].lstrip("\ufeff").strip()

    # detectăm delimitatorul pe baza header-ului
    if "," in header_line:
        delim = ","
    elif ";" in header_line:
        delim = ";"
    elif "\t" in header_line:
        delim = "\t"
    else:
        # dacă nu găsim niciun delimitator, presupunem virgulă
        delim = ","

    data_lines = lines[1:]  # restul liniilor = date

    rows = []
    for line in data_lines:
        parts = [p.strip() for p in line.split(delim)]
        if len(parts) < 5:
            continue  # rând incomplet, îl sărim

        date_str, open_str, high_str, low_str, close_str = parts[:5]

        # parse date
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            continue

        ts = int(dt.timestamp() * 1000)

        try:
            o = float(open_str)
            h = float(high_str)
            l = float(low_str)
            c = float(close_str)
        except ValueError:
            continue

        rows.append({
            "timestamp": ts,
            "open": o,
            "high": h,
            "low": l,
            "close": c,
            "volume": 0.0,  # nu avem volum, punem 0 ca placeholder
        })

    rows.sort(key=lambda x: x["timestamp"])

    JSON_PATH.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"Scris {len(rows)} lumânări în {JSON_PATH}")

if __name__ == "__main__":
    main()
