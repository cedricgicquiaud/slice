#!/usr/bin/env node
// Passe visuelle d'un écran : captures, débordement, parcours clavier, thème sombre, console.
// Usage : node passe-visuelle.mjs --url http://localhost:8765/#agenda --out .pilot/recette/2026-08-31-agenda
//   --widths 1280,375   largeurs à jouer (défaut 1280,375)
//   --tabs 25           nombre de tabulations du parcours clavier (défaut 25)
//   --init fichier.js   script évalué dans la page avant chargement
//   --amorce a.js,b.js  code évalué dans la page APRÈS chargement puis rechargement :
//                       c'est là qu'on crée un compte et des données pour voir un écran rempli ;
//                       plusieurs fichiers séparés par des virgules, joués dans l'ordre
//   --storage état.json état de session Playwright (cookies, localStorage)
// Agir AVANT la capture, pour ce qui ne s'affiche qu'après un geste (palette, menu, dialogue) :
//   --clic "sélecteur"  clique cet élément (sélecteur CSS ou texte : text=Nouveau)
//   --touche "Meta+K"   presse ce raccourci (syntaxe Playwright : Meta+K, Escape, ArrowDown)
//   --saisie "acm"      tape ce texte dans l'élément qui a le focus
//   --action fichier.js code évalué dans la page, sans rechargement, pour tout le reste
//   --attendre "sél."   attend que cet élément soit visible avant de photographier (5 s au plus)
//   Ordre : clic, touche, saisie, action, attente. Chaque geste est rejoué à chaque largeur et
//   chaque thème, sur une page neuve.
// Le serveur de l'application, lancé et arrêté par l'outil, jamais par l'agent :
//   --serveur "npm run dev"  commande de la ligne `Lancer l'app :` de la section Pilot.
//                       L'outil la lance dans son propre groupe de processus, attend que l'URL
//                       réponde (60 s au plus), fait la passe, puis arrête tout le groupe.
//                       Si l'URL répond déjà avant le lancement, il ne lance rien et n'arrête rien.
// L'image pour la PR, celle que l'humain regarde avant de merger :
//   --pr .pilot/pr/<CODE>/<écran>.jpg  la capture 1280 px en clair, en JPEG, coupée à 2000 px
//                       de haut : trois à cinq fois plus légère que le PNG, elle est commitée
//                       dans la branche par le lead et affichée dans le rapport de PR.
// Sortie : les captures et `mesures.json` dans --out, un résumé lisible sur la sortie standard.

import { chromium } from 'playwright'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { spawn } from 'node:child_process'

const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d
}
const url = arg('url')
if (!url) { console.error('--url est obligatoire'); process.exit(2) }
const out = arg('out', '.pilot/recette/passe')
const widths = arg('widths', '1280,375').split(',').map(Number)
const tabs = Number(arg('tabs', 25))
const initFile = arg('init')
const storage = arg('storage')
const amorces = (arg('amorce', '') || '').split(',').map(f => f.trim()).filter(Boolean)
const clic = arg('clic')
const touche = arg('touche')
const saisie = arg('saisie')
const actionFile = arg('action')
const attendre = arg('attendre')
const serveur = arg('serveur')
const imagePr = arg('pr')

// --- le serveur de l'application ----------------------------------------------------

const repond = async () => {
  try { const r = await fetch(url, { redirect: 'manual' }); return r.status < 500 } catch { return false }
}
let processusServeur = null
if (serveur) {
  if (await repond()) {
    console.log(`Serveur déjà en place sur ${url} : l'outil ne lance rien et n'arrêtera rien.`)
  } else {
    processusServeur = spawn(serveur, { shell: true, detached: true, stdio: 'ignore' })
    processusServeur.unref()
    const debut = Date.now()
    while (!(await repond())) {
      if (Date.now() - debut > 60000) {
        console.error(`Le serveur « ${serveur} » ne répond pas sur ${url} après 60 s.`)
        try { process.kill(-processusServeur.pid, 'SIGTERM') } catch {}
        process.exit(2)
      }
      await new Promise(r => setTimeout(r, 500))
    }
    console.log(`Serveur lancé par l'outil (« ${serveur} », groupe ${processusServeur.pid}), ${url} répond.`)
  }
}
const arreterServeur = () => {
  if (!processusServeur) return
  // tout le groupe : npm et le processus qu'il a lancé, pas seulement le premier
  try { process.kill(-processusServeur.pid, 'SIGTERM') } catch {}
  processusServeur = null
}
process.on('exit', arreterServeur)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { arreterServeur(); process.exit(130) })

// --- mesures faites dans la page -------------------------------------------------

