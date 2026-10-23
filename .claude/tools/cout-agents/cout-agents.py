#!/usr/bin/env python3
"""Ce qu'a coûté une boucle d'agents : durée, attente, échanges, jetons, appels navigateur, par agent.

Usage :
  python3 .claude/tools/cout-agents/cout-agents.py [dossier du projet] [--detail] [--seuils]
  python3 .claude/tools/cout-agents/cout-agents.py [dossier du projet] --direct [--une-fois] [--notifier] [--depuis 120]

Mode suivre : pendant un run, les grandes étapes de chaque agent, en français, sans code.
  python3 .claude/tools/cout-agents/cout-agents.py [dossier du projet] --suivre [nom d'agent] [--depuis 120]
Une ligne par étape : l'heure, puis la phrase que l'agent a écrite entre deux commandes, ou un
repère mécanique — « commit : test », « commit : code », « tests : 68 verts », « PR ouverte ».
Jamais une commande. Sans nom : un bloc par agent en cours, l'un sous l'autre, les dernières
étapes de chacun, rafraîchi toutes les 10 s. Avec un nom : le flux complet de cet agent, qui
suit jusqu'à son rapport final puis s'arrête.

Mode direct : pendant un run, un tableau des agents en cours, rafraîchi toutes les 30 s, à
lancer dans un second terminal. Une ligne par agent dont
le journal a bougé depuis `--depuis` minutes (120 par défaut) : état, temps actif, jetons relus
contre son seuil, dernier geste. `--une-fois` affiche le tableau et sort (pour le lead, dans
ses messages). `--notifier` envoie les alertes en notification macOS par `cmux notify` si la
commande cmux existe.

Lit les transcripts de sous-agents dans ~/.claude/projects/*/*/subagents/*.jsonl et garde ceux
dont le `cwd` est le projet ou l'un de ses worktrees (`<projet>-<n>`). La session principale
peut donc avoir été lancée depuis n'importe quel dossier.
L'agent est déduit du nom du fichier : agent-a<agent>-<suite>.jsonl (aprod, atest, averif…).

Trois durées par agent :
  horloge  du premier au dernier événement ;
  actif    somme des intervalles de moins de 90 s entre deux événements ;
  attente  somme des intervalles de plus de 90 s — une permission qui attend un humain, une
           commande longue, un agent laissé en veille après son rapport.
Une attente de plus de 5 min est toujours listée avec ce qui la précède. Deux cas, distingués :
  bloqué   le dernier événement avant le trou est une commande : l'agent attendait son résultat
           ou une permission ;
  veille   le dernier événement est un texte (son rapport) : l'agent avait fini et attendait
           qu'on le relance. Rien de perdu, sauf si le lead le relance tard.
"""
import json, os, sys, re, datetime, collections

TROU = 90        # secondes : au-delà, l'agent n'est pas en train de travailler
ATTENTE_MIN = 5  # minutes : au-delà, l'attente est nommée avec sa commande

# Seuils par agent : médiane observée x 2, arrondi. Recalibrés le 09/09 sur les neuf
# livraisons du projet CRM (application avec serveur, base et tests de bout en bout) ; les
# seuils du 31/08 venaient d'une page statique et le testeur les dépassait à chaque passe.
# Les minutes sont du temps actif. Un dépassement n'est pas une faute : c'est un agent à regarder.
SEUILS = {
    "prod":  {"requetes": 450, "jetons_relus_M": 70, "minutes": 90},
    "test":  {"requetes": 160, "jetons_relus_M": 10, "minutes": 25},
    "verif": {"requetes": 120, "jetons_relus_M":  8, "minutes": 15},
    "fix":   {"requetes": 250, "jetons_relus_M": 30, "minutes": 50},
    "audit": {"requetes": 120, "jetons_relus_M":  8, "minutes": 15},
}
# Les fiches actuelles s'appellent producteur, verifier, testeur, correcteur ; les seuils gardent
# les clés courtes des premiers essais (prod, verif, test, fix).
ALIAS = {"retest": "test", "testeur": "test", "retesteur": "test", "producteur": "prod",
         "tdd": "prod", "verifier": "verif", "correcteur": "fix"}

def ts(v):
    try: return datetime.datetime.fromisoformat(v.replace("Z", "+00:00"))
    except Exception: return None

