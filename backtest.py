"""Validación walk-forward del modelo contra el mercado.

Para cada liga:
  1. Prueba combinaciones de parámetros (vida media, regularización, uso de xG) y elige la de menor log-loss 1X2.
  2. Calcula el peso de mercado óptimo (mezcla modelo/mercado) con esa combinación.
  3. Simula apuestas planas (1 unidad) con cuotas de CIERRE cuando el edge mezclado supera un umbral.
  4. Mide si los modelos de córners / tarjetas / goles 1T superan al promedio de la liga (Brier).

Uso:  python backtest.py [--liga E0] [--n 250] [--paso 21] [--rapido]
      python backtest.py --todas          -> escribe cache/backtest.json (lo usa export.py)
"""
import argparse
import itertools
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

import data
from model import CountModel, DixonColes

sys.stdout.reconfigure(encoding="utf-8")
CACHE = Path(__file__).parent / "cache" / "backtest.json"
GRID = {"vida": (120, 240, 365, 730), "reg": (0.2, 0.5, 1.5), "xg": (0.0, 0.5)}
PESOS = [round(w, 2) for w in np.arange(0, 1.0001, 0.05)]
UMBRALES = (0.03, 0.05, 0.08)
# variable -> (col local, col visita, línea típica)
CONTEOS = {"goles1t": ("HTHG", "HTAG", 1.5), "corners": ("HC", "AC", 9.5), "tarjetas": ("HCARD", "ACARD", 3.5)}


def _preparar(df):
    df = df.copy()
    for s in ("H", "A"):
        if f"{s}Y" in df:
            df[f"{s}CARD"] = df[f"{s}Y"].fillna(0) + df.get(f"{s}R", 0).fillna(0)
    return df


def _bloques(df, n, paso):
    """Ventanas de test walk-forward: (datos previos, bloque a predecir)."""
    test = df.tail(n)
    for ini in pd.date_range(test.Date.min(), test.Date.max(), freq=f"{paso}D"):
        bloque = test[(test.Date >= ini) & (test.Date < ini + pd.Timedelta(days=paso))]
        previo = df[df.Date < ini]
        if len(bloque) and len(previo) >= 100:
            yield previo, bloque


def _ll(p):
    return -np.log(np.clip(p, 1e-9, 1))


def evaluar_1x2(df, n, paso, vida, reg, xg):
    """Predicciones 1X2 y O/U 2.5 del modelo + mercado (cierre) por partido."""
    oc = ["AvgCH", "AvgCD", "AvgCA"] if "AvgCH" in df else ["AvgH", "AvgD", "AvgA"]
    mc = ["MaxCH", "MaxCD", "MaxCA"] if "MaxCH" in df else ["MaxH", "MaxD", "MaxA"]
    ou_avg = ["AvgC>2.5", "AvgC<2.5"] if "AvgC>2.5" in df else ["Avg>2.5", "Avg<2.5"]
    ou_max = ["MaxC>2.5", "MaxC<2.5"] if "MaxC>2.5" in df else ["Max>2.5", "Max<2.5"]
    tiene_ou = all(c in df for c in ou_avg + ou_max)
    filas = []
    for previo, bloque in _bloques(df, n, paso):
        m = DixonColes(vida_media_dias=vida, reg=reg, xg_peso=xg).fit(previo, fecha_ref=previo.Date.max())
        # las columnas con ">" no sobreviven a itertuples: se leen como arrays
        A, M = bloque[oc].to_numpy(float), bloque[mc].to_numpy(float)
        OA = bloque[ou_avg].to_numpy(float) if tiene_ou else None
        OM = bloque[ou_max].to_numpy(float) if tiene_ou else None
        for i, r in enumerate(bloque.itertuples()):
            if not m.conoce(r.HomeTeam, r.AwayTeam):
                continue
            pm = m.mercados(r.HomeTeam, r.AwayTeam)
            inv = 1 / A[i]
            f = {"p": np.array([pm["1"], pm["X"], pm["2"]]), "mk": inv / inv.sum(), "mx": M[i],
                 "y": {"H": 0, "D": 1, "A": 2}[r.FTR]}
            if tiene_ou and not np.isnan(OA[i]).any() and not np.isnan(OM[i]).any():
                io = 1 / OA[i]
                f.update(pou=np.array([pm["O2.5"], pm["U2.5"]]), mkou=io / io.sum(), mxou=OM[i],
                         you=0 if r.FTHG + r.FTAG >= 3 else 1)
            filas.append(f)
    return filas


