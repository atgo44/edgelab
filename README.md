# EdgeLab · Fútbol

Sitio estático (`site/`) + GitHub Action que recalcula `site/data/*.json` cada 6 h y lo publica en GitHub Pages.

## Probar en local
```bash
python export.py --dias 10 --sin-backtest   # genera site/data/*.json
cd site && python -m http.server 8096       # http://127.0.0.1:8096
```

## Publicar gratis (GitHub Pages)
1. Crea un repo en GitHub (p. ej. `edgelab-futbol`) y sube **el contenido de esta carpeta** como raíz del repo.
   ```bash
   git init -b main && git add . && git commit -m "EdgeLab"
   git remote add origin https://github.com/<usuario>/edgelab-futbol.git
   git push -u origin main
   ```
2. En el repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Pestaña **Actions → Actualizar y publicar → Run workflow** (la primera vez; luego corre solo cada 6 h).
4. La URL queda en `https://<usuario>.github.io/edgelab-futbol/`.

## Liga 1 Perú
football-data.co.uk no cubre Perú. Se usa el endpoint público no oficial de ESPN (`per.1`), sin clave:
resultados, córners, tiros, faltas, tarjetas y goles por minuto (1er tiempo). No incluye cuotas, así que Perú
muestra solo probabilidades del modelo. Al ser un endpoint no oficial puede cambiar sin aviso.

## Notas
- El historial de apuestas del usuario vive solo en su navegador (`localStorage`); no hay backend.
- Los datos vienen de football-data.co.uk. El cron de GitHub puede retrasarse unos minutos.
- `app.py` / `index.html` en la raíz son el panel local anterior (FastAPI) y no se publican.

## Interfaz (site/)
- `index.html` (shell) · `styles.css` (tokens claro/oscuro) · `app.js` (lógica, sin dependencias).
- Layout maestro-detalle: navegación lateral, lista de partidos y panel de detalle (Resumen / Mercados / Forma y rivales) + boleta.
- Vistas: Partidos, Oportunidades (ranking valor/confianza), Mi historial (calibración) y Fiabilidad (backtest).
- Atajos: `/` buscar, `j`/`k` moverse entre partidos, `Esc` cerrar panel.