def commande(item):
    """Ce qu'un tool_use a lancé, en une ligne courte, sans le `cd <dossier> &&` qui la précède."""
    inp = item.get("input") or {}
    for k in ("command", "description", "file_path", "pattern", "url"):
        if inp.get(k):
            v = re.sub(r"^\s*cd\s+\S+\s*&&\s*", "", str(inp[k])).strip()
            return f"{item.get('name')} {v[:90]}" if item.get("name") != "Bash" else v[:90]
    return item.get("name") or "?"

def lire(chemin):
    r = dict(actif=0.0, attente=0.0, veille=0.0, horloge=0.0, requetes=0, ecrits=0, relus=0, sortis=0,
             navigateur=0, captures=0, trou=0.0, trou_apres="", trou_a=None, trou_veille=False, cwd="",
             premier=None, dernier=None, derniere_commande="", dernier_type="")
    prev = None; premier = None; derniere_commande = ""; dernier_est_texte = False; dernier_type = ""
    ids = set()
    for ligne in open(chemin, errors="replace"):
        try: d = json.loads(ligne)
        except Exception: continue
        if not r["cwd"] and d.get("cwd"): r["cwd"] = d["cwd"]
        t = ts(d.get("timestamp", ""))
        if t:
            if premier is None or t < premier: premier = t
            dt = (t - prev).total_seconds() if prev else None
            # Un journal n'est pas toujours dans l'ordre : une relance par message, ou deux flux
            # écrits ensemble, y remettent des lignes plus anciennes. Un écart négatif n'est ni du
            # travail ni de l'attente — sans ce garde-fou il se soustrayait au temps actif, jusqu'à
            # le rendre négatif (verifier de la livraison 4.2c, 18/09 : −29 min).
            if dt is not None and dt >= 0:
                if dt <= TROU: r["actif"] += dt
                else:
                    r["attente"] += dt
                    if dernier_est_texte: r["veille"] += dt
                    if dt > r["trou"]:
                        r["trou"] = dt; r["trou_apres"] = derniere_commande; r["trou_a"] = prev
                        r["trou_veille"] = dernier_est_texte
            if prev is None or t > prev: prev = t
        m = d.get("message") or {}
        u = m.get("usage") or {}
        if u:
            r["requetes"] += 1
            r["ecrits"] += (u.get("input_tokens") or 0) + (u.get("cache_creation_input_tokens") or 0)
            r["relus"] += u.get("cache_read_input_tokens") or 0
            r["sortis"] += u.get("output_tokens") or 0
        c = m.get("content")
        if not isinstance(c, list): continue
        if d.get("type") in ("assistant", "user"):
            dernier_type = "tool_use" if any(isinstance(it, dict) and it.get("type") == "tool_use" for it in c) else d["type"]
        if d.get("type") == "assistant":
            # un tour qui finit sur du texte sans appel d'outil : l'agent a rendu, il attend
            dernier_est_texte = not any(isinstance(it, dict) and it.get("type") == "tool_use" for it in c)
        for it in c:
            if not isinstance(it, dict): continue
            if it.get("type") == "tool_use":
                derniere_commande = commande(it)
                if "claude-in-chrome" in it.get("name", ""):
                    r["navigateur"] += 1; ids.add(it.get("id"))
            elif it.get("type") == "tool_result" and it.get("tool_use_id") in ids:
                corps = it.get("content")
                for x in (corps if isinstance(corps, list) else [corps]):
                    if isinstance(x, dict) and x.get("type") == "image": r["captures"] += 1
    if premier and prev: r["horloge"] = (prev - premier).total_seconds() / 60
    r["premier"] = premier; r["dernier"] = prev; r["derniere_commande"] = derniere_commande
    r["dernier_type"] = "texte" if dernier_est_texte else ("commande" if dernier_type == "tool_use" else "reponse")
    r["actif"] /= 60; r["attente"] /= 60; r["veille"] /= 60; r["trou"] /= 60
    return r

def cwd_de(chemin):
    """Le dossier de travail écrit dans la première ligne qui en porte un."""
    with open(chemin, errors="replace") as f:
        for i, ligne in enumerate(f):
            if i > 20: break
            try: d = json.loads(ligne)
            except Exception: continue
            if d.get("cwd"): return d["cwd"]
    return ""

