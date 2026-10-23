"""Ce qu'a coûté un projet, étape par étape de la méthode et feature par feature.

Appelé par `cout-agents.py --projet`. Lit tous les journaux de ~/.claude/projects (sessions
principales et sous-agents) dont le `cwd` est le projet ou l'un de ses worktrees.

L'étape vient de l'agent quand c'est un agent de la boucle (producteur, verifier…), sinon de la
branche de la session : `prd/`, `roadmap/`, `cadrage/` (`git.md` § Branches). La feature vient du
code Linear de la branche. Les tokens sont mesurés ; les dollars sont un équivalent en prix
d'API (`prix.json`), pas une dépense.
"""
import collections
import functools
import json
import os
import re

ETAPES = ["PRD", "roadmap", "cadrage", "production", "vérification", "correction",
          "pilotage des livraisons", "tâches isolées", "hors méthode"]

AGENTS = {
    "producteur": "production", "prod": "production", "tdd": "production", "tdd-writer": "production",
    "verifier": "vérification", "verif": "vérification", "testeur": "vérification", "test": "vérification",
    "retest": "vérification", "retesteur": "vérification", "audit": "vérification",
    "correcteur": "correction", "fix": "correction",
    "contradicteur": "cadrage", "decoupeur": "cadrage",
}

CODE = re.compile(r"\b(P-[A-Z]+-\d+|[A-Z]+-\d+)\b")


def etape(branche, agent):
    if agent in AGENTS:
        return AGENTS[agent]
    b = branche or ""
    if b.startswith("prd/"): return "PRD"
    if b.startswith("roadmap/"): return "roadmap"
    if b.startswith("cadrage/"): return "cadrage"
    if CODE.search(b):
        return "pilotage des livraisons" if b.startswith(("feature/", "feat/")) else "tâches isolées"
    return "hors méthode"


def unite(branche):
    m = CODE.search(branche or "")
    return m.group(1) if m else None


def cout(u, prix):
    """Équivalent en dollars d'un usage ; None si le modèle n'a pas de prix connu."""
    if not prix: return None
    ecriture = u.get("cache_creation_input_tokens") or 0
    detail = u.get("cache_creation")
    e1h = (detail or {}).get("ephemeral_1h_input_tokens") or 0
    e5m = (detail.get("ephemeral_5m_input_tokens") or 0) if detail else ecriture
    total = ((u.get("input_tokens") or 0) * prix["entree"] + (u.get("output_tokens") or 0) * prix["sortie"]
             + (u.get("cache_read_input_tokens") or 0) * prix["lecture_cache"]
             + e5m * prix["entree"] * 1.25 + e1h * prix["entree"] * 2)
    return total / 1e6


def du_projet(cwd, projet):
    """Le projet lui-même, un sous-dossier, ou un worktree frère `<projet>-<n>`.
    Un sous-dossier qui est son propre dépôt git (le site dans WATIDO) compte à part."""
    if not cwd: return False
    if cwd.startswith(projet + "/"):
        return not imbrique(cwd, projet)
    return cwd == projet or re.match(re.escape(projet) + r"-[A-Za-z0-9]+(/|$)", cwd) is not None


@functools.lru_cache(maxsize=None)
def imbrique(cwd, projet):
    """Vrai si un dossier entre `projet` (exclu) et `cwd` (inclus) porte son propre `.git`."""
    d = cwd
    while d != projet and d.startswith(projet + "/"):
        if os.path.exists(os.path.join(d, ".git")): return True
        d = os.path.dirname(d)
    return False


def modele(m):
    return re.sub(r"-\d{8}$", "", re.sub(r"\[[^\]]*\]$", "", m))


def lire_requetes(texte, projet, agent, vus):
    """Une entrée par requête facturée du projet ; `vus` évite de compter deux fois la même."""
    sortie = []
    for brut in texte.split("\n"):
        if '"usage"' not in brut: continue
        try: d = json.loads(brut)
        except Exception: continue
        m = d.get("message") or {}
        if d.get("type") != "assistant" or not m.get("usage") or not str(m.get("model", "")).startswith("claude-"):
            continue
        if not du_projet(d.get("cwd"), projet): continue
        cle = f"{d.get('requestId') or d.get('uuid')}|{m.get('id')}"
        if cle in vus: continue
        vus.add(cle)
        sortie.append({"branche": d.get("gitBranch") or "", "agent": agent, "modele": modele(m["model"]),
                       "effort": d.get("effort") or "?", "usage": m["usage"]})
    return sortie


