"""Resultados casi en vivo de las ligas europeas vía ESPN (football-data.co.uk los publica con horas de retraso).
Reutiliza el lector de eventos de peru.py y empareja los nombres con los de football-data."""
import difflib
import json
import re
import time
import unicodedata

import pandas as pd
import requests

import peru

SLUGS = {"E0": "eng.1", "SP1": "esp.1", "D1": "ger.1", "I1": "ita.1", "F1": "fra.1", "N1": "ned.1", "P1": "por.1"}
ALIAS = {  # nombre ESPN normalizado -> nombre football-data
    "manchester city": "Man City", "manchester united": "Man United", "nottingham forest": "Nott'm Forest",
    "wolverhampton wanderers": "Wolves", "tottenham hotspur": "Tottenham", "newcastle united": "Newcastle",
    "west ham united": "West Ham", "brighton hove albion": "Brighton", "leeds united": "Leeds",
    "atletico madrid": "Ath Madrid", "athletic club": "Ath Bilbao", "real sociedad": "Sociedad",
    "real betis": "Betis", "celta vigo": "Celta", "rayo vallecano": "Vallecano", "deportivo alaves": "Alaves",
    "borussia dortmund": "Dortmund", "bayer leverkusen": "Leverkusen", "eintracht frankfurt": "Ein Frankfurt",
    "borussia monchengladbach": "M'gladbach", "fc koln": "FC Koln", "1 fc koln": "FC Koln",
    "paris saint germain": "Paris SG", "olympique marseille": "Marseille", "olympique lyonnais": "Lyon",
    "inter milan": "Inter", "internazionale": "Inter", "ac milan": "Milan", "as roma": "Roma",
    "sporting cp": "Sp Lisbon", "sporting lisbon": "Sp Lisbon", "benfica": "Benfica",
    "hull city": "Hull", "athletic bilbao": "Ath Bilbao", "stade rennais": "Rennes", "feyenoord rotterdam": "Feyenoord",
    "ajax amsterdam": "Ajax", "psv eindhoven": "PSV Eindhoven", "az alkmaar": "AZ Alkmaar", "stade brestois": "Brest",
    "stade de reims": "Reims", "rc lens": "Lens", "lille osc": "Lille", "as monaco": "Monaco", "ogc nice": "Nice",
    "fc porto": "Porto", "sporting braga": "Sp Braga", "vitoria guimaraes": "Guimaraes", "hellas verona": "Verona",
    "us lecce": "Lecce", "ac monza": "Monza", "torino fc": "Torino", "udinese calcio": "Udinese",
    "west bromwich albion": "West Brom", "sheffield united": "Sheffield United", "leicester city": "Leicester",
    "real valladolid": "Valladolid", "cadiz cf": "Cadiz", "rcd mallorca": "Mallorca", "rcd espanyol": "Espanol",
    "girona fc": "Girona", "getafe cf": "Getafe", "ud las palmas": "Las Palmas", "sevilla fc": "Sevilla",
    "vfl bochum": "Bochum", "vfl wolfsburg": "Wolfsburg", "1 fc heidenheim": "Heidenheim", "fc st pauli": "St Pauli",
    "sv werder bremen": "Werder Bremen", "1 fsv mainz 05": "Mainz", "tsg hoffenheim": "Hoffenheim",
    "sc freiburg": "Freiburg", "fc augsburg": "Augsburg", "sv elversberg": "Elversberg", "hamburg sv": "Hamburg",
    "1 fc union berlin": "Union Berlin", "sc paderborn 07": "Paderborn", "vfb stuttgart": "Stuttgart",
    "fc schalke 04": "Schalke 04", "rb leipzig": "RB Leipzig", "bayern munich": "Bayern Munich",
}


