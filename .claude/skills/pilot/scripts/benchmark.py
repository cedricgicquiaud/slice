#!/usr/bin/env python3
"""Benchmark : lit l'historique des PR mergées de dépôts GitHub et produit un barème de charge.

Usage :
    benchmark.py owner/repo [owner/repo ...] [--limit 300] [--out calibration.md]

Modèle (issu des observations : avec Claude Code, une PR est mergée en minutes, le facteur
limitant est le nombre de jours où l'humain travaille sur le projet) :

  - Temps par livraison, selon la taille du diff (S/M/L/XL) : médiane de l'intervalle entre
    deux merges successifs d'une même session (< 4 h).
  - Heures par jour actif : médiane de (dernier merge - premier merge) par jour ayant ≥ 2 PR.
  - Jours actifs par semaine : nombre de jours avec au moins un merge / nombre de semaines.

Le barème de feature en découle : une feature de taille T vaut `facteur(T)` livraisons
de taille T (S=1, M=2, L=3, XL=5), car une feature regroupe plusieurs tâches et des validations.
Ces valeurs sont un point de départ ; `sync` les recalibre à partir du réel.

Nécessite `gh` authentifié.
"""
import argparse
import json
import statistics
import subprocess
import sys
from datetime import datetime

SIZES = [("S", 150), ("M", 600), ("L", 2000), ("XL", float("inf"))]
FEATURE_FACTOR = {"S": 1, "M": 2, "L": 3, "XL": 5}
SESSION_GAP_H = 4  # au-delà, ce n'est plus la même session


def size_of(lines):
    for name, limit in SIZES:
        if lines <= limit:
            return name
    return "XL"


def iso(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def median(xs, default=0.0):
    return statistics.median(xs) if xs else default


def fetch(repo, limit):
    out = subprocess.run(
        ["gh", "pr", "list", "-R", repo, "--state", "merged", "--limit", str(limit),
         "--json", "number,title,mergedAt,additions,deletions"],
        capture_output=True, text=True, check=True,
    ).stdout
    return sorted(json.loads(out), key=lambda p: p["mergedAt"])


def analyse(repo, prs):
    per_size = {s: [] for s, _ in SIZES}
    for a, b in zip(prs, prs[1:]):
        gap = (iso(b["mergedAt"]) - iso(a["mergedAt"])).total_seconds() / 3600
        if 0 < gap < SESSION_GAP_H:
            per_size[size_of(b["additions"] + b["deletions"])].append(gap)
    days = {}
    for p in prs:
        days.setdefault(iso(p["mergedAt"]).date(), []).append(iso(p["mergedAt"]))
    hours = [(max(v) - min(v)).total_seconds() / 3600 for v in days.values() if len(v) > 1]
    weeks = max((max(days) - min(days)).days / 7, 1) if days else 1
    return {
        "repo": repo, "prs": len(prs),
        "from": prs[0]["mergedAt"][:10] if prs else "", "to": prs[-1]["mergedAt"][:10] if prs else "",
        "per_size": per_size, "active_days": len(days), "weeks": weeks,
        "hours_per_day": median(hours), "days_per_week": len(days) / weeks,
        "sizes_count": {s: sum(1 for p in prs if size_of(p["additions"] + p["deletions"]) == s) for s, _ in SIZES},
    }


def merge(results):
    per_size = {s: [] for s, _ in SIZES}
    for r in results:
        for s in per_size:
            per_size[s] += r["per_size"][s]
    task_h = {s: median(per_size[s]) for s in per_size}
    # Fallback : une taille sans donnée hérite de la précédente × 1.5
    prev = 0.25
    for s, _ in SIZES:
        if not task_h[s]:
            task_h[s] = round(prev * 1.5, 2)
        prev = task_h[s]
    feature_h = {s: round(task_h[s] * FEATURE_FACTOR[s], 2) for s in task_h}
    return {
        "task_hours": task_h, "feature_hours": feature_h,
        "hours_per_day": round(median([r["hours_per_day"] for r in results if r["hours_per_day"]]), 1),
        "days_per_week": {r["repo"]: round(r["days_per_week"], 1) for r in results},
    }


def render(results, model):
    repos = ", ".join(r["repo"] for r in results)
    n = sum(r["prs"] for r in results)
    out = ["# Barème de charge", "", f"Source : {repos} — {n} PR mergées.", "",
           "## Paramètres (utilisés par `roadmap` et `sync`)", "",
           "```yaml", "# heures de session par feature, selon sa taille"]
    for s, _ in SIZES:
        out.append(f"feature_hours_{s}: {model['feature_hours'][s]}")
    out.append("feature_overhead_hours: 0.5   # validation du découpage + relecture de PR, hypothèse initiale recalibrée par sync")
    out.append(f"hours_per_active_day: {model['hours_per_day']}")
    out.append("days_per_week: observed   # remplacer par un nombre (ex. 2) pour forcer la capacité")
    out.append("```", )
    out += ["", "## Observations", "",
            "| Taille | Diff (lignes) | Livraisons | Temps médian par livraison (h) | Heures par feature (× facteur) |",
            "|---|---|---|---|---|"]
    prev = 0
    for s, limit in SIZES:
        rng = f"{prev + 1}–{int(limit)}" if limit != float("inf") else f"> {prev}"
        cnt = sum(r["sizes_count"][s] for r in results)
        out.append(f"| {s} | {rng} | {cnt} | {model['task_hours'][s]:.2f} | {model['feature_hours'][s]:.2f} (×{FEATURE_FACTOR[s]}) |")
        prev = int(limit) if limit != float("inf") else prev
    out += ["", "| Dépôt | PR | Période | Jours actifs | Heures / jour actif | Jours actifs / semaine |", "|---|---|---|---|---|---|"]
    for r in results:
        out.append(f"| {r['repo']} | {r['prs']} | {r['from']} → {r['to']} | {r['active_days']} | {r['hours_per_day']:.1f} | {r['days_per_week']:.1f} |")
    out += ["", "## Comment lire", "",
            "- Avec Claude Code, une PR est mergée en quelques minutes : le temps d'attente humaine ne",
            "  mesure rien. Ce qui compte est le **temps de session** par livraison et le **nombre de",
            "  jours** où l'humain travaille sur le projet.",
            "- Temps par livraison = intervalle entre deux merges d'une même session (< 4 h).",
            "- Heures par feature = temps par livraison × facteur (S=1, M=2, L=3, XL=5), car une",
            "  feature regroupe plusieurs tâches et des validations. Point de départ, recalibré par `sync`.",
            "- Fenêtre d'une feature = heures cumulées ÷ heures par jour actif ÷ jours actifs par semaine.", "",
            "## Historique des features (rempli par `next` et `sync`)", "",
            "| Feature | Taille | Tâches | Début | PR ouverte | Mergée | Heures réelles |",
            "|---|---|---|---|---|---|---|"]
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("repos", nargs="+")
    ap.add_argument("--limit", type=int, default=300)
    ap.add_argument("--out", default="calibration.md")
    a = ap.parse_args()
    results = []
    for repo in a.repos:
        try:
            prs = fetch(repo, a.limit)
            if prs:
                results.append(analyse(repo, prs))
        except subprocess.CalledProcessError as e:
            print(f"[ERREUR] {repo}: {e.stderr.strip()}", file=sys.stderr)
    if not results:
        sys.exit("Aucune PR mergée trouvée.")
    model = merge(results)
    md = render(results, model)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(md)
    print(md.split("## Comment lire")[0])
    print(f"→ écrit dans {a.out}")


if __name__ == "__main__":
    main()
