# Viebrans

Ein kleines Handy-MMORPG im Geiste von Flyff — vier Klassen mit je zwei Jobs,
Leveln, Ausrüstung, Fertigkeiten, Dungeons und Reittiere, mit denen man
abheben kann. Damit sich die Welt nicht leer anfühlt, ist sie von einer
KI-Bevölkerung bewohnt, die eigenständig levelt, farmt, im Weltchat redet und
in Gruppendungeons mitkämpft.

Die Welt ist echtes 3D über WebGL (three.js) — sonnig, mit Chibi-Figuren,
Marktständen und Wolken. Es gibt keine einzige Modell- oder Bilddatei: jeder
Baum, jedes Haus und jede Figur wird zur Laufzeit aus Grundformen gebaut.

Läuft vollständig im Browser — kein Server, kein Konto, keine laufenden Kosten.
Der Spielstand liegt lokal im Gerät.

## Starten

```bash
npm install
npm run dev       # Entwicklung, im Handybrowser unter der angezeigten Netzwerkadresse
npm run build     # Produktionsbundle nach dist/
npm run preview   # Produktionsbundle lokal ausliefern
npm run typecheck # nur die Typprüfung
npm run single    # alles in eine einzelne HTML-Datei packen
```

Zum Testen am Handy reicht `npm run dev`: Vite gibt eine Netzwerkadresse aus,
die im selben WLAN vom Handy aus erreichbar ist. Rechner und Handy müssen dafür
im selben Netz sein, und der Port 5173 darf nicht von der Firewall blockiert
werden. `npm run single` erzeugt eine einzelne HTML-Datei ohne jede weitere
Abhängigkeit — die lässt sich verschicken oder irgendwo hochladen.

Für GitHub Pages liegt ein Workflow unter `.github/workflows/pages.yml`. Er
läuft auf `main` und auf Zuruf, setzt aber voraus, dass Pages für das Repo
eingeschaltet ist: **Settings → Pages → Source: GitHub Actions**. Zwei Hürden
dabei — das Actions-Token kann Pages nicht selbst anlegen, und für private
Repos ist Pages kostenpflichtig. Im kostenlosen Tarif muss das Repo also
öffentlich sein, sonst bietet GitHub die Einstellung gar nicht erst an.

Das Spiel ist eine PWA: über „Zum Startbildschirm hinzufügen" landet es als
App-Symbol auf dem Handy und startet im Vollbild, auch offline.

## Spielen

- **Linke Bildschirmhälfte unten**: dort, wo der Daumen aufsetzt, erscheint der Steuerknüppel.
- **Rechte Seite wischen** dreht die Kamera, **zwei Finger** zoomen.
- **Kurz tippen** visiert einen Gegner an oder schickt den Helden zu einem Punkt.
- Die sechs Felder unten sind die Fertigkeitenleiste.
- Die runden Knöpfe rechts: aufsitzen und absteigen, darüber steigen und sinken.
- Am Rechner: `W A S D` laufen, `1`–`6` Fertigkeiten, `Tab` zielt, `M` aufsitzen, `R`/`F` steigen und sinken.

## Fortschritt

| Stufe | Was passiert |
|---|---|
| 1–29 | Basisklasse mit drei gemeinsamen Fertigkeiten (Lv 1, 5, 12) |
| 30 | **Jobwahl** — einmalig und endgültig, öffnet den zweiten Fertigkeitenbaum |
| 30–60 | Job-Fertigkeiten auf Lv 30, 38 und 48; Höchststufe ist 60 |

### Klassen und Jobs

| Basisklasse | Job A | Job B |
|---|---|---|
| Krieger | Klingenmeister (Schaden) | Wächter (Tank) |
| Späher | Bogenschütze (Fernkampf) | Klingentänzer (Krit/Ausweichen) |
| Assist | Kampfmönch (Bruiser) | Ringmeister (Heilung/Buffs) |
| Magier | Elementarist (Flächenschaden) | Psykeeper (Schaden über Zeit, Lebensraub) |

### Ausrüstung

Sieben Slots (Waffe, Kopf, Rumpf, Hände, Füße, Ring, Amulett), vier Seltenheiten
(Normal, Selten, Episch, Legendär) und Aufwertung bis +10 gegen Gold — mit
sinkender Erfolgschance, denn das Gold ist auch bei Misserfolg weg.

Daraus ergibt sich der **Gear-Score**: die Summe aus Itemlevel, Seltenheit und
Aufwertung über alle sieben Slots. Er ist der Türsteher vor den Dungeons.

### Reittiere und Fliegen

Ab Level 15 steht der Stallmeister im Heldenmenü bereit. Jedes Reittier trägt
am Boden, die meisten heben zusätzlich ab — das namensgebende Element des
Vorbilds.

| Reittier | Ab Lv | Boden | Luft |
|---|---|---|---|
| Borstenkeiler | 15 | ×1,55 | bleibt am Boden |
| Hexenbesen | 20 | ×1,35 | ×2,0 bis 340 m |
| Schwebebrett | 25 | ×1,70 | ×2,3 bis 420 m |
| Greif | 40 | ×1,80 | ×2,9 bis 560 m |

