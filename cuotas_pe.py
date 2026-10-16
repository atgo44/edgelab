"""Cuotas de casas peruanas para la Liga 1.

Casas:
  - Betano (betano.pe): endpoint JSON público de la propia web, funciona sin sesión.
  - Apuesta Total: protegida por Cloudflare (desafío anti-bot). No se evade: no incluida.
  - Inkabet: sportsbook embebido sin API pública accesible. No incluida.

Uso:  python cuotas_pe.py     -> guarda odds/peru_odds.json (úsalo desde una IP de Perú)
El pipeline (export.py) intenta la descarga en vivo y, si falla (p. ej. bloqueo geográfico en la nube),
recurre al último archivo guardado si no es muy antiguo.
"""
import difflib
import json
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

ARCHIVO = Path(__file__).parent / "odds" / "peru_odds.json"
BETANO = "https://www.betano.pe/api/sports/FOOT/hot/trending/leagues/17079/events"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
MAX_EDAD_H = 3
REPO = __import__('os').environ.get('GITHUB_REPOSITORY', 'atgo44/edgelab')
RAW = f'https://raw.githubusercontent.com/{REPO}/odds-data/peru_odds.json'
ALIAS = {"utc cajamarca": "UTC", "utc": "UTC", "universitario deportes": "Universitario",
         "adc juan pablo ii college": "Juan Pablo II", "juan pablo ii college": "Juan Pablo II",
         "cd moquegua": "Deportivo Moquegua", "moquegua": "Deportivo Moquegua",
         "los chankas cyc": "Los Chankas", "asociacion deportiva tarma": "ADT",
         "club cienciano": "Cienciano del Cusco", "fbc melgar": "Melgar"}
STOP = {"fc", "de", "del", "association", "asociacion", "club", "cd", "ca", "sc", "cf"}
TIPOS = {"MRES": "1X2", "HCTG": "goles", "OUH1": "goles1t", "CNOU": "corners", "TCOU": "tarjetas", "BTSC": "btts"}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return " ".join(t for t in s.split() if t not in STOP)


def equipo(nombre: str, conocidos) -> str | None:
    n = _norm(nombre)
    if n in ALIAS:
        return ALIAS[n]
    mejor, r = None, 0.0
    for c in conocidos:
        x = difflib.SequenceMatcher(None, n, _norm(c)).ratio()
        if x > r:
            mejor, r = c, x
    return mejor if r >= 0.75 else None


def _parse_evento(e: dict) -> dict | None:
    mk = {}
    home = away = None
    for m in e.get("markets", []):
        k = TIPOS.get(m.get("type"))
        if not k or k in mk:
            continue
        sel = m.get("selections", [])
        if k == "1X2":
            d = {s["name"]: s["price"] for s in sel if s["name"] in ("1", "X", "2")}
            if len(d) == 3:
                mk[k] = d
                for s in sel:
                    if s["name"] == "1":
                        home = s.get("fullName")
                    if s["name"] == "2":
                        away = s.get("fullName")
        elif k == "btts":
            si = next((s["price"] for s in sel if s["name"].lower().startswith("s")), None)
            no = next((s["price"] for s in sel if s["name"].lower() == "no"), None)
            if si and no:
                mk[k] = {"si": si, "no": no}
        else:
            o = next((s["price"] for s in sel if "menos" not in s["name"].lower()), None)
            u = next((s["price"] for s in sel if "menos" in s["name"].lower()), None)
            if o and u and m.get("handicap"):
                mk[k] = {"l": float(m["handicap"]), "o": o, "u": u}
    if "1X2" not in mk or not home or not away:
        return None
    ts = pd.Timestamp(e["startTime"], unit="ms") + pd.Timedelta(hours=-5)
    return {"casa": "Betano", "home": home, "away": away, "fecha": ts.strftime("%Y-%m-%d"),
            "hora": ts.strftime("%H:%M"), "m": mk}


def descargar_betano() -> list:
    r = requests.get(BETANO, params={"req": "s,stnf,c,mb"}, timeout=30,
                     headers={"User-Agent": UA, "Accept": "application/json"})
    r.raise_for_status()
    evs = r.json()["data"]["events"]
    return [x for x in (_parse_evento(e) for e in evs) if x]


def cargar() -> list:
    """Cuotas en vivo si es posible; si no, el último archivo guardado (si es reciente)."""
    try:
        evs = descargar_betano()
        if evs:
            ARCHIVO.parent.mkdir(exist_ok=True)
            ARCHIVO.write_text(json.dumps({"generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                           "eventos": evs}, ensure_ascii=False, indent=1), encoding="utf-8")
            return evs
    except Exception as ex:
        print(f"  Betano en vivo no disponible: {ex}")
    if ARCHIVO.exists():
        j = json.loads(ARCHIVO.read_text(encoding="utf-8"))
        edad = (datetime.now(timezone.utc) - datetime.fromisoformat(j["generado"])).total_seconds() / 3600
        if edad <= MAX_EDAD_H:
            print(f"  usando cuotas guardadas ({edad:.1f} h)")
            return j["eventos"]
        print(f"  cuotas guardadas demasiado antiguas ({edad:.0f} h): se ignoran")
    try:  # cuotas publicadas desde un equipo con IP de Perú (la nube no puede leer Betano)
        r = requests.get(RAW, timeout=20)
        if r.ok:
            j = r.json()
            edad = (datetime.now(timezone.utc) - datetime.fromisoformat(j['generado'])).total_seconds() / 3600
            if edad <= MAX_EDAD_H:
                print(f"  usando cuotas publicadas desde Perú ({edad * 60:.0f} min)")
                return j['eventos']
            print(f"  cuotas publicadas demasiado antiguas ({edad:.1f} h)")
    except Exception as ex:
        print(f"  sin cuotas publicadas: {ex}")
    return []


def emparejar(eventos: list, equipos) -> dict:
    """{(home, away): evento} con los nombres de equipo de ESPN."""
    out = {}
    for e in eventos:
        h, a = equipo(e["home"], equipos), equipo(e["away"], equipos)
        if h and a:
            out[(h, a)] = e
        else:
            print(f"  sin emparejar: {e['home']} - {e['away']}")
    return out


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ev = cargar()
    print(f"{len(ev)} partidos con cuotas de Betano")
    for e in ev:
        print(f"  {e['fecha']} {e['hora']} {e['home']} - {e['away']}: {list(e['m'])}")