def resumen_1x2(filas):
    n = len(filas)
    ll_w = {w: float(np.mean([_ll(((1 - w) * f["p"] + w * f["mk"])[f["y"]]) for f in filas])) for w in PESOS}
    w_opt = min(ll_w, key=ll_w.get)
    out = {"n": n, "logloss": {"0.0": ll_w[0.0], "0.25": ll_w[0.25], "0.5": ll_w[0.5], "0.75": ll_w[0.75], "1.0": ll_w[1.0]},
           "w_opt": w_opt, "ll_opt": ll_w[w_opt]}
    ou = [f for f in filas if "pou" in f]
    if ou:
        llo = {w: float(np.mean([_ll(((1 - w) * f["pou"] + w * f["mkou"])[f["you"]]) for f in ou])) for w in PESOS}
        wo = min(llo, key=llo.get)
        out["ou"] = {"n": len(ou), "modelo": llo[0.0], "mercado": llo[1.0], "w_opt": wo, "ll_opt": llo[wo]}
    return out


def simular_apuestas(filas, w, wou=None):
    """Apuestas planas de 1 unidad a cuotas de cierre cuando el edge mezclado ≥ umbral."""
    res = {}
    for u in UMBRALES:
        n = gan = 0.0
        for f in filas:
            p = (1 - w) * f["p"] + w * f["mk"]
            e = p * f["mx"] - 1
            k = int(np.argmax(e))
            if e[k] >= u:
                n += 1
                gan += f["mx"][k] - 1 if f["y"] == k else -1
            if "pou" in f and wou is not None:
                po = (1 - wou) * f["pou"] + wou * f["mkou"]
                eo = po * f["mxou"] - 1
                j = int(np.argmax(eo))
                if eo[j] >= u:
                    n += 1
                    gan += f["mxou"][j] - 1 if f["you"] == j else -1
        res[f"{int(u * 100)}"] = {"apuestas": int(n), "ganancia": round(gan, 2), "roi": round(gan / n, 4) if n else None}
    return res


REG_CONTEO = (0.5, 1.5, 4.0, 10.0)


def evaluar_conteos(df, n, paso, _reg=None):
    """Brier del modelo de conteo frente al promedio de liga, en la línea típica de cada variable.
    Prueba varias regularizaciones y se queda con la mejor; informa si supera al promedio de liga."""
    out = {}
    for var, (hc, ac, linea) in CONTEOS.items():
        if hc not in df or df[hc].notna().sum() < 150:
            continue
        d = df.dropna(subset=[hc, ac])
        mejor = None
        for reg in REG_CONTEO:
            bm = bb = cnt = 0.0
            for previo, bloque in _bloques(d, n, paso):
                try:
                    m = CountModel(reg=reg).fit(previo, hc, ac)
                except Exception:
                    continue
                base = float((previo[hc] + previo[ac]).tail(300).mean())
                pb = m.p_over(base, linea)                      # promedio de liga como "modelo nulo"
                H, Aa = bloque[hc].to_numpy(float), bloque[ac].to_numpy(float)
                for i, r in enumerate(bloque.itertuples()):
                    if not m.conoce(r.HomeTeam, r.AwayTeam):
                        continue
                    a, b = m.medias(r.HomeTeam, r.AwayTeam)
                    pm = m.p_over(a + b, linea)
                    y = 1.0 if H[i] + Aa[i] > linea else 0.0
                    bm += (pm - y) ** 2
                    bb += (pb - y) ** 2
                    cnt += 1
            if cnt >= 50 and (mejor is None or bm / cnt < mejor["brier_modelo"]):
                mejor = {"n": int(cnt), "linea": linea, "reg": reg, "brier_modelo": round(bm / cnt, 4),
                         "brier_liga": round(bb / cnt, 4), "mejora": round(1 - (bm / cnt) / (bb / cnt), 3)}
        if mejor:
            out[var] = mejor
    return out


