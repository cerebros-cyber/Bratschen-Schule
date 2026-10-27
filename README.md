# Bratsche ahoi!

Ein Übungsbegleiter für die Bratsche – für iPad und iPhone, mit Shanties und Piratenliedern.

Die App ist eine Web-App (PWA): In **Safari** öffnen, **Teilen → Zum Home-Bildschirm**,
dann startet sie wie eine normale App im Vollbild und funktioniert auch offline.

Adresse: **https://cerebros-cyber.github.io/Bratschen-Schule/**

## Veröffentlichen (GitHub Pages)

Der Workflow `.github/workflows/pages.yml` veröffentlicht die App automatisch bei jeder Änderung auf `main`.
Einmalig im Repository **Settings → Pages → Build and deployment → Source: GitHub Actions** wählen.

Lokal testen: `npx http-server .` und `http://localhost:8080` öffnen.

## Funktionen

- **Stimmen:** Stimmgerät für die Saiten C, G, D und A mit Zeiger und Hinweisen („Feinstimmer im Uhrzeigersinn drehen“).
  Saite antippen spielt den Bezugston. Kammerton einstellbar (438–443 Hz).
- **Übung (adaptiv):** Die App zeigt Töne im **Bratschenschlüssel**. Du spielst sie, die App hört über das Mikrofon zu und sagt
  **höher** oder **tiefer** (mit Cent-Anzeige). Dein gespielter Ton erscheint als farbige Note neben der Zielnote, so siehst du
  direkt, wo du gelandet bist.
- **Schwierigkeit passt sich an:** Zehn Stufen von den leeren Saiten über die D-Dur-Tonleiter bis zu allen Tönen der ersten Lage.
  Die App merkt sich für jeden Ton, wie sicher er sitzt, übt schwache Töne öfter, geht eine Stufe weiter, wenn du sicher spielst
  (und auch einmal zurück, wenn es zu schwer wird). Mit jeder Stufe werden die Toleranz enger und die Tonfolgen länger.
- **Notenlesen fördern, nicht voraussetzen:** Zu jedem Ton gibt es den Notennamen und ein Griffbrett-Bild (welche Saite,
  welcher Finger). Bei neuen Tönen ist die Hilfe sofort da, bei bekannteren erst nach ein paar Sekunden, bei sicheren nur noch auf
  Wunsch (💡 Tipp). Dazu ein **Notenquiz** nur fürs Lesen.
- **Lieder:** „What Shall We Do with the Drunken Sailor“, „My Bonnie Lies over the Ocean“, „Row, Row, Row Your Boat“,
  „Michael, Row the Boat Ashore“ und kleine Übungsstücke. Anhören oder **mitspielen**: Die App wartet bei jedem Ton, bis er sitzt.
  Lieder werden freigeschaltet, sobald du ihre Töne gelernt hast.
- **Eigene Lieder:** im Logbuch in einer einfachen Schreibweise eintippen (`A4/1 A4/.5 D4/2 | …`).
- **Freies Spiel:** Spiel, was du möchtest – Tonname, Note im Bratschenschlüssel und eine Intonationskurve der letzten Sekunden.
- **Logbuch:** Stufe, Übungstage, Sicherheit jedes Tons, Einstellungen.

Alles bleibt auf dem Gerät. Das Mikrofon wird nur zum Erkennen der Tonhöhe benutzt, nichts wird aufgenommen.

## Tipps

- Das Mikrofon funktioniert nur über **HTTPS** (GitHub Pages) – beim ersten Mal fragt iOS um Erlaubnis.
- Ruhige Umgebung hilft; das iPad/iPhone etwa einen halben bis einen Meter entfernt hinlegen.
- Beim Wechsel in eine andere App schaltet sich das Mikrofon ab; danach einfach wieder „Mikrofon einschalten“ antippen.

## Technik

Reines HTML/CSS/JavaScript ohne Build-Schritt. Tonhöhenerkennung mit dem YIN-Verfahren (`js/pitch.js`), Notensatz als SVG
(`js/staff.js`), Lernpfad in `js/curriculum.js`, Anpassung des Schwierigkeitsgrads in `js/progress.js`, Lieder in `js/songs.js`.
Nach Änderungen an Dateien `VERSION` in `sw.js` erhöhen.
