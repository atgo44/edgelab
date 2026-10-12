"""Liga 1 Perú vía el endpoint público no oficial de ESPN (sin clave).
Devuelve DataFrames con el mismo esquema que football-data.co.uk (sin cuotas).
Una llamada por temporada trae todos los partidos con estadísticas de equipo y eventos."""
import json
import time
from pathlib import Path

import pandas as pd
import requests

URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/per.1/scoreboard"
CACHE = Path(__file__).parent / "cache"
UTC_PERU = pd.Timedelta(hours=-5)
STAT = {"wonCorners": "C", "totalShots": "S", "shotsOnTarget": "ST", "foulsCommitted": "F"}


def disponible() -> bool:
    return True


def _season(year: int, max_age_h: float = 3) -> list:
    f = CACHE / f"peru_espn_{year}.json"
    if f.exists() and time.time() - f.stat().st_mtime < max_age_h * 3600:
        return json.loads(f.read_text(encoding="utf-8"))
    r = requests.get(URL, params={"dates": str(year), "limit": 500}, timeout=60,
                     headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    ev = r.json().get("events", [])
    CACHE.mkdir(exist_ok=True)
    f.write_text(json.dumps(ev), encoding="utf-8")
    return ev


def _valor(team, nombre):
    for s in team.get("statistics", []):
        if s.get("name") == nombre:
            try:
                return float(s["displayValue"])
            except (KeyError, ValueError):
                return None
    return None


def _row(e) -> dict:
    c = e["competitions"][0]
    eq = {t["homeAway"]: t for t in c["competitors"]}
    h, a = eq["home"], eq["away"]
    hid, aid = h["team"]["id"], a["team"]["id"]
    ini = pd.Timestamp(e["date"]).tz_localize(None) if pd.Timestamp(e["date"]).tzinfo is None \
        else pd.Timestamp(e["date"]).tz_convert("UTC").tz_localize(None)
    loc = ini + UTC_PERU
    row = {"Date": loc.normalize(), "Time": loc.strftime("%H:%M"), "HomeTeam": h["team"]["displayName"],
           "AwayTeam": a["team"]["displayName"], "completo": bool(e["status"]["type"]["completed"]),
           "programado": e["status"]["type"]["name"] == "STATUS_SCHEDULED"}
    if row["completo"]:
        row["FTHG"], row["FTAG"] = int(h["score"]), int(a["score"])
        for k, n in STAT.items():
            row["H" + n], row["A" + n] = _valor(h, k), _valor(a, k)
        ht = {hid: 0, aid: 0}
        amar = {hid: 0, aid: 0}
        roj = {hid: 0, aid: 0}
        for d in c.get("details") or []:
            tid = (d.get("team") or {}).get("id")
            if tid not in ht:
                continue
            if d.get("scoringPlay"):
                clk = d.get("clock", {})
                primer = clk.get("value", 99999) <= 2700 or "45'+" in clk.get("displayValue", "")
                if primer:
                    ht[tid] += 1
            if d.get("yellowCard"):
                amar[tid] += 1
            if d.get("redCard"):
                roj[tid] += 1
        row.update(HTHG=ht[hid], HTAG=ht[aid], HY=amar[hid], AY=amar[aid], HR=roj[hid], AR=roj[aid])
    return row


def _todo() -> pd.DataFrame:
    y = pd.Timestamp.today().year
    filas = []
    for año in (y, y - 1, y - 2):
        try:
            filas += [_row(e) for e in _season(año)]
        except Exception as ex:
            print(f"  aviso Perú {año}: {ex}")
    d = pd.DataFrame(filas)
    return d.drop_duplicates(subset=["Date", "HomeTeam", "AwayTeam"]) if len(d) else d


def historico() -> pd.DataFrame:
    d = _todo()
    d = d[d.completo].copy()
    d[["FTHG", "FTAG"]] = d[["FTHG", "FTAG"]].astype(int)
    return d.sort_values("Date").reset_index(drop=True)


def proximos() -> pd.DataFrame:
    d = _todo()
    return d[d.programado].sort_values("Date").reset_index(drop=True)