def du_projet(cwd, projet):
    """Le projet lui-même, un sous-dossier, ou un worktree frère `<projet>-<n>` / `<projet>-a`."""
    return cwd == projet or cwd.startswith(projet + "/") or re.match(re.escape(projet) + r"-[A-Za-z0-9]+(/|$)", cwd) is not None

def transcripts(projet):
    base = os.path.expanduser("~/.claude/projects")
    slug = projet.replace("/", "-")
    fichiers = []
    for racine, _, noms in os.walk(base):
        if os.path.basename(racine) != "subagents": continue
        dossier_projet = os.path.relpath(racine, base).split(os.sep)[0]
        for n in noms:
            if not n.endswith(".jsonl"): continue
            f = os.path.join(racine, n)
            cwd = cwd_de(f)
            if (cwd and du_projet(cwd, projet)) or (not cwd and dossier_projet == slug):
                fichiers.append(f)
    return fichiers

def livraison_de(nom):
    """producteur-2-4-champs -> 2-4 ; testeur-25a -> 25a ; correcteur-2-6b -> 2-6b ; sinon None."""
    m = re.match(r"^[a-z]+-((?:\d+-)?\d+[a-z]?)(?:-|$)", nom)
    return m.group(1) if m else None

def lead_de(chemin_agent, debut, fin):
    """Le journal de la session qui a lancé cet agent, lu entre debut et fin : le coût du lead."""
    sess = os.path.dirname(os.path.dirname(chemin_agent))  # .../<slug>/<session>
    journal = sess + ".jsonl"
    r = dict(requetes=0, ecrits=0, relus=0, sortis=0, actif=0.0)
    if not os.path.exists(journal): return None
    prev = None
    for ligne in open(journal, errors="replace"):
        try: d = json.loads(ligne)
        except Exception: continue
        t = ts(d.get("timestamp", ""))
        if not t or t < debut or t > fin: continue
        u = (d.get("message") or {}).get("usage") or {}
        if u:
            r["requetes"] += 1
            r["ecrits"] += (u.get("input_tokens") or 0) + (u.get("cache_creation_input_tokens") or 0)
            r["relus"] += u.get("cache_read_input_tokens") or 0
            r["sortis"] += u.get("output_tokens") or 0
        if prev:
            dt = (t - prev).total_seconds()          # même garde-fou que `lire` : un journal hors d'ordre
            if 0 <= dt <= TROU: r["actif"] += dt     # ne compte ni en travail ni en attente
        if prev is None or t > prev: prev = t
    r["actif"] /= 60
    return r

def nom_agent(chemin):
    """agent-aproducteur-2-5b-vues-0e36c710776937e4.jsonl -> producteur-2-5b-vues"""
    n = os.path.basename(chemin)[:-len(".jsonl")]
    n = re.sub(r"^agent-a", "", n)
    return re.sub(r"-[0-9a-f]{16}$", "", n)

def type_agent(chemin):
    m = re.match(r"agent-a([a-z]+?)-", os.path.basename(chemin))
    a = m.group(1) if m else "autre"
    return ALIAS.get(a, a)

def duree(minutes):
    return f"{minutes/60:.0f} h {minutes%60:02.0f}" if minutes >= 60 else f"{minutes:.0f} min"

def etat(x, maintenant):
    """actif / bloqué / rendu / réfléchit, et la phrase qui va avec."""
    depuis = (maintenant - x["dernier"]).total_seconds() / 60 if x["dernier"] else 0
    cmd = x["derniere_commande"] or "(aucune commande)"
    if depuis * 60 <= TROU:
        return "actif", f"il y a {depuis*60:.0f} s · {cmd}"
    if x["dernier_type"] == "texte":
        return "rendu", f"rapport rendu il y a {duree(depuis)}"
    if x["dernier_type"] == "commande":
        return "bloqué", f"depuis {duree(depuis)} · {cmd}"
    return "réfléchit", f"depuis {duree(depuis)} · après {cmd}"

