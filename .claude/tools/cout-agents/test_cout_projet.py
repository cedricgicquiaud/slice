#!/usr/bin/env python3
"""Épreuve du relevé par projet : étape, feature, prix, regroupement. `python3 test_cout_projet.py`."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cout_projet import agreger, cout, du_projet, etape, lire_requetes, rapport, unite  # noqa: E402

PRIX = {
    "claude-opus-5-5": {"entree": 4, "sortie": 20, "lecture_cache": 0.2},
    "claude-haiku-4-5": {"entree": 1, "sortie": 5, "lecture_cache": 0.1},
}
U = {"input_tokens": 1000, "output_tokens": 500, "cache_read_input_tokens": 10000,
     "cache_creation_input_tokens": 2000,
     "cache_creation": {"ephemeral_5m_input_tokens": 0, "ephemeral_1h_input_tokens": 2000}}
# 1000 × 4 + 500 × 20 + 10 000 × 0,2 + 2000 × 4 × 2 = 32 000 → 0,032 $
COUT_U = 0.032


def ligne(req="r1", msg="m1", branche="main", model="claude-opus-5-5", effort="xhigh",
          cwd="/p/ABC", usage=U):
    return json.dumps({"type": "assistant", "requestId": req, "timestamp": "2026-10-05T10:00:00Z",
                       "cwd": cwd, "gitBranch": branche, "effort": effort,
                       "message": {"id": msg, "model": model, "usage": usage}})


class Etape(unittest.TestCase):
    def test_les_agents_de_la_boucle_donnent_leur_etape(self):
        self.assertEqual(etape("feature/ABC-12-x", "producteur"), "production")
        self.assertEqual(etape("feature/ABC-12-x", "tdd-writer"), "production")
        self.assertEqual(etape("feature/ABC-12-x", "verifier"), "vérification")
        self.assertEqual(etape("feature/ABC-12-x", "testeur"), "vérification")
        self.assertEqual(etape("feature/ABC-12-x", "correcteur"), "correction")
        self.assertEqual(etape("main", "contradicteur"), "cadrage")
        self.assertEqual(etape("main", "decoupeur"), "cadrage")

    def test_la_session_principale_est_rangee_par_sa_branche(self):
        self.assertEqual(etape("prd/mon-app", None), "PRD")
        self.assertEqual(etape("roadmap/ABC", None), "roadmap")
        self.assertEqual(etape("cadrage/P-ABC-4-auth", None), "cadrage")
        self.assertEqual(etape("feature/ABC-12-x", None), "pilotage des livraisons")
        self.assertEqual(etape("feat/ABC-12-x", None), "pilotage des livraisons")
        self.assertEqual(etape("fix/ABC-30-bug", None), "tâches isolées")
        self.assertEqual(etape("chore/ABC-31-x", None), "tâches isolées")
        self.assertEqual(etape("main", None), "hors méthode")
        self.assertEqual(etape("docs/sans-code", None), "hors méthode")

    def test_un_autre_agent_suit_la_branche_de_sa_session(self):
        self.assertEqual(etape("cadrage/P-ABC-4-auth", "Explore"), "cadrage")
        self.assertEqual(etape("main", "general-purpose"), "hors méthode")


class Unite(unittest.TestCase):
    def test_le_code_de_la_branche_designe_la_feature_ou_la_tache(self):
        self.assertEqual(unite("cadrage/P-ABC-4-auth"), "P-ABC-4")
        self.assertEqual(unite("feature/ABC-12-champs"), "ABC-12")
        self.assertEqual(unite("fix/ABC-30-bug"), "ABC-30")
        self.assertIsNone(unite("main"))
        self.assertIsNone(unite("roadmap/ABC"))


class Cout(unittest.TestCase):
    def test_entree_sortie_lecture_et_ecriture_du_cache(self):
        self.assertAlmostEqual(cout(U, PRIX["claude-opus-5-5"]), COUT_U)
        u5 = dict(U, cache_creation={"ephemeral_5m_input_tokens": 2000, "ephemeral_1h_input_tokens": 0})
        self.assertAlmostEqual(cout(u5, PRIX["claude-opus-5-5"]), 0.026)

    def test_modele_sans_prix(self):
        self.assertIsNone(cout(U, None))


class Lecture(unittest.TestCase):
    def test_une_requete_repetee_compte_une_fois_et_hors_projet_ignore(self):
        texte = "\n".join([ligne(), ligne(), ligne(req="r2", msg="m2", cwd="/autre"), "{cassé",
                           ligne(req="r3", msg="m3", cwd="/p/ABC-2/src")])
        r = lire_requetes(texte, "/p/ABC", agent=None, vus=set())
        self.assertEqual(len(r), 2)
        self.assertEqual(r[0]["branche"], "main")
        self.assertEqual(r[0]["effort"], "xhigh")

    def test_un_depot_imbrique_dans_le_projet_compte_a_part(self):
        with tempfile.TemporaryDirectory() as projet:
            os.makedirs(os.path.join(projet, "site", ".git"))
            os.makedirs(os.path.join(projet, "src"))
            self.assertTrue(du_projet(os.path.join(projet, "src"), projet))
            self.assertFalse(du_projet(os.path.join(projet, "site"), projet))
            self.assertFalse(du_projet(os.path.join(projet, "site", "content"), projet))

    def test_les_modeles_non_claude_sont_ignores(self):
        self.assertEqual(lire_requetes(ligne(model="<synthetic>"), "/p/ABC", None, set()), [])


class Regroupement(unittest.TestCase):
    def setUp(self):
        vus = set()
        recs = []
        recs += lire_requetes("\n".join([
            ligne(req="a", msg="a", branche="cadrage/P-ABC-4-auth"),
            ligne(req="b", msg="b", branche="feature/ABC-12-x"),
            ligne(req="c", msg="c", branche="main"),
            ligne(req="d", msg="d", branche="main", model="claude-mystere-9"),
        ]), "/p/ABC", None, vus)
        recs += lire_requetes(ligne(req="e", msg="e", branche="feature/ABC-12-x"), "/p/ABC", "producteur", vus)
        recs += lire_requetes(ligne(req="f", msg="f", branche="feature/ABC-12-x", model="claude-haiku-4-5"),
                              "/p/ABC", "verifier", vus)
        self.a = agreger(recs, PRIX)

    def test_total_du_projet(self):
        self.assertEqual(self.a["requetes"], 6)
        # 4 requêtes Opus + 1 Haiku (1000 + 2500 + 1000 + 4000 = 8500 → 0,0085 $) ; le modèle inconnu ne compte pas
        self.assertAlmostEqual(self.a["cout"], 4 * COUT_U + 0.0085)
        self.assertEqual(self.a["sans_prix"], ["claude-mystere-9"])

    def test_par_etape(self):
        e = self.a["par_etape"]
        self.assertAlmostEqual(e["cadrage"]["cout"], COUT_U)
        self.assertAlmostEqual(e["production"]["cout"], COUT_U)
        self.assertAlmostEqual(e["vérification"]["cout"], 0.0085)
        self.assertEqual(e["hors méthode"]["requetes"], 2)

    def test_par_feature_avec_le_detail_des_etapes(self):
        u = self.a["par_unite"]
        self.assertAlmostEqual(u["ABC-12"]["cout"], 2 * COUT_U + 0.0085)
        self.assertAlmostEqual(u["ABC-12"]["etapes"]["pilotage des livraisons"], COUT_U)
        self.assertAlmostEqual(u["P-ABC-4"]["etapes"]["cadrage"], COUT_U)

    def test_modele_et_effort_les_plus_frequents_par_etape(self):
        self.assertEqual(self.a["par_etape"]["vérification"]["reglage"], "claude-haiku-4-5 · xhigh")


class Rapport(unittest.TestCase):
    def test_dit_ce_qui_est_mesure_et_ce_qui_est_calcule(self):
        a = agreger(lire_requetes(ligne(branche="cadrage/P-ABC-4-auth"), "/p/ABC", None, set()), PRIX)
        t = rapport(a, "ABC", "tarifs du 06/10/2026")
        self.assertIn("Tokens mesurés", t)
        self.assertIn("équivalent en prix d'API", t)
        self.assertIn("tarifs du 06/10/2026", t)
        self.assertIn("cadrage", t)
        self.assertIn("P-ABC-4", t)
        self.assertIn("0,03 $", t)


if __name__ == "__main__":
    unittest.main()
