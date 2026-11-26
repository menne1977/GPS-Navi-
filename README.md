# Navi (GPS-Tacho mit eigenem Navi)

Android-App (Capacitor). Alles aus dem GPS-Tacho (Tempo, Tempolimit, Höhe NN/NAP/Ellipsoid, Kompass, Tankstellen, Stau, Sprachsteuerung, eigene Tacho-Designs) plus ein **eigenes Navi**.
Die App hat eine eigene App-ID (`de.menne.navi`) und läuft neben dem Tacho.

## Navi
- Ziel per Text (🧭) oder Sprache: „Navigiere nach Köln Hauptbahnhof“. Suche über Nominatim (OpenStreetMap).
- Route über Valhalla (OSM Deutschland), ersatzweise OSRM. Kein Schlüssel nötig, kein Live-Verkehr, kein Offline-Betrieb.
- Abbiegepfeil, Entfernung, Straße, Rest, Ankunft, Ansagen (800 m, 250 m, jetzt), automatische Neuberechnung, Kartenansicht in Fahrtrichtung.
- Tempo, Tempolimit, Höhe und Richtung bleiben auf dem Navi-Bildschirm sichtbar.
- Werte für eigene Tachos: `navdist`, `navturn`, `navstreet`, `navremain`, `navdur`, `naveta`.

## Orte, Karte, Parkplatz, zu Fuß
- **Zuhause, Arbeit, Favoriten:** Suchergebnis mit 🏠 💼 ★ speichern oder „Hier ist Zuhause / Arbeit / Favorit“. Sprache: „Navigiere nach Hause“, „Zur Arbeit“, „Speichere diesen Ort als Favorit Bäckerei“.
- **Parkplatz:** „Hier geparkt“ (oder 🅿) merkt den Standort. „Zurück zum Auto“ führt als Fußweg dorthin.
- **Zu Fuß weiter:** 🚶 oder „Zu Fuß weiter“ rechnet das Ziel als Fußweg neu. Fußgänger-Profil von Valhalla.
- **Karte:** Zoom per ＋ ／ －, Zwei-Finger-Zoom oder „Karte zoom rein / raus / automatisch“. Farben: Nacht, Tag, Kontrast, Natur, Grau (🎨 oder „Kartenfarbe Tag“).
- **Mini-Fenster im Tacho:** Abbiegepfeil, Entfernung, Straße, danach-Hinweis, Rest, Ankunft und Himmelsrichtung. Tippen öffnet das Navi.

## Motorrad und Streckenwahl
- Fahrzeug: Auto oder Motorrad (Motorrad-Profil von Valhalla).
- Kurven (Motorrad): egal, wenig, mittel, viele. Die App rechnet mehrere Varianten und misst die Kurvigkeit selbst.
- Streckenart: ausgewogen, schnellste, kürzeste, sparsam (kurz und ohne Autobahn), längste sinnvolle, gemütlich.
- Landschaft: Wald, Felder und Wiesen, Wasser, Heide. Die App prüft per OpenStreetMap, wie viel Strecke an der gewünschten Landschaft liegt, und nimmt die schönste Variante.
- Sprache: „Navi Motorrad“, „Viele Kurven“, „Kürzeste Route“, „Gemütliche Route durch den Wald“, „Wie weit noch“, „Navigation beenden“.

## Bauen
GitHub Actions baut bei jedem Push die Debug-APK (Artefakt `navi-debug-apk`). Symbol: `node`-frei, `python3 tools/make-icon.py`.

## Vermeiden
In den Navi-Optionen unter „Vermeiden“: Autobahn, Mautstraßen, Fähren und „Innenstadt umfahren“ (Städte entlang der Route werden als Sperrfläche umfahren). Lässt sich etwas nicht vermeiden, sagt das Navi es an.
Sprache: „Autobahn vermeiden“, „Ohne Maut“, „Keine Fähren“, „Innenstadt umfahren“, „Alles erlauben“.

## Tacho-Ordner
Jeder erstellte oder geladene Tacho wird automatisch in `Dokumente/Tacho-Designs` auf dem Handy gespeichert (*.tacho.json). Einstellungen → Tacho-Designs: „Alle Tachos in Ordner speichern“ und „Tachos aus Ordner laden“.

## Karte, Beenden, Offline
- Beenden: roter Knopf „Beenden“ unten, ⛔ an der Karte, „✕ Ende“ im Mini-Fenster im Tacho, oder „Navigation beenden“ per Sprache.
- Karte läuft flüssig mit (zwischen den GPS-Punkten weitergerechnet). 🧭 wechselt Fahrtrichtung oben / Norden oben, mit einem Finger lässt sich die Karte verschieben, 🎯 zentriert (nach 15 s automatisch).
- 💾 speichert die Route samt Straßen entlang der Strecke offline; sie erscheint dann unter „Offline-Routen“ in der Suche und lässt sich ohne Internet fahren (Neuberechnen bei Abweichung braucht Internet).
- Sprache: „Karte nach Norden“, „Fahrtrichtung oben“, „Karte zentrieren“, „Route offline speichern“, „Offline-Route <Name>“.

## Auto / zu Fuß / Alternativen
- „Zu Fuß weiter“ merkt das Auto automatisch. 🚗 (oder „Zurück zum Auto“) führt jederzeit zurück, auch mitten in einer Route. Beim Gehen wird das gemerkte Auto nicht überschrieben.
- 🔀 / „Andere Route“ sucht eine Alternative zum selben Ziel. 📤 / „Ankunft teilen“ teilt Ankunftszeit und Standort.

### Navi-Anzeige im Tacho
- Einstellungen → Tacho-Designs → „Navi im Tacho“: Leiste oben, Leiste unten, schwebendes Fenster, nur im eigenen Design oder aus.
- Im Creator gibt es das Element „Navi-Anzeige“ (Aufbau quer/hoch/nur Pfeil, Pfeil-Stil, Farbe, Kasten). Steckt es im Design, erscheint das Navi genau dort.
- Navi → ⚙ Einstellungen (einklappbar): Pfeil-Stil (Klassisch, Schlank, Umriss, Zeichen), Pfeil-Farbe, Schrift und Pfeil (Normal/Groß/Sehr groß), Hintergrund, „danach“ an/aus.
- Kreisverkehr als Grafik mit Ausfahrt-Nummer und Richtung.
- Erste Ansage vor dem Abbiegen: 250 m, 500 m, 750 m, 1 km oder nach Tempo; danach 200 m und beim Abbiegen.
- Sprache: „Ansage bei 1 Kilometer“, „Navi Leiste unten“, „Pfeile groß“.