def alertes_de(x, e, depuis_min):
    s = SEUILS.get(x["type"], {})
    a = []
    if e == "bloqué" and depuis_min > ATTENTE_MIN: a.append(f"bloqué depuis {duree(depuis_min)}")
    if s and x["relus"] / 1e6 > s["jetons_relus_M"]: a.append(f"{x['relus']/1e6:.0f} M relus > {s['jetons_relus_M']}")
    if s and x["actif"] > s["minutes"]: a.append(f"{x['actif']:.0f} min actives > {s['minutes']}")
    if s and x["requetes"] > s["requetes"]: a.append(f"{x['requetes']} échanges > {s['requetes']}")
    return a

def notifier(titre, corps):
    import shutil, subprocess
    if not shutil.which("cmux"): return
    subprocess.run(["cmux", "notify", "--title", titre, "--body", corps],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def tableau_direct(projet, depuis, deja_notifie, avec_notif):
    maintenant = datetime.datetime.now(datetime.timezone.utc)
    lignes = []
    for f in transcripts(projet):
        x = lire(f)
        if not x["dernier"] or (maintenant - x["dernier"]).total_seconds() > depuis * 60: continue
        x["nom"] = nom_agent(f); x["type"] = type_agent(f); lignes.append(x)
    lignes.sort(key=lambda x: x["premier"])
    heure = maintenant.astimezone().strftime("%H:%M:%S")
    out = [f"Agents en cours — {os.path.basename(projet)}  ({len(lignes)} depuis {depuis} min)  {heure}", ""]
    if not lignes:
        out.append("  aucun journal d'agent n'a bougé dans ce délai"); return out
    out.append(f"{'agent':24} {'état':9} {'actif':>7} {'relus':>9}   dernier geste")
    alertes = []
    for x in lignes:
        e, phrase = etat(x, maintenant)
        depuis_min = (maintenant - x["dernier"]).total_seconds() / 60
        s = SEUILS.get(x["type"], {})
        relus = f"{x['relus']/1e6:.0f}/{s['jetons_relus_M']} M" if s else f"{x['relus']/1e6:.0f} M"
        drapeau = " ! " if alertes_de(x, e, depuis_min) else "   "
        out.append(f"{x['nom'][:24]:24} {e:9} {duree(x['actif']):>7} {relus:>9}{drapeau}{phrase[:40]}")
        for a in alertes_de(x, e, depuis_min):
            alertes.append((x["nom"], a))
    actif = sum(x["actif"] for x in lignes); relus = sum(x["relus"] for x in lignes)
    n = collections.Counter(etat(x, maintenant)[0] for x in lignes)
    out.append("")
    out.append(f"Total : {duree(actif)} de travail, {relus/1e6:.0f} M jetons relus — "
               + ", ".join(f"{v} {k}" for k, v in n.items()))
    if alertes:
        out.append(""); out.append("À regarder :")
        for nom, a in alertes:
            out.append(f"  {nom[:32]:32} {a}")
            cle = (nom, a.split(" ")[0])
            if avec_notif and cle not in deja_notifie:
                deja_notifie.add(cle); notifier(f"pilot — {nom}", a)
    return out

def etapes(chemin):
    """Les grandes étapes d'un agent : ses phrases, et les repères mécaniques tirés des commandes."""
    out = []; fini = False; attendus = {}
    for ligne in open(chemin, errors="replace"):
        try: d = json.loads(ligne)
        except Exception: continue
        t = ts(d.get("timestamp", ""))
        m = d.get("message") or {}; c = m.get("content")
        if not t or not isinstance(c, list): continue
        for it in c:
            if not isinstance(it, dict): continue
            if d.get("type") == "assistant" and it.get("type") == "text":
                texte = it.get("text", "").strip()
                if not texte: continue
                premiere = texte.split("\n")[0].strip("# ").strip()
                if len(texte) > 400 and any(k in texte for k in ("## Livraison", "## Audit", "## Passe visuelle", "### ")):
                    out.append((t, "rapport rendu")); fini = True
                elif premiere:
                    out.append((t, "… " + premiere[:110]))
            elif it.get("type") == "tool_use":
                inp = it.get("input") or {}; cmd = str(inp.get("command", ""))
                mc = None
                if "git commit" in cmd:
                    mh = re.search(r"<<\s*'?EOF'?\s*\n(.+)", cmd)
                    mc = mh or re.search(r'git commit[^"]*-m\s+"([^"\n]+)', cmd) or re.search(r"git commit[^']*-m\s+'([^'\n]+)", cmd)
                if mc:
                    msg = mc.group(1).strip(); genre = msg.split(":")[0].strip()
                    out.append((t, f"commit {'test' if genre == 'test' else 'code' if genre in ('feat', 'fix', 'refactor') else genre} — {msg.split(':', 1)[-1].strip()[:80]}"))
                elif "gh pr create" in cmd: out.append((t, "PR ouverte"))
                elif re.search(r"vitest|playwright test|node --test|pytest|npm test|npm run test", cmd): attendus[it.get("id")] = t
            elif it.get("type") == "tool_result" and it.get("tool_use_id") in attendus:
                corps = it.get("content"); s_ = corps if isinstance(corps, str) else " ".join(x.get("text", "") for x in corps if isinstance(x, dict))
                mp = re.search(r"(\d+) passed", s_ or ""); mf = re.search(r"(\d+) failed", s_ or "")
                mp2 = re.search(r"ℹ pass (\d+)", s_ or ""); mf2 = re.search(r"ℹ fail (\d+)", s_ or "")
                verts = (mp and mp.group(1)) or (mp2 and mp2.group(1)); rouges = (mf and mf.group(1)) or (mf2 and mf2.group(1))
                if verts or rouges:
                    ligne = f"tests : {verts or 0} verts" + (f", {rouges} rouges" if rouges and rouges != "0" else "")
                    if out and out[-1][1].startswith("tests :"): out[-1] = (t, ligne)
                    else: out.append((t, ligne))
                del attendus[it.get("tool_use_id")]
    return out, fini

def suivre(projet, nom, depuis):
    import time, shutil
    vus = {}
    while True:
        maintenant = datetime.datetime.now(datetime.timezone.utc)
        fichiers = [f for f in transcripts(projet)
                    if (maintenant.timestamp() - os.path.getmtime(f)) < depuis * 60 and (not nom or nom_agent(f) == nom)]
        if nom:
            if not fichiers:
                print(f"aucun agent « {nom} » en cours (journal bougé depuis {depuis} min)"); return 1
            f = fichiers[0]; lignes, fini = etapes(f)
            if vus.get(f) != len(lignes):
                # le flux dit « ça avance », pas « voilà tout » : les cinq dernières étapes, une ligne chacune
                larg = shutil.get_terminal_size((80, 24)).columns
                print("\033[2J\033[H" + nom + "\n", flush=True)
                for t, x in lignes[-5:]:
                    x = x.replace("\n", " ").replace("**", "")
                    print(f"  {t.astimezone().strftime('%H:%M')}  {x[:max(10, larg - 10)]}", flush=True)
            vus[f] = len(lignes)
            # l'agent a rendu : son dernier événement est un texte sans appel d'outil, et rien depuis 60 s
            x = lire(f)
            rendu = x["dernier_type"] == "texte" and x["dernier"] and (maintenant - x["dernier"]).total_seconds() > 60
            if fini or rendu: print("\n  — fin —"); return 0
        else:
            print("\033[2J\033[H", end="")
            print(f"Étapes des agents en cours — {os.path.basename(projet)}  {maintenant.astimezone().strftime('%H:%M:%S')}\n")
            if not fichiers: print("  aucun agent en cours")
            for f in sorted(fichiers, key=os.path.getmtime):
                lignes, fini = etapes(f)
                print(nom_agent(f) + ("  (rapport rendu)" if fini else ""))
                for t, x in lignes[-8:]: print(f"  {t.astimezone().strftime('%H:%M')}  {x}")
                print()
            print("(rafraîchi toutes les 10 s, Ctrl-C pour sortir ; --suivre <nom> pour le flux complet d\'un agent)")
        try: time.sleep(10 if not nom else 3)
        except KeyboardInterrupt: return 0

def direct(projet, une_fois, avec_notif, depuis):
    import time
    deja = set()
    while True:
        out = tableau_direct(projet, depuis, deja, avec_notif)
        if not une_fois: print("\033[2J\033[H", end="")
        print("\n".join(out))
        if une_fois: return 0
        print("\n(rafraîchi toutes les 30 s, Ctrl-C pour sortir)")
        try: time.sleep(30)
        except KeyboardInterrupt: return 0

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--depuis" in sys.argv:
        i = sys.argv.index("--depuis"); depuis = int(sys.argv[i + 1]); args = [a for a in args if a != sys.argv[i + 1]]
    else: depuis = 120
    if "--suivre" in sys.argv:
        i = sys.argv.index("--suivre")
        nom = sys.argv[i + 1] if len(sys.argv) > i + 1 and not sys.argv[i + 1].startswith("--") and sys.argv[i + 1] not in args[:1] else None
        if nom: args = [a for a in args if a != nom]
        projet = os.path.abspath(args[0]) if args else os.getcwd()
        return suivre(projet, nom, depuis)
    if "--direct" in sys.argv:
        projet = os.path.abspath(args[0]) if args else os.getcwd()
        return direct(projet, "--une-fois" in sys.argv, "--notifier" in sys.argv, depuis)
    detail = "--detail" in sys.argv
    seuils = "--seuils" in sys.argv
    projet = os.path.abspath(args[0]) if args else os.getcwd()

    fichiers = transcripts(projet)
    if not fichiers:
        print(f"Aucun transcript de sous-agent pour {projet}\n"
              f"(cherché dans ~/.claude/projects/*/*/subagents/, par le cwd des transcripts)"); return 1

    par_agent = collections.defaultdict(list)
    for f in fichiers:
        agent = type_agent(f)
        r = lire(f); r["fichier"] = os.path.basename(f); r["chemin"] = f; par_agent[agent].append(r)

    print(f"\nCoût des sous-agents — {os.path.basename(projet)}  ({len(fichiers)} agents)\n")
    print(f"{'agent':10} {'n':>3} {'horloge':>8} {'actif':>6} {'attente':>8} {'échanges':>9} "
          f"{'écrits M':>9} {'relus M':>8} {'navig':>6} {'captures':>9}")
    tot = collections.Counter()
    for agent in sorted(par_agent, key=lambda p: -sum(x["relus"] for x in par_agent[p])):
        L = par_agent[agent]; n = len(L)
        moy = lambda k: sum(x[k] for x in L) / n
        print(f"{agent:10} {n:3} {moy('horloge'):8.1f} {moy('actif'):6.1f} {moy('attente'):8.1f} "
              f"{moy('requetes'):9.0f} {moy('ecrits')/1e6:9.2f} {moy('relus')/1e6:8.1f} "
              f"{moy('navigateur'):6.0f} {moy('captures'):9.1f}")
        for k in ("actif", "attente", "requetes", "ecrits", "relus", "sortis", "navigateur"):
            tot[k] += sum(x[k] for x in L)
    for k in ("veille",):
        tot[k] = sum(x[k] for L in par_agent.values() for x in L)
    bloque = tot['attente'] - tot['veille']
    print(f"\nTotal : {tot['actif']/60:.1f} h de travail d'agents, {bloque/60:.1f} h bloqué sur une commande, "
          f"{tot['veille']/60:.1f} h de veille après rapport, "
          f"{tot['requetes']} échanges, {tot['ecrits']/1e6:.1f} M jetons écrits, {tot['relus']/1e6:.0f} M relus.")

    # --- par livraison : le chiffre qui compte, un résultat accepté et ce qu'il a coûté, reprises comprises
    par_liv = collections.defaultdict(list)
    for agent, L in par_agent.items():
        for x in L:
            code = livraison_de(nom_agent(x["chemin"]))
            if code: par_liv[code].append((agent, x))
    if par_liv:
        print(f"\nPar livraison (tous les agents de la livraison, corrections et repasses comprises) :")
        print(f"{'livraison':10} {'agents':>6} {'actif':>7} {'relus':>8} {'corrections':>12} {'passes test.':>13} {'horloge':>9}")
        for code in sorted(par_liv, key=lambda c: min(x["premier"] for _, x in par_liv[c] if x["premier"]) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)):
            L = par_liv[code]
            actif = sum(x["actif"] for _, x in L); relus = sum(x["relus"] for _, x in L)
            corr = sum(1 for a, _ in L if a == "fix"); tests = sum(1 for a, _ in L if a == "test")
            debuts = [x["premier"] for _, x in L if x["premier"]]; fins = [x["dernier"] for _, x in L if x["dernier"]]
            horloge = (max(fins) - min(debuts)).total_seconds() / 60 if debuts and fins else 0
            print(f"{code:10} {len(L):6} {duree(actif):>7} {relus/1e6:6.0f} M {corr:12} {tests:13} {duree(horloge):>9}")
        print("  actif = minutes de travail d'agents ; corrections = tours de correcteur ; horloge = du premier agent au dernier rapport.")

    # --- le lead : la taxe de coordination, par run (agents regroupés à moins de 30 min d'écart)
    tous = sorted((x for L in par_agent.values() for x in L if x["premier"]), key=lambda x: x["premier"])
    runs = []
    for x in tous:
        if runs and (x["premier"] - runs[-1]["fin"]).total_seconds() < 1800:
            runs[-1]["fin"] = max(runs[-1]["fin"], x["dernier"]); runs[-1]["agents"].append(x)
        else: runs.append({"debut": x["premier"], "fin": x["dernier"], "agents": [x]})
    print(f"\nLe lead, par run (sa session, entre le premier agent lancé et le dernier rapport) :")
    for r in runs[-6:]:
        marge = datetime.timedelta(minutes=3)
        lead = lead_de(r["agents"][0]["chemin"], r["debut"] - marge, r["fin"] + marge)
        quand = r["debut"].astimezone().strftime("%d/%m %H:%M")
        codes = sorted({livraison_de(nom_agent(x["chemin"])) or "?" for x in r["agents"]})
        agents_relus = sum(x["relus"] for x in r["agents"]) / 1e6
        if lead:
            part = 100 * lead["relus"] / 1e6 / (lead["relus"] / 1e6 + agents_relus) if (lead["relus"] + agents_relus) else 0
            print(f"  {quand}  livraisons {', '.join(codes):12} lead : {duree(lead['actif']):>7}, {lead['requetes']:3} échanges, "
                  f"{lead['relus']/1e6:4.0f} M relus — {part:.0f} % des jetons du run")
        else:
            print(f"  {quand}  livraisons {', '.join(codes):12} lead : journal de session introuvable")

    attentes = [x for L in par_agent.values() for x in L if x["attente"] > ATTENTE_MIN]
    print(f"\nAttentes de plus de {ATTENTE_MIN} min :")
    if not attentes: print("  aucune")
    for x in sorted(attentes, key=lambda y: -(y["attente"] - y["veille"])):
        quand = x["trou_a"].astimezone().strftime("%d/%m %H:%M") if x["trou_a"] else "?"
        b = x["attente"] - x["veille"]
        if x["trou_veille"]:
            cause = f"VEILLE après son rapport, relancé {x['trou']:.0f} min plus tard"
        else:
            cause = f"BLOQUÉ {x['trou']:.0f} min après : {x['trou_apres'] or '(aucune commande)'}"
        print(f"  {x['fichier'][:44]:44} bloqué {b:4.0f} min, veille {x['veille']:4.0f} min — {cause} (à {quand})")

    if seuils:
        print("\nAu-dessus des seuils (agents à regarder) :")
        rien = True
        for agent, L in par_agent.items():
            s = SEUILS.get(agent)
            if not s: continue
            for x in L:
                d = []
                if x["requetes"] > s["requetes"]: d.append(f"{x['requetes']} échanges > {s['requetes']}")
                if x["relus"] / 1e6 > s["jetons_relus_M"]: d.append(f"{x['relus']/1e6:.0f} M relus > {s['jetons_relus_M']}")
                if x["actif"] > s["minutes"]: d.append(f"{x['actif']:.0f} min actives > {s['minutes']}")
                if d:
                    rien = False
                    print(f"  {x['fichier'][:44]:44} {', '.join(d)}")
        if rien: print("  aucun")

    if detail:
        print("\nDétail par agent :")
        for agent, L in sorted(par_agent.items()):
            for x in sorted(L, key=lambda y: -y["relus"]):
                print(f"  {agent:7} {x['fichier'][:40]:40} {x['horloge']:6.1f} horl. {x['actif']:5.1f} actif "
                      f"{x['attente']:5.1f} att. {x['requetes']:4} éch. {x['relus']/1e6:5.1f} M relus "
                      f"{x['navigateur']:4} navig.")
    return 0

sys.exit(main())
