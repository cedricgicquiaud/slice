#!/usr/bin/env python3
"""Calcule les fenêtres de dates des features d'une roadmap, enchaînées dans l'ordre.

Usage :
    schedule.py --calibration .pilot/calibration.md --start 2026-08-24 \
        "Nom feature 1:S" "Nom feature 2:M" ...
    (ou les features en JSON sur stdin : [{"name":..., "size":..., "hours_done":0}, ...])

Lit le bloc YAML de calibration.md : feature_hours_S/M/L/XL, hours_per_active_day,
days_per_week (nombre, ou "observed" → 1 par défaut, à remplacer par la valeur observée).

Modèle : les jours actifs sont répartis uniformément (un tous les 7/days_per_week jours).
Chaque feature commence là où la précédente finit ; une feature ne chevauche jamais deux
jours actifs si elle tient dans le reste du jour courant. Sortie : JSON [{name, size, hours,
startDate, targetDate}] + un résumé lisible sur stderr.
"""
import argparse
import json
import math
import re
import sys
from datetime import date, timedelta


def read_calibration(path):
    params = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            m = re.match(r"^\s*(feature_hours_(S|M|L|XL)|feature_overhead_hours|hours_per_active_day|days_per_week)\s*:\s*([^#\s]+)", line)
            if m:
                params[m.group(1)] = m.group(3)
    hours = {s: float(params.get(f"feature_hours_{s}", d)) for s, d in (("S", .25), ("M", .75), ("L", 2), ("XL", 3.5))}
    overhead = float(params.get("feature_overhead_hours", 0.5))
    hours = {s: h + overhead for s, h in hours.items()}
    per_day = float(params.get("hours_per_active_day", 6.5))
    dpw = params.get("days_per_week", "observed")
    dpw = 1.0 if dpw == "observed" else float(dpw)
    return hours, per_day, dpw


def active_day(start, k, dpw):
    """Date du k-ième jour actif (k = 0, 1, 2…)."""
    return start + timedelta(days=math.floor(k * 7 / dpw))


def schedule(features, hours, per_day, dpw, start):
    out = []
    day, used = 0, 0.0
    for f in features:
        h = max(hours[f["size"]] - float(f.get("hours_done", 0)), 0.0)
        remaining = h
        first_day = day
        while remaining > 1e-9:
            room = per_day - used
            if room <= 1e-9:
                day, used = day + 1, 0.0
                continue
            take = min(room, remaining)
            used += take
            remaining -= take
            if remaining > 1e-9:
                day, used = day + 1, 0.0
        last_day = day
        out.append({
            "name": f["name"], "size": f["size"], "hours": round(h, 2),
            "startDate": active_day(start, first_day, dpw).isoformat(),
            "targetDate": active_day(start, last_day, dpw).isoformat(),
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--calibration", required=True)
    ap.add_argument("--start", default=date.today().isoformat())
    ap.add_argument("--days-per-week", type=float)
    ap.add_argument("features", nargs="*", help='"Nom:S" … ; sinon JSON sur stdin')
    a = ap.parse_args()
    hours, per_day, dpw = read_calibration(a.calibration)
    if a.days_per_week:
        dpw = a.days_per_week
    if a.features:
        feats = [{"name": x.rsplit(":", 1)[0], "size": x.rsplit(":", 1)[1].upper()} for x in a.features]
    else:
        feats = json.load(sys.stdin)
    start = date.fromisoformat(a.start)
    res = schedule(feats, hours, per_day, dpw, start)
    total = sum(r["hours"] for r in res)
    print(f"{len(res)} features, {total:.1f} h de session, {per_day} h/jour actif, {dpw} jour(s) actif(s)/semaine", file=sys.stderr)
    for r in res:
        print(f"  {r['startDate']} → {r['targetDate']}  [{r['size']}] {r['name']}", file=sys.stderr)
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
