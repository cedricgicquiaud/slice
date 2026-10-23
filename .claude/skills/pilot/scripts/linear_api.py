#!/usr/bin/env python3
"""Client minimal pour l'API GraphQL de Linear.

La clé est lue dans ~/.config/pilot/linear.env (ligne LINEAR_API_KEY=...), ou, pour un
autre workspace, dans ~/.config/pilot/linear-<slug>.env (variable LINEAR_WORKSPACE=<slug>,
ou set_workspace("<slug>") en module, ou --workspace <slug> en ligne de commande).
Usage en ligne de commande :
    linear_api.py [--workspace <slug>] '<query graphql>' ['<variables json>']
Usage en module :
    from linear_api import gql, set_workspace
"""
import json
import os
import sys
import urllib.request

CONFIG_DIR = os.path.expanduser("~/.config/pilot")
ENDPOINT = "https://api.linear.app/graphql"
_workspace = os.environ.get("LINEAR_WORKSPACE", "")


def set_workspace(slug: str) -> None:
    """Choisit le workspace : '' ou None = fichier linear.env, sinon linear-<slug>.env."""
    global _workspace
    _workspace = slug or ""


def env_file() -> str:
    return os.path.join(CONFIG_DIR, f"linear-{_workspace}.env" if _workspace else "linear.env")


def load_key() -> str:
    key = os.environ.get("LINEAR_API_KEY")
    if key and not _workspace:
        return key
    ENV_FILE = env_file()
    try:
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if line.startswith("LINEAR_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    sys.exit(
        f"Clé Linear introuvable. Créer {ENV_FILE} avec une ligne LINEAR_API_KEY=lin_api_..."
    )


def gql(query: str, variables: dict | None = None) -> dict:
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        ENDPOINT,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": load_key()},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code} — {detail}") from None
    if "errors" in data:
        raise RuntimeError(json.dumps(data["errors"], ensure_ascii=False, indent=2))
    return data["data"]


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["--workspace"]:
        set_workspace(args[1]); args = args[2:]
    if not args:
        sys.exit(__doc__)
    variables = json.loads(args[1]) if len(args) > 1 else None
    print(json.dumps(gql(args[0], variables), ensure_ascii=False, indent=2))
