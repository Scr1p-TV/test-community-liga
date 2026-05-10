# UFL Live Draft System — v2

## Was neu ist
- 🔄 **Snake Draft Automation** — automatische Rundenreihenfolge, konfigurierbar
- 🔐 **Team Login** — jedes Team loggt sich mit Namen + Passwort ein
- 👨‍💼 **Commissioner Panel** — Admin-Zugang für Setup, Reset, Skip
- 📺 **OBS Overlay** — `obs.html` als transparentes Browser-Source-Overlay
- 🎬 **Draft Animationen** — Einblend-Karte bei jedem Pick
- 📋 **Pick Queue** — Spieler vormerken, Auto-Pick bei Timer-Ablauf

---

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Haupt-App (Login + Draft) |
| `obs.html` | OBS Overlay (transparenter Hintergrund) |
| `app.js` | Gesamte Draft-Logik |
| `style.css` | Design |
| `firebase-config.js` | Firebase-Zugangsdaten |

---

## SCHRITT 1 — Commissioner Password ändern

In `app.js` Zeile 19:
```js
const COMMISSIONER_PASSWORD = "admin1234";
```
Ändere `admin1234` zu deinem eigenen Passwort.

---

## SCHRITT 2 — Firebase Setup

1. Firebase Console öffnen
2. Realtime Database → Regeln → Testmodus aktivieren:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

---

## SCHRITT 3 — Draft konfigurieren (Commissioner)

1. Website öffnen
2. **Commissioner Login** klicken
3. Passwort eingeben (Standard: `admin1234`)
4. Einstellungen:
   - Anzahl Teams (beliebig!)
   - Spieler pro Team (Runden)
   - Timer-Sekunden
   - Snake Draft an/aus
   - Teamnamen + Passwörter eingeben
   - Spieler-Pool eintragen (einer pro Zeile)
5. **Konfiguration speichern** klicken

---

## SCHRITT 4 — Teams einloggen

Jedes Team öffnet die Website und:
1. Team-Namen eingeben (exakt wie im Commissioner-Panel)
2. Passwort eingeben
3. Draft beitreten

---

## SCHRITT 5 — OBS Overlay einrichten

1. OBS öffnen
2. Quellen → **Browser** hinzufügen
3. URL: `https://DEINNAME.github.io/REPOSITORY/obs.html`
4. Breite: **1920**, Höhe: **1080**
5. ✅ **"Transparenten Hintergrund erzwingen"** aktivieren
6. Overlay über deine anderen Szenen legen

---

## SCHRITT 6 — Draft starten

1. Commissioner: **Zum Draft Board** klicken
2. Timer läuft automatisch
3. Team, das dran ist, kann Spieler draften
4. Bei Timer-Ablauf: Auto-Pick aus der Queue oder Commissioner skippt

---

## Commissioner-Funktionen

| Funktion | Beschreibung |
|---|---|
| Konfiguration speichern | Neuen Draft aufsetzen |
| Draft zurücksetzen | Alle Picks löschen, von vorne starten |
| Pick überspringen | Aktuellen Pick manuell skippen |
| Zum Draft Board | In die Draft-Ansicht wechseln |

---

## Nächste mögliche Upgrades

- 🔁 Trade System
- 🔊 Sound Effects
- 🏷️ Team Logos
- 🎮 Discord Integration
- 💰 Salary Cap