def run(liga="E0", n=250, paso=21, rapido=False):
    df = _preparar(data.historico(liga))
    oc = ["AvgCH", "AvgCD", "AvgCA"] if "AvgCH" in df else ["AvgH", "AvgD", "AvgA"]
    df = df.dropna(subset=oc).reset_index(drop=True)
    if len(df) < 200:
        return None
    tiene_xg = "HxG" in df and df["HxG"].notna().sum() >= 30
    grid = [(365, 0.5, 0.0)] if rapido else [(v, r, x) for v, r, x in itertools.product(GRID["vida"], GRID["reg"], GRID["xg"])
                                              if x == 0 or tiene_xg]
    mejor, mejor_res, mejor_filas, tabla = None, None, None, []
    for vida, reg, xg in grid:
        filas = evaluar_1x2(df, n, paso, vida, reg, xg)
        if not filas:
            continue
        res = resumen_1x2(filas)
        tabla.append({"vida": vida, "reg": reg, "xg": xg, "ll_modelo": round(res["logloss"]["0.0"], 4), "ll_opt": round(res["ll_opt"], 4), "w_opt": res["w_opt"]})
        if mejor is None or res["ll_opt"] < mejor_res["ll_opt"]:
            mejor, mejor_res, mejor_filas = (vida, reg, xg), res, filas
    if mejor is None:
        return None
    vida, reg, xg = mejor
    out = {"n": mejor_res["n"], "params": {"vida": vida, "reg": reg, "xg": xg},
           "logloss": {k: round(v, 4) for k, v in mejor_res["logloss"].items()},
           "w_opt": mejor_res["w_opt"], "ll_opt": round(mejor_res["ll_opt"], 4),
           "roi": simular_apuestas(mejor_filas, mejor_res["w_opt"], mejor_res.get("ou", {}).get("w_opt")),
           "conteos": evaluar_conteos(df, n, paso, reg), "grid": tabla}
    if "ou" in mejor_res:
        out["ou"] = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in mejor_res["ou"].items()}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--liga", default="E0")
    ap.add_argument("--todas", action="store_true", help="todas las ligas con cuotas; guarda cache/backtest.json")
    ap.add_argument("--n", type=int, default=250)
    ap.add_argument("--paso", type=int, default=21)
    ap.add_argument("--rapido", action="store_true", help="sin búsqueda de parámetros")
    a = ap.parse_args()
    ligas = ["E0", "SP1", "D1", "I1", "F1", "N1", "P1"] if a.todas else [a.liga]
    todo = {}
    for liga in ligas:
        t = time.time()
        r = run(liga, a.n, a.paso, a.rapido)
        if not r:
            print(f"[{liga}] sin datos suficientes")
            continue
        todo[liga] = r
        p, ll = r["params"], r["logloss"]
        print(f"[{liga}] {r['n']} partidos · {time.time() - t:.0f}s · mejor: vida {p['vida']}d, reg {p['reg']}, xG {p['xg']}")
        print(f"   log-loss modelo {ll['0.0']:.4f} · mercado {ll['1.0']:.4f} · mezcla óptima (w={r['w_opt']:.2f}) {r['ll_opt']:.4f}")
        if "ou" in r:
            print(f"   O/U 2.5: modelo {r['ou']['modelo']:.4f} · mercado {r['ou']['mercado']:.4f} · mezcla (w={r['ou']['w_opt']:.2f}) {r['ou']['ll_opt']:.4f}")
        for u, s in r["roi"].items():
            print(f"   edge ≥{u}%: {s['apuestas']} apuestas, ROI {('%+.1f%%' % (s['roi'] * 100)) if s['roi'] is not None else '—'}")
        for v, c in r["conteos"].items():
            print(f"   {v} (>{c['linea']}): Brier modelo {c['brier_modelo']:.4f} vs liga {c['brier_liga']:.4f} → mejora {c['mejora'] * 100:+.1f}%")
    if a.todas and todo:
        CACHE.parent.mkdir(exist_ok=True)
        CACHE.write_text(json.dumps(todo, ensure_ascii=False), encoding="utf-8")
        print(f"guardado {CACHE}")


if __name__ == "__main__":
    main()
