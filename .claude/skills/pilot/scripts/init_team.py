#!/usr/bin/env python3
"""Crée ou adopte une team Linear et la configure pour le pilotage.

Idempotent : relançable sans dégât, chaque élément est créé seulement s'il manque.

Usage :
    init_team.py --name "Nom du projet" --key ABC [--dry-run]

Ce que ça fait :
  1. Team : trouvée par sa clé, sinon créée.
  2. Statuts de tâche (workflow states) : renommés en français, « Bloquée » ajouté.
  3. Automatisation PR : brouillon -> En cours, PR ouverte -> En revue, merge -> Terminée.
  4. Archivage automatique des tâches terminées : 1 mois.
  5. Labels de tâche : groupe « Type » (code, bug, documentation, contenu, refactoring).
     Labels de feature : groupe « Taille » (S/M/L/XL). Les versions sont des initiatives.
  6. Templates : Feature, Tâche, Bug (le moule Problème / Action / Terminé quand).
  7. Statuts de feature (project statuses, niveau workspace) : vérifiés / complétés.
Affiche un rapport de ce qui a été créé, adopté ou impossible.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from linear_api import gql, set_workspace  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(os.path.dirname(HERE), "reference")

# --- Cibles ------------------------------------------------------------------

# Statuts de tâche : (type Linear, nom cible, noms par défaut à renommer)
ISSUE_STATES = [
    ("backlog", "Backlog", ["Backlog"]),
    ("unstarted", "À faire", ["Todo"]),
    ("started", "En cours", ["In Progress"]),
    ("started", "En revue", ["In Review"]),
    ("started", "Bloquée", []),
    ("completed", "Terminée", ["Done"]),
    ("canceled", "Annulée", ["Canceled"]),
]

# Statuts de feature (project statuses, partagés par tout le workspace)
PROJECT_STATES = [
    ("backlog", "À cadrer", ["Backlog"]),
    ("planned", "Planifiée", ["Planned"]),
    ("started", "En développement", ["In Progress"]),
    ("started", "En revue", []),
    ("completed", "Terminée", ["Completed"]),
    ("completed", "Rétro faite", []),
    ("canceled", "Annulée", ["Canceled"]),
]

LABEL_GROUP = "Type"
LABELS = [
    ("code", "#4EA7FC", "tâche de développement d'une feature"),
    ("bug", "#EB5757", "comportement faux constaté"),
    ("documentation", "#F2C94C", "README, docs d'API, guides"),
    ("contenu", "#BB87FC", "rédaction, données, éléments non logiciels"),
    ("refactoring", "#95A2B3", "amélioration sans changement de comportement"),
]

PROJECT_LABEL_GROUPS = {
    "Taille": [("S", "#4EA7FC", "≤ 2 tâches, une zone"), ("M", "#4CB782", "3–4 tâches"),
               ("L", "#F2C94C", "5–7 tâches ou plusieurs zones"), ("XL", "#EB5757", "> 7 tâches, nouveau sous-système")],
}

AUTO_ARCHIVE_MONTHS = 1

REPORT = []


def say(kind, msg):
    REPORT.append((kind, msg))
    print(f"[{kind}] {msg}")


# --- Helpers -----------------------------------------------------------------


def read_template(name):
    with open(os.path.join(REF, f"template-{name}.md"), encoding="utf-8") as f:
        return f.read().strip()


def find_team(key):
    data = gql(
        "query($key:String!){ teams(filter:{key:{eq:$key}}){ nodes{ id name key } } }",
        {"key": key},
    )
    nodes = data["teams"]["nodes"]
    return nodes[0] if nodes else None


def create_team(name, key, dry):
    if dry:
        say("DRY", f"team {key} « {name} » serait créée")
        return {"id": "dry", "name": name, "key": key}
    data = gql(
        "mutation($name:String!,$key:String!){ teamCreate(input:{name:$name,key:$key}){ team{ id name key } } }",
        {"name": name, "key": key},
    )
    return data["teamCreate"]["team"]


def list_states(team_id):
    data = gql(
        "query($id:ID!){ workflowStates(filter:{team:{id:{eq:$id}}}){ nodes{ id name type position } } }",
        {"id": team_id},
    )
    return data["workflowStates"]["nodes"]


def ensure_issue_states(team_id, dry):
    states = list_states(team_id)
    by_name = {s["name"]: s for s in states}
    result = {}
    for stype, target, defaults in ISSUE_STATES:
        if target in by_name:
            result[target] = by_name[target]["id"]
            say("OK", f"statut « {target} » présent")
            continue
        src = next((by_name[d] for d in defaults if d in by_name), None)
        if src:
            if dry:
                say("DRY", f"statut « {src['name']} » serait renommé « {target} »")
                result[target] = src["id"]
                continue
            try:
                gql(
                    "mutation($id:String!,$name:String!){ workflowStateUpdate(id:$id,input:{name:$name}){ success } }",
                    {"id": src["id"], "name": target},
                )
                say("RENOMMÉ", f"statut « {src['name']} » → « {target} »")
            except RuntimeError as e:
                say("IGNORÉ", f"statut « {src['name']} » non renommable, conservé tel quel ({e.splitlines()[2].strip() if len(e.splitlines())>2 else e})")
            by_name[target] = src
            result[target] = src["id"]
        else:
            if dry:
                say("DRY", f"statut « {target} » ({stype}) serait créé")
                continue
            pos = max([s["position"] for s in states] + [0]) + 1
            data = gql(
                "mutation($teamId:String!,$name:String!,$type:String!,$pos:Float){ workflowStateCreate(input:{teamId:$teamId,name:$name,type:$type,color:\"#F2994A\",position:$pos}){ workflowState{ id } } }",
                {"teamId": team_id, "name": target, "type": stype, "pos": pos},
            )
            result[target] = data["workflowStateCreate"]["workflowState"]["id"]
            say("CRÉÉ", f"statut « {target} »")
    return result


# Événements Linear : draft = PR brouillon, start = PR ouverte, review = relecture demandée,
# mergeable = prête à merger, merge = mergée. (Un commit poussé passe la tâche « En cours » d'office.)
GIT_EVENTS = [("draft", "En cours"), ("start", "En revue"), ("review", "En revue"),
              ("mergeable", "En revue"), ("merge", "Terminée")]


def configure_team(team_id, state_ids, dry):
    # Archivage automatique
    if dry:
        say("DRY", f"archivage auto réglé à {AUTO_ARCHIVE_MONTHS} mois")
    else:
        gql(
            "mutation($id:String!,$p:Float!){ teamUpdate(id:$id,input:{autoArchivePeriod:$p}){ success } }",
            {"id": team_id, "p": float(AUTO_ARCHIVE_MONTHS)},
        )
        say("OK", f"archivage auto des tâches terminées : {AUTO_ARCHIVE_MONTHS} mois")

    # Automatisation PR → statut (sans branche cible = toutes les branches)
    data = gql(
        "query($id:String!){ team(id:$id){ gitAutomationStates{ nodes{ id event state{ id name } targetBranch{ id } } } } }",
        {"id": team_id},
    )
    existing = {n["event"]: n for n in data["team"]["gitAutomationStates"]["nodes"] if not n.get("targetBranch")}
    for event, target in GIT_EVENTS:
        sid = state_ids.get(target)
        if not sid:
            say("MANUEL", f"automatisation PR « {event} » : statut « {target} » introuvable")
            continue
        cur = existing.get(event)
        if cur and cur["state"]["id"] == sid:
            say("OK", f"automatisation PR {event} → « {target} » présente")
            continue
        if dry:
            say("DRY", f"automatisation PR {event} → « {target} » serait {'mise à jour' if cur else 'créée'}")
            continue
        if cur:
            gql(
                "mutation($id:String!,$sid:String!){ gitAutomationStateUpdate(id:$id,input:{stateId:$sid}){ success } }",
                {"id": cur["id"], "sid": sid},
            )
            say("MIS À JOUR", f"automatisation PR {event} → « {target} »")
        else:
            gql(
                "mutation($teamId:String!,$sid:String!,$event:GitAutomationStates!){ gitAutomationStateCreate(input:{teamId:$teamId,stateId:$sid,event:$event}){ success } }",
                {"teamId": team_id, "sid": sid, "event": event},
            )
            say("CRÉÉ", f"automatisation PR {event} → « {target} »")


def ensure_labels(team_id, dry):
    """Groupe « Type » et ses labels au niveau WORKSPACE (partagés par toutes les teams).
    Un label existant de même nom (insensible à la casse) est adopté et déplacé dans le groupe."""
    data = gql("query{ issueLabels{ nodes{ id name isGroup team{ id } parent{ id } } } }")
    labels = data["issueLabels"]["nodes"]
    group = next((l for l in labels if l["name"].lower() == LABEL_GROUP.lower() and l["isGroup"] and not l["team"]), None)
    if not group:
        if dry:
            say("DRY", f"groupe de labels « {LABEL_GROUP} » (workspace) serait créé")
            group = {"id": "dry"}
        else:
            d = gql(
                "mutation($name:String!){ issueLabelCreate(input:{name:$name,isGroup:true}){ issueLabel{ id } } }",
                {"name": LABEL_GROUP},
            )
            group = d["issueLabelCreate"]["issueLabel"]
            say("CRÉÉ", f"groupe de labels « {LABEL_GROUP} » (workspace)")
    else:
        say("OK", f"groupe de labels « {LABEL_GROUP} » présent")
    for name, color, desc in LABELS:
        same = [l for l in labels if l["name"].lower() == name.lower() and not l["isGroup"]]
        in_group = next((l for l in same if l.get("parent") and l["parent"]["id"] == group["id"]), None)
        if in_group:
            say("OK", f"label « {name} » présent")
            continue
        candidate = next((l for l in same if not l["team"]), None) or (same[0] if same else None)
        if dry:
            say("DRY", f"label « {name} » serait {'déplacé dans le groupe' if candidate else 'créé'}")
            continue
        if candidate:
            gql(
                "mutation($id:String!,$name:String!,$color:String!,$desc:String!,$parent:String!){ issueLabelUpdate(id:$id,input:{name:$name,color:$color,description:$desc,parentId:$parent}){ success } }",
                {"id": candidate["id"], "name": name, "color": color, "desc": desc, "parent": group["id"]},
            )
            say("DÉPLACÉ", f"label existant « {candidate['name']} » → « {name} » dans le groupe « {LABEL_GROUP} »")
        else:
            gql(
                "mutation($name:String!,$color:String!,$desc:String!,$parent:String!){ issueLabelCreate(input:{name:$name,color:$color,description:$desc,parentId:$parent}){ success } }",
                {"name": name, "color": color, "desc": desc, "parent": group["id"]},
            )
            say("CRÉÉ", f"label « {name} »")
    unused = [l["name"] for l in labels if not l["team"] and not l["isGroup"] and not l.get("parent")
              and l["name"].lower() not in {n for n, _, _ in LABELS}]
    if unused:
        say("INFO", f"labels par défaut hors groupe, inutilisés : {', '.join(unused)} (supprimables à la main)")


def ensure_project_labels(dry):
    """Groupes de labels de feature (Project labels) au niveau workspace : Taille, Version."""
    data = gql("query{ projectLabels{ nodes{ id name isGroup parent{ id } } } }")
    labels = data["projectLabels"]["nodes"]
    for gname, children in PROJECT_LABEL_GROUPS.items():
        group = next((l for l in labels if l["name"] == gname and l["isGroup"]), None)
        if not group:
            if dry:
                say("DRY", f"groupe de labels de feature « {gname} » serait créé"); group = {"id": "dry"}
            else:
                d = gql("mutation($name:String!){ projectLabelCreate(input:{name:$name,isGroup:true}){ projectLabel{ id } } }", {"name": gname})
                group = d["projectLabelCreate"]["projectLabel"]
                say("CRÉÉ", f"groupe de labels de feature « {gname} »")
        else:
            say("OK", f"groupe de labels de feature « {gname} » présent")
        existing = {l["name"] for l in labels if l.get("parent") and l["parent"]["id"] == group["id"]}
        for name, color, desc in children:
            if name in existing:
                say("OK", f"label de feature « {name} » présent"); continue
            if dry:
                say("DRY", f"label de feature « {name} » serait créé"); continue
            gql("mutation($name:String!,$color:String!,$desc:String!,$parent:String!){ projectLabelCreate(input:{name:$name,color:$color,description:$desc,parentId:$parent}){ success } }",
                {"name": name, "color": color, "desc": desc, "parent": group["id"]})
            say("CRÉÉ", f"label de feature « {name} »")


def ensure_templates(team_id, dry):
    data = gql(
        "query{ templates{ id name type team{ id } } }",
    )
    existing = {t["name"] for t in data["templates"] if t.get("team") and t["team"]["id"] == team_id}
    for name, file in (("Feature", "feature"), ("Tâche", "tache"), ("Bug", "bug")):
        if name in existing:
            say("OK", f"template « {name} » présent")
            continue
        body = read_template(file)
        if dry:
            say("DRY", f"template « {name} » serait créé")
            continue
        template_data = json.dumps({"title": "", "description": body})
        gql(
            "mutation($teamId:String!,$name:String!,$data:JSON!){ templateCreate(input:{type:\"issue\",teamId:$teamId,name:$name,templateData:$data}){ success } }",
            {"teamId": team_id, "name": name, "data": template_data},
        )
        say("CRÉÉ", f"template « {name} »")


def ensure_project_states(dry):
    data = gql("query{ projectStatuses{ nodes{ id name type position } } }")
    states = data["projectStatuses"]["nodes"]
    by_name = {s["name"]: s for s in states}
    for stype, target, defaults in PROJECT_STATES:
        if target in by_name:
            say("OK", f"statut de feature « {target} » présent")
            continue
        src = next((by_name[d] for d in defaults if d in by_name), None)
        if src:
            if dry:
                say("DRY", f"statut de feature « {src['name']} » serait renommé « {target} »")
                continue
            try:
                gql(
                    "mutation($id:String!,$name:String!){ projectStatusUpdate(id:$id,input:{name:$name}){ success } }",
                    {"id": src["id"], "name": target},
                )
                say("RENOMMÉ", f"statut de feature « {src['name']} » → « {target} »")
            except Exception as e:  # noqa: BLE001
                say("MANUEL", f"renommer « {src['name']} » en « {target} » (Settings → Projects) : {e}")
        else:
            if dry:
                say("DRY", f"statut de feature « {target} » serait créé")
                continue
            try:
                pos = max([s["position"] for s in states] + [0]) + 1
                gql(
                    "mutation($name:String!,$type:ProjectStatusType!,$pos:Float!){ projectStatusCreate(input:{name:$name,type:$type,color:\"#F2994A\",position:$pos}){ success } }",
                    {"name": target, "type": stype, "pos": pos},
                )
                say("CRÉÉ", f"statut de feature « {target} »")
            except Exception as e:  # noqa: BLE001
                say("MANUEL", f"créer le statut de feature « {target} » ({stype}) dans Settings → Projects : {e}")


def order_project_states(dry):
    """Remet les statuts de feature dans l'ordre de PROJECT_STATES."""
    data = gql("query{ projectStatuses{ nodes{ id name position } } }")
    by_name = {s["name"]: s for s in data["projectStatuses"]["nodes"]}
    wanted = [t for _, t, _ in PROJECT_STATES if t in by_name]
    changed = []
    for i, name in enumerate(wanted):
        if by_name[name]["position"] != i:
            if not dry:
                gql("mutation($id:String!,$pos:Float!){ projectStatusUpdate(id:$id,input:{position:$pos}){ success } }",
                    {"id": by_name[name]["id"], "pos": float(i)})
            changed.append(name)
    if changed:
        say("DRY" if dry else "RÉORDONNÉ", "statuts de feature : " + " → ".join(wanted))
    else:
        say("OK", "ordre des statuts de feature")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--key", required=True)
    ap.add_argument("--workspace", default="", help="slug du workspace Linear (clé dans linear-<slug>.env) ; vide = linear.env")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    set_workspace(a.workspace)
    key = a.key.upper()
    if not (2 <= len(key) <= 5 and key.isalpha()):
        sys.exit("La clé doit faire 2 à 5 lettres.")

    team = find_team(key)
    if team:
        say("ADOPTÉE", f"team {team['key']} « {team['name']} » existe déjà")
    else:
        team = create_team(a.name, key, a.dry_run)
        say("CRÉÉE", f"team {key} « {a.name} »")

    if team["id"] == "dry":
        print("\n(dry-run : la team n'existe pas encore, les étapes suivantes ne sont pas simulées)")
        return

    state_ids = ensure_issue_states(team["id"], a.dry_run)
    configure_team(team["id"], state_ids, a.dry_run)
    ensure_labels(team["id"], a.dry_run)
    ensure_project_labels(a.dry_run)
    ensure_templates(team["id"], a.dry_run)
    ensure_project_states(a.dry_run)
    order_project_states(a.dry_run)

    print("\n=== Rapport ===")
    for kind, msg in REPORT:
        print(f"{kind:9} {msg}")
    manual = [m for k, m in REPORT if k == "MANUEL"]
    if manual:
        print("\nÀ faire à la main dans Linear :")
        for m in manual:
            print(f"  - {m}")
    print(json.dumps({"teamId": team["id"], "key": team["key"], "name": team["name"]}))


if __name__ == "__main__":
    main()