function mesuresDansLaPage () {
  const vw = window.innerWidth
  const visible = el => {
    const s = getComputedStyle(el)
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'
  }
  const nom = el => {
    if (!el) return null
    const t = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${t ? ' « ' + t + ' »' : ''}`
  }

  // 1. débordement horizontal
  const scrollWidth = document.documentElement.scrollWidth
  const deborde = []
  if (scrollWidth > vw + 1) {
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.right > vw + 1) deborde.push({ element: nom(el), droite: Math.round(r.right) })
    }
  }

  // 2. éléments en position fixe qui recouvrent du texte
  const recouvrements = []
  const fixes = [...document.querySelectorAll('body *')].filter(el => {
    const s = getComputedStyle(el)
    return (s.position === 'fixed' || s.position === 'sticky') && visible(el) &&
           el.getBoundingClientRect().width > 0
  })
  for (const f of fixes) {
    const rf = f.getBoundingClientRect()
    if (rf.width === 0 || rf.height === 0) continue
    for (const el of document.querySelectorAll('body p, body a, body span, body h1, body h2, body h3, body li, body label, body td')) {
      if (f.contains(el) || el.contains(f) || !visible(el)) continue
      if (!(el.innerText || '').trim()) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) continue
      const ox = Math.min(rf.right, r.right) - Math.max(rf.left, r.left)
      const oy = Math.min(rf.bottom, r.bottom) - Math.max(rf.top, r.top)
      if (ox > 2 && oy > 2) {
        recouvrements.push({ fixe: nom(f), recouvre: nom(el), zone: `${Math.round(ox)}x${Math.round(oy)} px` })
      }
    }
  }

  return {
    largeur: vw,
    scrollWidth,
    debordement: scrollWidth > vw + 1 ? scrollWidth - vw : 0,
    elementsQuiDebordent: deborde.slice(0, 10),
    recouvrements: recouvrements.slice(0, 10)
  }
}

function etatDuFocus () {
  const el = document.activeElement
  if (!el || el === document.body) return { fin: true }
  const s = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  const contour = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) ||
                  (s.boxShadow && s.boxShadow !== 'none')
  const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  return {
    element: `${el.tagName.toLowerCase()}${t ? ' « ' + t + ' »' : ''}`,
    contourVisible: contour,
    boite: `${Math.round(r.width)}x${Math.round(r.height)}`,
    boiteVide: r.width < 1 || r.height < 1,
    horsEcran: r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth
  }
}

// --- déroulé ----------------------------------------------------------------------

await mkdir(out, { recursive: true })
// Utilise le Chrome installé sur la machine (aucun navigateur à télécharger) ;
// repli sur le Chromium fourni par Playwright s'il est présent.
const navigateur = await chromium.launch({ channel: 'chrome' })
  .catch(() => chromium.launch())
const mesures = { url, date: new Date().toISOString(), largeurs: {}, console: [], gestesRates: [], ecransInattendus: [] }
const captures = []

for (const largeur of widths) {
  for (const theme of ['light', 'dark']) {
    const contexte = await navigateur.newContext({
      viewport: { width: largeur, height: 900 },
      colorScheme: theme,
      storageState: storage ? JSON.parse(await readFile(storage, 'utf8')) : undefined
    })
    const page = await contexte.newPage()
    // le favicon absent est demandé par le navigateur, pas par l'application : ce n'est pas un défaut
    const bruit = t => /favicon/i.test(t)
    page.on('console', m => {
      if (m.type() === 'error' && !bruit(m.text() + m.location()?.url)) {
        mesures.console.push(`${largeur}px/${theme} : ${m.text().slice(0, 200)}`)
      }
    })
    page.on('pageerror', e => mesures.console.push(`${largeur}px/${theme} : ${String(e).slice(0, 200)}`))
    if (initFile) await page.addInitScript({ path: initFile })

    await page.goto(url, { waitUntil: 'networkidle' }).catch(() => page.goto(url))
    for (const amorce of amorces) {
      // le code de l'amorce est enveloppé et attendu : sinon la page est rechargée
      // avant la fin des opérations asynchrones (création de compte, écritures)
      const code = await readFile(amorce, 'utf8')
      await page.evaluate(`(async () => { ${code}\n })()`)
    }
    if (amorces.length) {
      // Recharger l'URL demandée, pas la page courante : sur un écran protégé, le premier
      // chargement a redirigé vers la connexion, et c'est là que l'amorce a ouvert la session.
      // Passer par une page vide force un vrai chargement, y compris sur une URL à fragment
      // (#agenda), que goto seul ne recharge pas.
      await page.goto('about:blank')
      await page.goto(url, { waitUntil: 'networkidle' }).catch(() => page.goto(url))
    }
    // les gestes avant capture : ce qui ne s'affiche qu'après un clic ou un raccourci
    const geste = async (nom, f) => {
      try { await f() } catch (e) { mesures.gestesRates.push(`${largeur}px/${theme} : ${nom} — ${String(e.message || e).split('\n')[0].slice(0, 160)}`) }
    }
    if (clic) await geste(`clic ${clic}`, () => page.locator(clic).first().click({ timeout: 5000 }))
    if (touche) await geste(`touche ${touche}`, () => page.keyboard.press(touche))
    if (saisie) await geste(`saisie ${saisie}`, () => page.keyboard.type(saisie, { delay: 30 }))
    if (actionFile) await geste(`action ${actionFile}`, async () => {
      const code = await readFile(actionFile, 'utf8')
      await page.evaluate(`(async () => { ${code}\n })()`)
    })
    if (attendre) await geste(`attendre ${attendre}`, () => page.locator(attendre).first().waitFor({ state: 'visible', timeout: 5000 }))
    await page.waitForTimeout(600)
    // l'écran photographié est-il celui demandé ? (une redirection vers la connexion, par exemple)
    const cheminDemande = new URL(url).pathname + new URL(url).hash
    const cheminObtenu = new URL(page.url()).pathname + new URL(page.url()).hash
    if (cheminObtenu !== cheminDemande) mesures.ecransInattendus.push(`${largeur}px/${theme} : ${cheminObtenu} au lieu de ${cheminDemande}`)

    const fichier = join(out, `${largeur}-${theme === 'dark' ? 'sombre' : 'clair'}.png`)
    await page.screenshot({ path: fichier, fullPage: true })
    captures.push(fichier)
    if (imagePr && largeur === widths[0] && theme === 'light') {
      const hauteur = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), 2000)
      await mkdir(dirname(imagePr), { recursive: true })
      await page.screenshot({ path: imagePr, type: 'jpeg', quality: 80, fullPage: true,
        clip: { x: 0, y: 0, width: largeur, height: hauteur } })
    }

    if (theme === 'light') {
      const m = await page.evaluate(mesuresDansLaPage)
      // parcours clavier ; après un geste, on part de l'élément qui a le focus (la palette),
      // pas du corps de la page, sinon le parcours la refermerait ou la sauterait
      const clavier = []
      if (!clic && !touche && !saisie && !actionFile) await page.evaluate(() => document.body.focus())
      for (let i = 0; i < tabs; i++) {
        await page.keyboard.press('Tab')
        const e = await page.evaluate(etatDuFocus)
        if (e.fin) break
        clavier.push(e)
      }
      m.clavier = {
        elementsParcourus: clavier.length,
        sansContour: clavier.filter(e => !e.contourVisible).map(e => e.element),
        boiteVide: clavier.filter(e => e.boiteVide).map(e => e.element),
        horsEcran: clavier.filter(e => e.horsEcran).map(e => e.element)
      }
      mesures.largeurs[largeur] = m
    }
    await contexte.close()
  }
}
await navigateur.close()
arreterServeur()
await writeFile(join(out, 'mesures.json'), JSON.stringify(mesures, null, 2))

// --- résumé lisible ---------------------------------------------------------------

console.log(`\nPasse visuelle — ${url}`)
console.log(`Captures : ${captures.length} dans ${out}` + (imagePr ? ` · image pour la PR : ${imagePr}` : '') + '\n')
for (const [largeur, m] of Object.entries(mesures.largeurs)) {
  console.log(`## ${largeur} px`)
  console.log(m.debordement
    ? `  DÉBORDEMENT de ${m.debordement} px (page ${m.scrollWidth} pour ${m.largeur})` +
      m.elementsQuiDebordent.map(e => `\n    - ${e.element} jusqu'à x=${e.droite}`).join('')
    : '  pas de débordement horizontal')
  console.log(m.recouvrements.length
    ? '  RECOUVREMENTS :' + m.recouvrements.map(r => `\n    - ${r.fixe} recouvre ${r.recouvre} sur ${r.zone}`).join('')
    : '  aucun recouvrement d\'élément fixe')
  const k = m.clavier
  console.log(`  clavier : ${k.elementsParcourus} éléments parcourus`)
  if (k.sansContour.length) console.log(`    SANS CONTOUR VISIBLE (${k.sansContour.length}) : ${k.sansContour.slice(0, 5).join(', ')}`)
  if (k.boiteVide.length) console.log(`    BOÎTE VIDE 0x0 : ${k.boiteVide.slice(0, 5).join(', ')}`)
  if (k.horsEcran.length) console.log(`    HORS ÉCRAN : ${k.horsEcran.slice(0, 5).join(', ')}`)
  console.log('')
}
console.log(mesures.console.length ? `Console : ${mesures.console.length} erreur(s)\n  ${mesures.console.slice(0, 5).join('\n  ')}` : 'Console : aucune erreur')
if (mesures.gestesRates.length) {
  console.log(`\nGESTES RATÉS (l'écran photographié n'est peut-être pas celui attendu) :\n  ${mesures.gestesRates.join('\n  ')}`)
  process.exitCode = 1
}
if (mesures.ecransInattendus.length) {
  console.log(`\nÉCRAN INATTENDU (l'image n'est pas celle de l'écran demandé ; session absente ou amorce sans effet ?) :\n  ${mesures.ecransInattendus.join('\n  ')}`)
  process.exitCode = 1
}