In der Luft ist man schneller und für Bodengegner unerreichbar — kann aber
selbst nicht kämpfen. In Instanzen bleibt das Reittier im Stall.

### Dungeons

| Dungeon | Modus | Voraussetzung |
|---|---|---|
| Sickergrotte | Solo | Lv 10, GS 38 |
| Versunkener Steinbruch | Gruppe (4) | Lv 20, GS 105 |
| Thronsaal des Ersten | Gruppe (4), Endstufe | Lv 60, GS 340 |

Jede Instanz ist ein Korridor aus drei Gegnerwellen und einem Boss. Bei
Gruppendungeons füllt der Gruppenfinder die freien Plätze mit passenden Bots —
möglichst mit einem Tank und einem Heiler.

## Das KI-Bot-System

Der eigentliche Kern des Projekts. 64 benannte Charaktere bilden die
Serverbevölkerung:

- Sie **leveln eigenständig weiter**, auch während das Spiel geschlossen ist
  (Offline-Fortschritt gedeckelt auf 12 Stunden). Die Rangliste bewegt sich also von selbst.
- Sie **wählen mit Level 30 ihren Job**, verbessern ihre Ausrüstung und melden sich an und ab.
- Ein Teil von ihnen ist **sichtbar in der Welt** unterwegs, sucht sich Gegner,
  kämpft und stirbt auch mal.
- Im **Weltchat** laufen Smalltalk, Handelsgesuche und Gruppensuche.
- Im **Gruppendungeon** kämpfen sie mit echter Rollen-KI mit: der Wächter setzt
  Spott und hält Aggro, der Ringmeister heilt ab 75 % Leben, Schadensklassen
  arbeiten ihre Fertigkeiten nach Stärke ab.

## Aufbau des Codes

```
src/
  game/        Spiellogik, komplett ohne DOM-Bezug
    types.ts       zentrale Datentypen
    classes.ts     Klassen, Jobs, Statwachstum
    skills.ts      alle 24 Fertigkeiten
    formulas.ts    Erfahrung, Schaden, Rüstung, Gear-Score
    items.ts       Ausrüstungsvorlagen, Beute, Aufwertung
    monsters.ts    Gegner und Bosse
    world.ts       Karte, Zonen, Stadt
    dungeons.ts    Instanzen und Zugangsvoraussetzungen
    bots.ts        KI-Bevölkerung, Fortschritt, Chat, Gruppenfinder
    engine.ts      Kampf, Aggro, KI, Instanzen, Hauptschleife
    player.ts      Spielstand, Fortschritt, Ausrüsten
    save.ts        Speichern und Offline-Fortschritt
    mounts.ts      Reittiere, Flugwerte
  render3d/    3D-Darstellung mit three.js — alles prozedural erzeugt
    palette.ts     Farbwelt
    terrain.ts     Geländehöhe (nur optisch)
    models.ts      Figuren, Gegner, Reittiere, Waffen aus Grundformen
    world3d.ts     Gelände, Stadt, Bewuchs, Wegweiser, Dungeonhalle
    scene.ts       Szene, Kamera, Figurenverwaltung, Animation
    overlay.ts     Namen, Lebensbalken und Schadenszahlen als 2D-Ebene
  ui/          HUD und Menüs als schlichtes DOM
```

Die Spiellogik kennt weder Canvas noch DOM — dieselbe Engine ließe sich später
in einer nativen Hülle oder gegen einen echten Server betreiben.

## Tests

Die Skripte fahren das gebaute Spiel in einem echten mobilen Chromium und
spielen es durch. Vorher muss `npm run build && npm run preview` laufen.

```bash
node smoke.mjs <zielordner>        # Start, Charaktererstellung, alle Menüs
node sw-update-test.mjs           # prüft, dass eine neue Veröffentlichung beim
                                  # bereits installierten Service Worker ankommt
node progression.mjs <zielordner>  # Kämpfen, Jobwahl, Solo- und Gruppendungeon
node balance.mjs                   # misst die Levelgeschwindigkeit über eine Stunde Spielzeit
node shots.mjs <zielordner>        # Bildschirmfotos typischer Spielsituationen
node verify-single.mjs <datei>    # prüft die Einzeldatei-Fassung (Pfad zur HTML-Datei)
```

## Entwicklerkonsole

Im Browser-Log verfügbar, praktisch zum Ausprobieren der späteren Inhalte:

```js
viebrans.setLevel(30)  // Level setzen
viebrans.gearUp(30)    // volle Ausrüstung auf Itemlevel 30
viebrans.giveMounts()  // alle Reittiere freischalten
viebrans.reset()       // Spielstand löschen
```

## Was als Nächstes anstünde

- Quests und ein Questlog statt reinem Grinden
- Minikarte und Schnellreise zwischen den Zonen
- Ton: Treffer, Schritte, Levelaufstieg (als kleine Klangsynthese, ohne Dateien)
- Handel und Flüsterchat mit den Bots statt nur Weltchat
- Gilden, in die man selbst eintreten kann
- Mehr Endgame: wöchentliche Bosse, harte Modi, Aufwertungsschutz