def _n(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return " ".join(t for t in s.split() if t not in {"fc", "cf", "afc", "sc", "club", "de"})


def _map(nombre, conocidos, cache):
    if nombre in cache:
        return cache[nombre]
    n = _n(nombre)
    r = ALIAS.get(n)
    if r is None or r not in conocidos:
        mejor, sc = None, 0.0
        for c in conocidos:
            nc = _n(c)
            x = difflib.SequenceMatcher(None, n, nc).ratio()
            # "hull" ⊂ "hull city", "ajax" ⊂ "ajax amsterdam": un nombre contenido en el otro como palabra completa
            if len(nc) >= 4 and (n.startswith(nc + " ") or n.endswith(" " + nc) or nc.startswith(n + " ") or nc.endswith(" " + n)):
                x = max(x, .9)
            if x > sc:
                mejor, sc = c, x
        r = mejor if sc >= .72 else None
    cache[nombre] = r
    return r


def recientes(div: str, conocidos: set, dias: int = 4) -> list:
    """Partidos terminados en los últimos días, con las mismas columnas que results.json."""
    slug = SLUGS.get(div)
    if not slug:
        return []
    y = pd.Timestamp.today().year
    ev = []
    for año in {y, y - 1}:
        try:
            ev += peru._season(año, max_age_h=0.05, slug=slug)
        except Exception:
            pass
    limite = (pd.Timestamp.today().normalize() - pd.Timedelta(days=dias)).strftime("%Y-%m-%d")
    out, cache = [], {}
    for e in ev:
        try:
            if not e["status"]["type"]["completed"]:
                continue
            r = peru._row(e)
        except Exception:
            continue
        if not r.get("completo"):
            continue
        d = r["Date"].strftime("%Y-%m-%d")
        if d < limite:
            continue
        h, a = _map(r["HomeTeam"], conocidos, cache), _map(r["AwayTeam"], conocidos, cache)
        if not h or not a or h == a:
            continue

        def suma(x, y_):
            return None if r.get(x) is None or r.get(y_) is None or pd.isna(r.get(x)) or pd.isna(r.get(y_)) else float(r[x] + r[y_])
        tarj = None
        if all(k in r and r[k] is not None for k in ("HY", "AY", "HR", "AR")):
            tarj = float(r["HY"] + r["AY"] + r["HR"] + r["AR"])
        out.append({"liga": div, "d": d, "h": h, "a": a, "hg": int(r["FTHG"]), "ag": int(r["FTAG"]),
                    "ht": None if r.get("HTHG") is None else int(r["HTHG"]) + int(r["HTAG"]),
                    "c": suma("HC", "AC"), "t": tarj, "st": suma("HST", "AST"), "s": suma("HS", "AS")})
    return out


def proximos(div: str, conocidos: set, dias: int = 14) -> pd.DataFrame:
    """Partidos programados en los próximos días (ESPN), con los nombres de football-data y hora de Perú."""
    slug = SLUGS.get(div)
    if not slug:
        return pd.DataFrame()
    y = pd.Timestamp.today().year
    ev = []
    for año in {y, y - 1}:
        try:
            ev += peru._season(año, max_age_h=0.05, slug=slug)
        except Exception:
            pass
    hoy = pd.Timestamp.today().normalize()
    out, cache, vistos = [], {}, set()
    for e in ev:
        try:
            row = peru._row(e)
        except Exception:
            continue
        if not row.get("programado"):
            continue
        d = row["Date"]
        if d < hoy - pd.Timedelta(days=1) or d > hoy + pd.Timedelta(days=dias):
            continue
        h, a = _map(row["HomeTeam"], conocidos, cache), _map(row["AwayTeam"], conocidos, cache)
        if not h or not a or h == a or (h, a, d) in vistos:
            continue
        vistos.add((h, a, d))
        out.append({"Date": d, "Time": row["Time"], "HomeTeam": h, "AwayTeam": a, "zona": "lima", "espn_id": row.get("espn_id", "")})
    return pd.DataFrame(out)


def ids_recientes(div: str, conocidos: set, dias: int = 14) -> dict:
    """{(home, away): espn_id} para todos los eventos entre ayer y los próximos días, estén o no empezados.
    Sirve para que un partido que ya está en juego al generar los datos conserve su id (marcador en vivo)."""
    slug = SLUGS.get(div)
    if not slug:
        return {}
    y = pd.Timestamp.today().year
    ev = []
    for año in {y, y - 1}:
        try:
            ev += peru._season(año, max_age_h=0.05, slug=slug)
        except Exception:
            pass
    hoy = pd.Timestamp.today().normalize()
    out, cache = {}, {}
    for e in ev:
        try:
            row = peru._row(e)
        except Exception:
            continue
        d = row["Date"]
        if d < hoy - pd.Timedelta(days=1) or d > hoy + pd.Timedelta(days=dias) or not row.get("espn_id"):
            continue
        h, a = _map(row["HomeTeam"], conocidos, cache), _map(row["AwayTeam"], conocidos, cache)
        if h and a and h != a:
            out[(h, a)] = row["espn_id"]
    return out
