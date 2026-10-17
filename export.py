"""Genera los JSON que consume el sitio estático (site/data/*.json).
Uso: python export.py [--dias 10] [--sin-backtest] [--ligas E0 SP1 ... PER]"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

import backtest
import cuotas_pe
import espn_res
import data
import peru
from engine import SEL, _odd
from model import CountModel, DixonColes

sys.stdout.reconfigure(encoding="utf-8")
OUT = Path(__file__).parent / "site" / "data"
HIST = Path(__file__).parent / "cache" / "pred_history.json"
BT_CACHE = Path(__file__).parent / "cache" / "backtest.json"
try:  # resultado del backtest diario; si aún no existe, la copia "semilla" guardada en el repositorio
    _bt_src = BT_CACHE if BT_CACHE.exists() else Path(__file__).parent / "backtest_seed.json"
    BT_PARAMS = json.loads(_bt_src.read_text(encoding="utf-8")) if _bt_src.exists() else {}
except Exception:
    BT_PARAMS = {}
DIAS_HIST = 21
ODDS_COLS = {s: (v[0], v[1]) for s, v in SEL.items()}
# competiciones cuyos datos vienen de ESPN (sin cuotas en los datos gratuitos)
ESPN_COMPS = {"PER": "per.1", "UCL": "uefa.champions", "UEL": "uefa.europa",
              "LIB": "conmebol.libertadores", "SUD": "conmebol.sudamericana"}

# variable -> (columna local, columna visita, nombre)
VARS = {
    "goles1t": ("HTHG", "HTAG", "Goles 1er tiempo"),
    "corners": ("HC", "AC", "Tiros de esquina"),
    "tarjetas": ("HCARD", "ACARD", "Tarjetas (amarillas + rojas)"),
    "tiros_puerta": ("HST", "AST", "Tiros a puerta"),
    "tiros": ("HS", "AS", "Tiros totales"),
    "faltas": ("HF", "AF", "Faltas"),
}
# estadísticas para el contexto: nombre -> (a favor si local, a favor si visita)
CTX = {"gol": ("FTHG", "FTAG"), "gol1t": ("HTHG", "HTAG"), "esq": ("HC", "AC"),
       "tarj": ("HCARD", "ACARD"), "ptas": ("HST", "AST"), "tiros": ("HS", "AS")}


def _n(x):
    return None if x is None or pd.isna(x) else round(float(x), 2)


def preparar(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for side in ("H", "A"):
        if f"{side}Y" in df:
            df[f"{side}CARD"] = df[f"{side}Y"] + df.get(f"{side}R", 0).fillna(0)
    return df


def fila_ctx(r, equipo):
    loc = r.HomeTeam == equipo
    i = 0 if loc else 1
    o = {"d": r.Date.strftime("%Y-%m-%d"), "rival": r.AwayTeam if loc else r.HomeTeam, "loc": "L" if loc else "V"}
    for k, cols in CTX.items():
        fav, con = cols[i], cols[1 - i]
        o[k + "_f"] = _n(getattr(r, fav, np.nan))
        o[k + "_c"] = _n(getattr(r, con, np.nan))
    return o


def _prom_liga(hist):
    """Promedio de la liga por equipo y partido, para comparar tendencias."""
    def m(a, b):
        if a in hist and b in hist:
            v = pd.concat([hist[a], hist[b]]).dropna()
            return float(v.mean()) if len(v) else None
        return None
    return {"ptas": m("HST", "AST"), "esq": m("HC", "AC"), "tarj": m("HCARD", "ACARD"), "tiros": m("HS", "AS")}


def _cuenta(filas, fn):
    v = [fn(f) for f in filas]
    v = [x for x in v if x is not None]
    return sum(v), len(v)


def _media(filas, k):
    v = [f[k] for f in filas if f.get(k) is not None]
    return (sum(v) / len(v)) if len(v) >= 4 else None


def _obs(filas, ambito, liga, racha=False):
    """Tendencias que se repiten en la ventana de partidos. Devuelve lista de observaciones."""
    n = len(filas)
    out = []
    if n < 4:
        return out

    def ge(k, v):
        return lambda f: None if f.get(k) is None else f[k] >= v

    def tot(f):
        return None if f.get("gol_f") is None or f.get("gol_c") is None else f["gol_f"] + f["gol_c"]

    reglas = [
        ("Marcó en el 1er tiempo", ge("gol1t_f", 1), .67, "ataque"),
        ("Recibió gol en el 1er tiempo", ge("gol1t_c", 1), .67, "defensa"),
        ("Iba ganando al descanso", lambda f: None if f.get("gol1t_f") is None else f["gol1t_f"] > f["gol1t_c"], .5, "ataque"),
        ("Marcó gol", ge("gol_f", 1), .83, "ataque"),
        ("No marcó", lambda f: None if f.get("gol_f") is None else f["gol_f"] == 0, .5, "ataque"),
        ("Dejó la portería a cero", lambda f: None if f.get("gol_c") is None else f["gol_c"] == 0, .5, "defensa"),
        ("Recibió tarjetas", ge("tarj_f", 1), .83, "disciplina"),
        ("Recibió 3 o más tarjetas", ge("tarj_f", 3), .5, "disciplina"),
        ("Más de 2.5 goles en el partido", lambda f: None if tot(f) is None else tot(f) >= 3, .67, "goles"),
        ("Menos de 2.5 goles en el partido", lambda f: None if tot(f) is None else tot(f) <= 2, .67, "goles"),
        ("Ambos equipos anotaron", lambda f: None if f.get("gol_f") is None else (f["gol_f"] >= 1 and f["gol_c"] >= 1), .67, "goles"),
        ("Más de 9.5 córners en el partido", lambda f: None if f.get("esq_f") is None else (f["esq_f"] + f["esq_c"]) >= 10, .67, "córners"),
    ]
    for txt, fn, umbral, tipo in reglas:
        k, de = _cuenta(filas, fn)
        if de >= 4 and k / de >= umbral:
            out.append({"t": f"{txt} en {k} de {de} partidos", "k": k, "de": de, "f": round(k / de, 2), "tipo": tipo, "a": ambito})

    # promedios frente al promedio de la liga
    def prom(k, lk, alto_txt, bajo_txt, tipo, alto=1.2, bajo=.75):
        v, ref = _media(filas, k), liga.get(lk)
        if v is None or not ref:
            return
        if v >= ref * alto:
            out.append({"t": f"{alto_txt}: {v:.1f} por partido (liga {ref:.1f})", "k": None, "de": n, "f": .7, "tipo": tipo, "a": ambito})
        elif bajo_txt and v <= ref * bajo:
            out.append({"t": f"{bajo_txt}: {v:.1f} por partido (liga {ref:.1f})", "k": None, "de": n, "f": .6, "tipo": tipo, "a": ambito})

    prom("ptas_f", "ptas", "Remata mucho al arco", "Remata poco al arco", "tiros")
    prom("ptas_c", "ptas", "Concede muchos tiros al arco", "Concede pocos tiros al arco", "defensa")
    prom("esq_f", "esq", "Genera muchos córners", None, "córners")
    prom("tarj_f", "tarj", "Acumula tarjetas", None, "disciplina", 1.25)

    if racha:
        res = []
        for f in filas:
            if f.get("gol_f") is None:
                break
            res.append("V" if f["gol_f"] > f["gol_c"] else "E" if f["gol_f"] == f["gol_c"] else "D")
        def serie(ok):
            c = 0
            for r in res:
                if ok(r):
                    c += 1
                else:
                    break
            return c
        cv, cd = serie(lambda r: r == "V"), serie(lambda r: r == "D")
        cp, cg = serie(lambda r: r != "D"), serie(lambda r: r != "V")

        def add(c, txt):
            out.append({"t": f"{c} {txt}", "k": c, "de": c, "f": 1.0, "tipo": "racha", "a": "racha actual"})
        if cv >= 3:
            add(cv, "victorias seguidas")
        elif cp >= 3:
            add(cp, "partidos sin perder")
        if cd >= 3:
            add(cd, "derrotas seguidas")
        elif cg >= 3:
            add(cg, "partidos sin ganar")
    return sorted(out, key=lambda o: (-o["f"], -(o["k"] or 0)))


def contexto(hist, equipo, rol, liga, n=6):
    d = hist[(hist.HomeTeam == equipo) | (hist.AwayTeam == equipo)].sort_values("Date")
    ult = [fila_ctx(r, equipo) for r in d.tail(8).iloc[::-1].itertuples()]
    prom = {}
    for k in CTX:
        for suf in ("f", "c"):
            v = [x[f"{k}_{suf}"] for x in ult if x[f"{k}_{suf}"] is not None]
            prom[f"{k}_{suf}"] = round(float(np.mean(v)), 2) if v else None
    rol_df = d[d.HomeTeam == equipo] if rol == "L" else d[d.AwayTeam == equipo]
    solo_rol = [fila_ctx(r, equipo) for r in rol_df.tail(5).iloc[::-1].itertuples()]
    amb = "como local, últimos 5" if rol == "L" else "como visitante, últimos 5"
    obs = _obs(ult[:n], f"últimos {n}", liga, racha=True)[:8] + _obs(solo_rol, amb, liga)[:5]
    return {"ultimos": ult[:n], "prom8": prom, "obs": obs}


def h2h(hist, a, b, n=5):
    d = hist[((hist.HomeTeam == a) & (hist.AwayTeam == b)) | ((hist.HomeTeam == b) & (hist.AwayTeam == a))]
    out = []
    for r in d.sort_values("Date").tail(n).iloc[::-1].itertuples():
        out.append({"d": r.Date.strftime("%Y-%m-%d"), "local": r.HomeTeam, "visita": r.AwayTeam,
                    "gl": int(r.FTHG), "gv": int(r.FTAG),
                    "esq": _n(getattr(r, "HC", np.nan) + getattr(r, "AC", np.nan)),
                    "tarj": _n(getattr(r, "HCARD", np.nan) + getattr(r, "ACARD", np.nan))})
    return out


def lineas_goles(m: DixonColes, home, away):
    mat = m.matriz(home, away)
    i, j = np.indices(mat.shape)
    tot = i + j
    return [{"l": l, "o": round(float(mat[tot > l].sum()), 4)} for l in (1.5, 2.5, 3.5)]


def partidos(div: str, dias: int):
    if div in ESPN_COMPS:
        hist, fx = peru.historico(ESPN_COMPS[div]), peru.proximos(ESPN_COMPS[div])
    else:
        hist, fx = data.historico(div), data.proximos(div)
    hist = preparar(hist)
    liga_prom = _prom_liga(hist)
    hoy = pd.Timestamp.today().normalize()
    if div not in ESPN_COMPS:  # football-data publica pocos días: se completa con el calendario de ESPN (sin cuotas)
        fx = fx.copy()
        fx["zona"] = "uk"
        try:
            ex = espn_res.proximos(div, set(hist.HomeTeam) | set(hist.AwayTeam), dias)
            if len(ex):
                ya = set(zip(fx.HomeTeam, fx.AwayTeam))
                ex = ex[[(h, a) not in ya for h, a in zip(ex.HomeTeam, ex.AwayTeam)]]
                fx = pd.concat([fx, ex], ignore_index=True)
        except Exception as exc:
            print("  calendario ESPN:", exc)
    fx = fx[(fx.Date >= hoy) & (fx.Date <= hoy + pd.Timedelta(days=dias))]
    if fx.empty:
        return [], hist
    # parámetros validados por el backtest de la liga (cache/backtest.json); si no hay, valores prudentes
    bt = BT_PARAMS.get(div, {})
    p = bt.get("params", {})
    reg = p.get("reg", 2.0 if div in ESPN_COMPS else 0.5)   # más regularización donde cada equipo juega pocos partidos
    m = DixonColes(vida_media_dias=p.get("vida", 365), reg=reg, xg_peso=p.get("xg", 0.0)).fit(hist)
    emp = cuotas_pe.emparejar(cuotas_pe.cargar(), m.teams) if div == "PER" else {}
    cm = {}
    reg_cont = {k: v.get("reg", 4.0) for k, v in bt.get("conteos", {}).items()}
    for k, (hc, ac, _) in VARS.items():
        if hc in hist and hist[hc].notna().sum() >= 60:
            try:
                # conteos: la regularización validada por variable; por defecto fuerte (cerca del promedio de liga)
                cm[k] = CountModel(reg=reg_cont.get(k, max(reg, 4.0))).fit(hist, hc, ac)
            except Exception as e:
                print(f"  {k}: {e}")
    out = []
    for _, r in fx.iterrows():
        if not m.conoce(r.HomeTeam, r.AwayTeam):
            continue
        pm = m.mercados(r.HomeTeam, r.AwayTeam)
        sel = {}
        for s, (avg_c, max_c) in ODDS_COLS.items():
            avg, mx = _odd(r, avg_c), _odd(r, max_c)
            sel[s] = {"pm": round(float(pm[s]), 4)}
            if avg:
                sel[s].update(avg=avg, max=mx or avg)
        mat = m.matriz(r.HomeTeam, r.AwayTeam)
        i, j = np.indices(mat.shape)
        lam, mu = float((mat.sum(1) * np.arange(mat.shape[0])).sum()), float((mat.sum(0) * np.arange(mat.shape[1])).sum())
        vars_ = {"goles": {"nombre": "Goles (partido)", "mh": round(lam, 2), "ma": round(mu, 2),
                           "mt": round(lam + mu, 2), "lineas": lineas_goles(m, r.HomeTeam, r.AwayTeam)}}
        for k, mod in cm.items():
            if not mod.conoce(r.HomeTeam, r.AwayTeam):
                continue
            a, b = mod.medias(r.HomeTeam, r.AwayTeam)
            vars_[k] = {"nombre": VARS[k][2], "mh": round(a, 2), "ma": round(b, 2), "mt": round(a + b, 2),
                        "lineas": mod.lineas(a + b), "lh": mod.lineas(a, 2), "la": mod.lineas(b, 2)}
        casa, extra = None, []
        ev = emp.get((r.HomeTeam, r.AwayTeam))
        if ev:
            casa, q = ev["casa"], ev["m"]["1X2"]
            for s_ in ("1", "X", "2"):
                sel[s_].update(avg=q[s_], max=q[s_])
            g = ev["m"].get("goles")
            if g and g["l"] == 2.5:
                sel["O2.5"].update(avg=g["o"], max=g["o"])
                sel["U2.5"].update(avg=g["u"], max=g["u"])
            elif g:
                extra.append(dict(var="goles", nombre="Goles del partido", l=g["l"],
                                  po=round(float(mat[(i + j) > g["l"]].sum()), 4), cuo=g["o"], cuu=g["u"]))
            for var in ("goles1t", "corners", "tarjetas"):
                x = ev["m"].get(var)
                if x and var in vars_:
                    extra.append(dict(var=var, nombre=VARS[var][2], l=x["l"],
                                      po=round(cm[var].p_over(vars_[var]["mt"], x["l"]), 4),
                                      cuo=x["o"], cuu=x["u"]))
            b = ev["m"].get("btts")
            if b:
                extra.append(dict(var="btts", nombre="Ambos equipos anotan", l=None,
                                  po=round(float(pm["BTTS_SI"]), 4), cuo=b["si"], cuu=b["no"]))
        out.append({"liga": div, "fecha": r.Date.strftime("%Y-%m-%d"), "casa": casa, "extra": extra,
                    "hora": None if pd.isna(r.get("Time")) else str(r.get("Time")),
                    "zona": "lima" if (div in ESPN_COMPS or r.get("zona") == "lima") else "uk",
                    "home": r.HomeTeam, "away": r.AwayTeam, "sel": sel,
                    "btts": round(float(pm["BTTS_SI"]), 4), "vars": vars_,
                    "ctx": {"home": contexto(hist, r.HomeTeam, "L", liga_prom), "away": contexto(hist, r.AwayTeam, "V", liga_prom),
                            "h2h": h2h(hist, r.HomeTeam, r.AwayTeam)},
                    "con_cuotas": any("avg" in v for v in sel.values())})
    return out, hist


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int, default=10)
    ap.add_argument("--ligas", nargs="+", default=list(data.LIGAS))
    ap.add_argument("--sin-backtest", action="store_true")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    todos, resultados, bt, ligas = [], [], {}, {}
    # el backtest completo (búsqueda de parámetros) lo escribe `python backtest.py --todas` (workflow diario);
    # aquí solo se usa su resultado. Si falta y no se pidió --sin-backtest, se calcula la versión rápida.
    bt_prev = dict(BT_PARAMS)
    bt_fresco = bool(bt_prev)
    for div in a.ligas:
        if div == "PER" and not peru.disponible():
            print("[PER] omitida: falta API_FOOTBALL_KEY")
            continue
        print(f"[{div}] {data.LIGAS[div]}", flush=True)
        try:
            ps, hist = partidos(div, a.dias)
        except Exception as e:
            print("  error:", e)
            continue
        ligas[div] = data.LIGAS[div]
        todos += ps
        rec = hist[hist.Date >= hist.Date.max() - pd.Timedelta(days=120)]
        resultados += [{"liga": div, "d": r.Date.strftime("%Y-%m-%d"), "h": r.HomeTeam, "a": r.AwayTeam,
                        "hg": int(r.FTHG), "ag": int(r.FTAG),
                        "ht": None if pd.isna(getattr(r, "HTHG", np.nan)) else int(r.HTHG) + int(r.HTAG),
                        "c": _n(getattr(r, "HC", np.nan) + getattr(r, "AC", np.nan)),
                        "t": _n(getattr(r, "HCARD", np.nan) + getattr(r, "ACARD", np.nan)),
                        "st": _n(getattr(r, "HST", np.nan) + getattr(r, "AST", np.nan)),
                        "s": _n(getattr(r, "HS", np.nan) + getattr(r, "AS", np.nan))}
                       for r in rec.itertuples()]
        if div not in ESPN_COMPS:
            try:  # resultados casi en vivo de ESPN (football-data tarda horas)
                ya = {(x["h"], x["a"], x["d"]) for x in resultados if x["liga"] == div}
                for x in espn_res.recientes(div, set(hist.HomeTeam) | set(hist.AwayTeam)):
                    if (x["h"], x["a"], x["d"]) not in ya:
                        resultados.append(x)
            except Exception as ex:
                print("  ESPN resultados:", ex)
        if div in bt_prev:
            bt[div] = {k: v for k, v in bt_prev[div].items() if k != "grid"}   # la rejilla completa no hace falta en la web
        elif not a.sin_backtest and div not in ESPN_COMPS:
            r = backtest.run(div, n=250, paso=21, rapido=True)
            if r:
                bt[div] = {k: v for k, v in r.items() if k != "grid"}
                BT_PARAMS[div] = r

    if bt and not bt_fresco:
        BT_CACHE.parent.mkdir(exist_ok=True)
        BT_CACHE.write_text(json.dumps(BT_PARAMS, ensure_ascii=False), encoding='utf-8')
    if a.sin_backtest and not bt:  # conserva el backtest previo si no se recalcula
        try:
            bt = json.loads((OUT / "picks.json").read_text(encoding="utf-8"))["meta"].get("backtest", {})
        except Exception:
            bt = {}

    # historial de predicciones: cuando un partido empieza deja de estar en los próximos,
    # pero se conserva su predicción previa para poder contrastarla con el resultado
    clave = lambda m: f'{m["liga"]}|{m["home"]}|{m["away"]}|{m["fecha"]}'
    try:
        previo = json.loads(HIST.read_text(encoding="utf-8")) if HIST.exists() else {}
    except Exception:
        previo = {}
    actuales = {clave(m): m for m in todos}
    pares = {(m["liga"], m["home"], m["away"]): m["fecha"] for m in todos}
    def _reprogramado(v):  # mismo partido con otra fecha cercana: se descarta la versión vieja
        f = pares.get((v["liga"], v["home"], v["away"]))
        return f is not None and f != v["fecha"] and abs((pd.Timestamp(f) - pd.Timestamp(v["fecha"])).days) <= 14
    previo = {k: v for k, v in previo.items() if not _reprogramado(v)}
    previo.update({k: {kk: vv for kk, vv in m.items() if kk != "ctx"} for k, m in actuales.items()})
    limite = (pd.Timestamp.today().normalize() - pd.Timedelta(days=DIAS_HIST)).strftime("%Y-%m-%d")
    previo = {k: v for k, v in previo.items() if v["fecha"] >= limite}
    HIST.parent.mkdir(exist_ok=True)
    HIST.write_text(json.dumps(previo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    recientes = [v for k, v in previo.items() if k not in actuales]

    meta = {"generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "ligas": ligas, "backtest": bt, "n_partidos": len(todos)}
    (OUT / "picks.json").write_text(json.dumps({"meta": meta, "partidos": todos, "recientes": recientes}, ensure_ascii=False,
                                               separators=(",", ":")), encoding="utf-8")
    (OUT / "results.json").write_text(json.dumps(resultados, ensure_ascii=False, separators=(",", ":")),
                                      encoding="utf-8")
    print(f"OK: {len(todos)} partidos, {len(resultados)} resultados recientes")


if __name__ == "__main__":
    main()
