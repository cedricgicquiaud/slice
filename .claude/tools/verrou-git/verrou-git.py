#!/usr/bin/env python3
"""Verrou git : le merge est humain, la branche principale ne reçoit rien de Claude.

Hook `PreToolUse` de Claude Code sur l'outil Bash. Il lit la commande sur l'entrée standard
(JSON : `tool_input.command`, `cwd`) et refuse, avant exécution :

  - `git push` vers `main`, `master` ou `release`, que la branche soit nommée dans la
    commande (`origin main`, `HEAD:main`, `:main`) ou que ce soit la branche courante du
    dossier (`git push`, `git push -u origin HEAD`) ;
  - tout `git push` forcé (`--force`, `-f`, `--force-with-lease`, refspec `+…`) ;
  - `gh pr merge`, et l'appel direct de l'API de merge (`pulls/<n>/merge`) ;
  - `git merge` ou `git rebase` joués depuis une branche protégée.

Une commande composée (`a && b`, `a ; b`, `a | b`) est examinée morceau par morceau.

Refus : code de sortie 2 et une ligne sur stderr, que Claude lit. Tout le reste passe
(code 0). Une erreur du verrou lui-même laisse passer : il protège, il ne bloque pas le
travail. Origine : `git-guardrails-claude-code` de Matt Pocock (MIT), réduit aux invariants
de la méthode.

Test : `python3 test_verrou.py` dans ce dossier.
"""
import json
import os
import re
import shlex
import subprocess
import sys

PROTEGEES = {"main", "master", "release"}

# Options globales de git qui prennent un argument (git -C <dir> push …).
GIT_OPTIONS_AVEC_ARG = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"}
# Options de push qui prennent un argument.
PUSH_OPTIONS_AVEC_ARG = {"--repo", "--receive-pack", "--exec", "-o", "--push-option",
                         "--signed", "--recurse-submodules", "--force-if-includes"}


def branche_courante(cwd):
    try:
        r = subprocess.run(["git", "-C", cwd, "symbolic-ref", "--short", "-q", "HEAD"],
                           capture_output=True, text=True, timeout=5)
        return r.stdout.strip() or None
    except Exception:
        return None


def nom_de_branche(refspec):
    """`origin/main` → `main`, `refs/heads/main` → `main`, `HEAD:main` → `main`, `+x:y` → `y`."""
    ref = refspec.lstrip("+")
    if ":" in ref:
        ref = ref.split(":", 1)[1]
    ref = re.sub(r"^refs/(heads|remotes/[^/]+)/", "", ref)
    if "/" in ref and ref.split("/", 1)[0] in ("origin", "upstream"):
        ref = ref.split("/", 1)[1]
    return ref


def morceaux(commande):
    """Découpe une ligne shell en commandes simples."""
    return [m.strip() for m in re.split(r"&&|\|\||;|\||\n", commande) if m.strip()]


def sous_commande_git(tokens):
    """(cwd relatif via -C, sous-commande, arguments) ou None si ce n'est pas git."""
    if not tokens or os.path.basename(tokens[0]) != "git":
        return None
    i, rel = 1, None
    while i < len(tokens) and tokens[i].startswith("-"):
        t = tokens[i]
        if t in GIT_OPTIONS_AVEC_ARG:
            if t == "-C" and i + 1 < len(tokens):
                rel = tokens[i + 1]
            i += 2
        else:
            i += 1
    if i >= len(tokens):
        return None
    return rel, tokens[i], tokens[i + 1:]


def refus_push(args, cwd):
    refspecs, cibles_nommees, force, tags_seuls = [], False, False, False
    i = 0
    while i < len(args):
        a = args[i]
        if a in ("-f", "--force", "--force-with-lease") or a.startswith("--force-with-lease="):
            force = True
        elif a in ("--all", "--mirror", "--branches"):
            return f"push {a} refusé : il emporterait la branche principale. Pousse ta branche par son nom."
        elif a == "--tags":
            tags_seuls = True
        elif a == "--delete" or a == "-d":
            pass
        elif a.startswith("-"):
            if a in PUSH_OPTIONS_AVEC_ARG and "=" not in a:
                i += 1
        else:
            refspecs.append(a)
        i += 1
    if force or any(r.startswith("+") for r in refspecs):
        return "push forcé refusé : l'historique partagé ne se réécrit pas."
    # Premier argument positionnel = remote ; les suivants = refspecs.
    for r in refspecs[1:]:
        cibles_nommees = True
        cible = nom_de_branche(r)
        if cible == "HEAD":
            cible = branche_courante(cwd)
        if cible in PROTEGEES:
            return f"push vers « {cible} » refusé : le merge est humain, ouvre une PR depuis ta branche."
    if not cibles_nommees and not tags_seuls:
        b = branche_courante(cwd)
        if b in PROTEGEES:
            return f"push refusé : tu es sur « {b} ». Crée une branche (feature/…, fix/…) et pousse-la."
    return None


def refus(commande, cwd):
    for m in morceaux(commande):
        try:
            tokens = shlex.split(m)
        except ValueError:
            tokens = m.split()
        if not tokens:
            continue
        base = os.path.basename(tokens[0])
        if base == "gh":
            if len(tokens) >= 3 and tokens[1] == "pr" and tokens[2] == "merge":
                return "gh pr merge refusé : le merge est humain."
            if tokens[1:2] == ["api"] and re.search(r"pulls/\d+/merge", m):
                return "merge par l'API refusé : le merge est humain."
            continue
        g = sous_commande_git(tokens)
        if not g:
            continue
        rel, sous, args = g
        cwd_git = os.path.join(cwd, rel) if rel and not os.path.isabs(rel) else (rel or cwd)
        if sous == "push":
            r = refus_push(args, cwd_git)
            if r:
                return r
        elif sous in ("merge", "rebase"):
            b = branche_courante(cwd_git)
            if b in PROTEGEES:
                return f"{sous} sur « {b} » refusé : cette branche n'avance que par les PR mergées par l'humain."
    return None


def main():
    try:
        entree = json.load(sys.stdin)
        commande = (entree.get("tool_input") or {}).get("command") or ""
        cwd = entree.get("cwd") or os.getcwd()
        motif = refus(commande, cwd)
    except Exception:
        return 0
    if motif:
        print(f"Verrou pilot : {motif}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
