#!/usr/bin/env python3
"""Épreuve du verrou : chaque commande, sur main puis sur une branche de feature, doit
être refusée (2) ou laissée passer (0) comme prévu. `python3 test_verrou.py`."""
import json
import os
import subprocess
import sys
import tempfile

ICI = os.path.dirname(os.path.abspath(__file__))
VERROU = os.path.join(ICI, "verrou-git.py")

# (commande, refus attendu sur main, refus attendu sur feature/x)
CAS = [
    ("git push origin main", True, True),
    ("git push origin master", True, True),
    ("git push -u origin release", True, True),
    ("git push origin HEAD:main", True, True),
    ("git push origin feature/x:main", True, True),
    ("git push origin :main", True, True),
    ("git push --delete origin main", True, True),
    ("git push origin refs/heads/main", True, True),
    ("git push", True, False),
    ("git push -u origin HEAD", True, False),
    ("git push origin", True, False),
    ("git push --force origin feature/x", True, True),
    ("git push -f", True, True),
    ("git push --force-with-lease origin feature/x", True, True),
    ("git push origin +feature/x", True, True),
    ("git -C . push origin main", True, True),
    ("cd sub && git push origin main", True, True),
    ("git status && git push origin main", True, True),
    ("npm test; git push origin main", True, True),
    ("gh pr merge 12 --squash", True, True),
    ("gh api -X PUT repos/o/r/pulls/12/merge", True, True),
    ("git merge feature/x", True, False),
    ("git rebase main", True, False),
    # Ce qui passe.
    ("git push -u origin feature/x", False, False),
    ("git push origin feature/x", False, False),
    ("git push origin --delete feature/x", False, False),
    ("git push origin --tags", False, False),
    ("git push --all origin", True, True),
    ("git push --mirror origin", True, True),
    ("git push origin HEAD:feature/x", False, False),
    ("git status", False, False),
    ("git log --oneline main..HEAD", False, False),
    ("git diff main...HEAD", False, False),
    ("git checkout main", False, False),
    ("git pull", False, False),
    ("gh pr create --title x --body y", False, False),
    ("gh pr view 12", False, False),
    ("gh pr list", False, False),
    ("echo 'git push origin main'", False, False),
    ("npm test", False, False),
]


def jouer(commande, cwd):
    entree = json.dumps({"tool_input": {"command": commande}, "cwd": cwd})
    r = subprocess.run([sys.executable, VERROU], input=entree, capture_output=True, text=True)
    return r.returncode == 2, r.stderr.strip()


def depot(branche):
    d = tempfile.mkdtemp(prefix="verrou-")
    subprocess.run(["git", "init", "-q", "-b", "main", d], check=True)
    subprocess.run(["git", "-C", d, "commit", "-q", "--allow-empty", "-m", "init"], check=True,
                   env={**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
                        "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"})
    if branche != "main":
        subprocess.run(["git", "-C", d, "checkout", "-q", "-b", branche], check=True)
    os.makedirs(os.path.join(d, "sub"), exist_ok=True)
    return d


def main():
    sur_main, sur_feature = depot("main"), depot("feature/x")
    echecs = 0
    for commande, attendu_main, attendu_feature in CAS:
        for cwd, attendu, nom in ((sur_main, attendu_main, "main"), (sur_feature, attendu_feature, "feature/x")):
            refuse, message = jouer(commande, cwd)
            if refuse != attendu:
                echecs += 1
                print(f"ÉCHEC  [{nom:9}] {commande!r} : attendu {'refus' if attendu else 'passe'}, obtenu {'refus' if refuse else 'passe'} {message}")
    total = len(CAS) * 2
    print(f"{total - echecs}/{total} cas conformes")
    return 1 if echecs else 0


if __name__ == "__main__":
    sys.exit(main())
