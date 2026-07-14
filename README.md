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

## Næsta skref (síðar)
- **AI myndavélalestur**: sjálfvirk stigatalning úr símamyndavél. Þetta er erfitt tölvusjónarverkefni
  og var frestað. Raunhæfasta fyrsta útgáfan: taka mynd af spjaldinu + pikka handvirkt á reiti til
  staðfestingar. Grunnurinn (talnaborð + `{num,ring}` pílur) er tilbúinn til að tengja við slíkt.