def agent_du_journal(chemin):
    """Le type d'agent : dans le `.meta.json` voisin s'il existe, sinon dans le nom du fichier."""
    meta = chemin[:-len(".jsonl")] + ".meta.json"
    try:
        with open(meta) as f: return json.load(f).get("agentType")
    except Exception: pass
    m = re.match(r"agent-a([a-z]+?)-", os.path.basename(chemin))
    return m.group(1) if m else None


def journaux(base):
    for racine, _, noms in os.walk(base):
        for n in noms:
            if n.endswith(".jsonl"):
                chemin = os.path.join(racine, n)
                yield chemin, (agent_du_journal(chemin) if os.path.basename(racine) == "subagents" else None)


def agreger(recs, prix):
    vide = lambda: {"requetes": 0, "cout": 0.0, "reglages": collections.Counter()}
    a = {"requetes": 0, "cout": 0.0, "par_etape": {}, "par_unite": {}, "sans_prix": set()}
    for r in recs:
        c = cout(r["usage"], prix.get(r["modele"]))
        e = etape(r["branche"], r["agent"])
        a["requetes"] += 1
        if c is None: a["sans_prix"].add(r["modele"]); c = 0.0
        a["cout"] += c
        pe = a["par_etape"].setdefault(e, vide())
        pe["requetes"] += 1; pe["cout"] += c; pe["reglages"][f"{r['modele']} · {r['effort']}"] += 1
        u = unite(r["branche"])
        if u:
            pu = a["par_unite"].setdefault(u, {"requetes": 0, "cout": 0.0, "etapes": collections.Counter()})
            pu["requetes"] += 1; pu["cout"] += c; pu["etapes"][e] += c
    for pe in a["par_etape"].values():
        pe["reglage"] = pe.pop("reglages").most_common(1)[0][0]
    a["sans_prix"] = sorted(a["sans_prix"])
    return a


def dollars(n):
    return f"{n:.2f}".replace(".", ",") + " $"


def rapport(a, nom, source):
    t = a["cout"] or 1
    lignes = [f"\nCoût du projet {nom} par étape de la méthode",
              "Tokens mesurés dans les journaux de session ; montants : équivalent en prix d'API, pas une dépense.",
              f"Tarifs : {source}", "",
              f"Total : {dollars(a['cout'])}, {a['requetes']} requêtes", "",
              f"{'étape':26} {'requêtes':>9} {'équivalent':>12} {'part':>5}  réglage le plus fréquent"]
    for e in ETAPES:
        if e in a["par_etape"]:
            x = a["par_etape"][e]
            lignes.append(f"{e:26} {x['requetes']:9} {dollars(x['cout']):>12} {100 * x['cout'] / t:4.0f} %  {x['reglage']}")
    if a["par_unite"]:
        cols = [e for e in ETAPES if any(e in u["etapes"] for u in a["par_unite"].values())]
        lignes += ["", "Par feature ou tâche (code Linear de la branche) :",
                   f"{'code':10} {'total':>10}  " + "  ".join(f"{c[:12]:>12}" for c in cols)]
        for code, u in sorted(a["par_unite"].items(), key=lambda kv: -kv[1]["cout"]):
            lignes.append(f"{code:10} {dollars(u['cout']):>10}  "
                          + "  ".join(f"{dollars(u['etapes'][c]) if c in u['etapes'] else '—':>12}" for c in cols))
    if a["sans_prix"]:
        lignes += ["", f"Modèles sans prix connu, comptés en requêtes mais pas en dollars : {', '.join(a['sans_prix'])}."]
    return "\n".join(lignes)


def main(projet):
    ici = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(ici, "prix.json")) as f: prix = json.load(f)
    vus, recs = set(), []
    for chemin, agent in journaux(os.path.expanduser("~/.claude/projects")):
        with open(chemin, errors="replace") as f:
            recs += lire_requetes(f.read(), projet, agent, vus)
    print(rapport(agreger(recs, prix["modeles"]), os.path.basename(projet), prix["source"]))
    return 0
