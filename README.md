# Píla 🎯 — Pílu-stigatafla (PWA)

Vefapp til að halda utan um pílustig. Static PWA — engin backend, engin build-skref.
Öll gögn geymast í `localStorage` í símanum/vafranum. Virkar án nettengingar (service worker).

## Leikir
- **X01** — 301 / 501 / 701, double/straight in & out, sett og legg (fyrstur í…).
- **Cricket** — loka 15–20 og bull, með/án stiga, venjulegt eða Cut Throat.
- **Killer** 💀 — verðu killer og sláðu andstæðinga út.
- **Around the Clock** 🕐 — hittu 1, 2, 3 … 20 og bull í röð.
- **Shanghai** 🀄 — umferð fyrir hverja tölu; single+double+triple = sjálfvirkur sigur.
- **Golf** ⛳ — holur 1–9 (eða 18), lægst skor vinnur.
- **Halve It** ➗ — hittu markið, annars helmingast stigin þín.

Leikmenn, slembin röð og öll leikjasaga eru í appinu (flipar neðst).

## Keyra staðbundið
ES modules krefjast HTTP (ekki `file://`). Í möppunni:

```bash
python3 -m http.server 8777
# opnaðu http://localhost:8777
```

## Setja á GitHub Pages
1. Búðu til git repo af þessari möppu og ýttu á GitHub.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Appið birtist á `https://<notandi>.github.io/<repo>/`.

Allar slóðir eru afstæðar (`./`) svo það virkar í undirmöppu Pages.

## Uppbygging
```
index.html            skel
css/style.css         stílar (ljóst + dökkt þema)
js/app.js             aðalstýring: heimaskjár, flipar, leikjaskjár
js/store.js           leikmenn + saga (localStorage)
js/keypad.js          sameiginlegt talnaborð (skilar pílum {num,ring})
js/board.js           pikka-á-spjald innsláttur (SVG-spjald → {num,ring})
js/camera.js          myndataka, 4 punkta kvörðun og pikk á ljósmynd
js/games/base.js      sameiginlegt: undo (snapshot), spilaraspjöld
js/games/*.js         einn leikur hver (x01, cricket, killer, clock, shanghai, golf, halveit)
manifest.webmanifest  PWA
sw.js                 offline cache (network-first fyrir kóða)
icons/                app-táknmyndir
```

### Að bæta við leik
Búðu til `js/games/minn.js` sem flytur út `meta` (`{id,name,emoji,tagline,minPlayers,maxPlayers,options}`)
og `class Game extends GameBase` með aðferðunum: `title() subtitle() status() dart(d) miss() undo()
render(root) historyEntry()` og eiginleikunum `finished` / `winnerId`. Skráðu hann svo í `GAMES` fylkið í `js/app.js`.

## Innsláttur
Þrír hamir, skiptanlegir með 🎯/⌨️/📷 hnöppunum í leik (valið vistast):
- **Talnaborð**: tala + TVÖFALT/ÞREFALT á undan fyrir margfeldi.
- **Pikka á spjald** (`js/board.js`): teiknað SVG-píluspjald; pikkaðu þar sem pílan lenti og
  stigin reiknast sjálf. Merki sýna pílur umferðarinnar. Hringirnir eru örlítið breiðari en á
  alvöru spjaldi svo þrefalt/tvöfalt sé þægilegt að hitta á símaskjá.
- **Mynd + pikk** (`js/camera.js`): taktu mynd, kvarðaðu einu sinni með D20/D6/D3/D11 og pikkaðu
  á allt að þrjár pílur. Myndin er miðjuskorin í stóran ferning svo spjaldið nýtir símaskjáinn.
  Fjögurra punkta homography leiðréttir skáhorn myndarinnar. Hægt er að
  fjarlægja hvert gildi og pikka aftur áður en allt kastið er staðfest. Kvörðun geymist aðeins í
  `localStorage`; myndin helst í minni og er hvorki send né vistuð í leikjasögu.

## AI-vegvísir (áfangar)
1. ✅ **Pikka á spjald** — sama staðfestingar-UI og AI mun nota (`scoreAt(x,y)` er hrein fall).
2. ✅ **Mynd + pikk**: myndavél sýnir spjaldið, notandi kvarðar (4 punktar) og pikkar á ljósmyndina;
   vörpun (homography) reiknar stigin.
3. ✅ **Full AI (beta)**: DeepDarts D2 (TF.js, `js/camera-ai.js`) finnur pílur + kvörðunarpunkta
   í rauntíma; forfyllir umferðina og notandi staðfestir/lagar. Einnar myndavélar nákvæmni er
   ~85–95% svo staðfestingarskrefið er hluti af hönnuninni.
4. ✅ **Diff-vél (beta, `js/diff.js`)**: D2-módelið alhæfir illa á ókunnug píluútlit, svo
   pílufundurinn styðst líka við rammasamanburð: þegar hreyfing róast er „kyrra-mynd" tekin,
   næsta ró borin saman við hana (reki leiðréttur með kvörðunarpunktunum) og nýir blettir =
   nýjar pílur. Oddur = sá endi blettsins sem er næst bull; veik módelgreining (≥6%) á
   blettinum fínstillir oddinn. Módel-lestur (≥28%) og diff vinna saman.

### Rúmfræði myndavélarinnar (mikilvægt við breytingar)
- DeepDarts-kvörðunarpunktarnir sitja á **vírunum** 9° rangsælis við ásana (5/20, 13/6, 3/17,
  8/11 vírarnir) við **ytri brún** tvöfalda hringsins — sjá `AI_TARGETS` í `js/camera.js`.
- Handvirka kvörðunin notar miðjur tvöfalda beðsins á ásunum (165/170) — `MANUAL_TARGETS`.
- Vörpuð myndavélarhnit flokkast með **alvöru hlutföllum** (`scoreAtReal` í `js/board.js`),
  ekki breikkuðu fingrahringjunum sem teiknaða spjaldið notar.
- AI „zoomar" sjálfkrafa inn á spjaldið eftir að það finnst (DeepDarts var þjálfað á myndum
  þar sem spjaldið fyllir rammann).
- Prófin í `tests/run.mjs` innihalda fixture úr `d2_pred.JPG` viðmiðunarmynd deep-darts;
  vænt gildi (4, 18, DB) eru merkingar viðmiðunarútfærslunnar sjálfrar.

## Prófanir
```bash
node tests/run.mjs
```
Leikjalógík, spjald-rúmfræði og myndavélarkvörðun — keyrist án vafra.
