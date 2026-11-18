# Implementierungsplan

SArch verbindet Anforderungen, Prozesse, Screens, Komponenten, Entscheidungen und Dokumentation in einem Projekt. Annahmen stehen in `docs/start.md`.

## Phasen

### 1. Grundgerüst

- Projekte, Docker Compose, Migration, OpenAPI, Designsystem und Projektnavigation.
- Abnahme: die Lösung baut, die API antwortet auf `/health`, die Oberfläche zeigt Anmeldung und leere Projektnavigation.

### 2. Zugriff und Anforderungen

- Registrierung, Anmeldung, Abmeldung, CSRF, Projektrollen, Archiv, Mitglieder, Anforderungen inklusive eindeutiger Schlüssel.
- Abnahme: ein Konto legt ein Projekt und `REQ-001` an; der Datensatz liegt in PostgreSQL; Viewer schreiben nicht; fremde Projekte bleiben unsichtbar.

### 3. Visuelle Planung

- Prozesseditor mit Prüfung, Auslösern, Rückgängig/Wiederholen, Systemdiagramme, Komponenten und Wireframe-Vorschau.
- Abnahme: ein gespeichertes Diagramm behält Positionen, Bedingungen und Kanten nach dem Neuladen; eine Komponente kann mehrfach platziert werden; die Vorschau wechselt den Screen, ohne den Entwurf zu ändern.

### 4. Dokumentation und Rückverfolgbarkeit

- TipTap, Revisionen, Architekturentscheidungen, Suche, typisierte Verknüpfungen, Deep Links und Demo-Projekt.
- Abnahme: eine ältere Revision lässt sich ansehen und als neue Revision wiederherstellen; Suche und Rückverweise öffnen das richtige Ziel.

### 5. Abnahme

- Unit-, Integrations- und Browser-Tests, CI, Desktop- und Mobilprüfung, Startanleitung.
- Abnahme: die Checks unten sind nur nach einem ausgeführten Lauf gesetzt.

## Abnahmekriterien

- [ ] Frischer Compose-Start, erreichbare Oberfläche und API, angewendete Migration, Persistenz über einen Neustart mit bestehendem Volume
- [x] Anforderung, Prozess mit zwei beschrifteten Ausgängen, Verknüpfung zu Screen, Komponente und Ereignis, Reload, Rückverweis öffnet den Knoten
- [x] Wireframe in beiden Rahmen, Vorschaunavigation, Komponente in zwei Diagrammen, Umbenennung, Entfernen einer Platzierung
- [x] Verschachtelte Seite, Architekturentscheidung, Revisionsansicht und Wiederherstellung, Suche und interne Links
- [x] Viewer `403`, fremdes Artefakt `404`, projektübergreifende Beziehung abgelehnt, CSRF, letzter Owner
- [x] Versionskonflikt mit erhaltenem Entwurf, ungültige Kante vollständig abgelehnt, Löschen eines Knotens ohne verwaiste Kanten oder Verweise
- [x] Kernabläufe bei 1440×900 und 390×844, sichtbarer Tastaturfokus, verständliche Lade-, Leer- und Speicherzustände
- [x] Bereiche und gespeicherte Ansichten, zwei Abläufe derselben Komponente mit Begründung, Sprung vom Überblick zum Schritt

## Prüfergebnisse

Ausgeführt am 18. November 2026 auf dem lokalen PostgreSQL-Cluster `127.0.0.1:54329`.

- `dotnet test Studio.slnx`: 16 Unit-Tests und 5 Integrationstests gegen PostgreSQL, 0 Fehler. Abgedeckt sind allgemeine Login-Fehler, fehlendes CSRF, gleichzeitige Anforderungsschlüssel, Versionen, Viewer `403`, fremdes Artefakt `404`, projektübergreifende Beziehung, letzter Owner, ungültige Diagrammkante mit Rollback, Löschen eines Knotens samt Kanten und Verweisen, diagrammübergreifende Auslöser, Komponentenplatzierungen und Dokumentrevisionen inklusive Zyklen.
- `npm test` in `apps/web`: Vitest, 4 Tests, 0 Fehler.
- `npx tsc -b --pretty false` und `npm run build` in `apps/web`: erfolgreich.
- `npx playwright test`: 8 bestanden, 2 übersprungen (die jeweils andere Viewport-Variante). Desktop 1440×900 führt den Planungsablauf aus: Anforderung, Wireframe in beiden Rahmen, Vorschaunavigation, Komponente in zwei Diagrammen, Umbenennung, Entfernen einer Platzierung, Prozess mit beschrifteten Ausgängen, Verknüpfungen, Reload, Rückverweis auf den Knoten, Knotenlschung ohne verbleibende Kanten, verschachtelte Seite, Architekturentscheidung, Revision und Wiederherstellung, Suche, interner Link und sichtbarer Versionskonflikt mit erhaltenem Entwurf. Mobil 390×844 prüft leere Zustände, Navigation, Dokument, Suche, Inspektor und Ladefehler. Tastaturfokus ist an beiden Breiten sichtbar.
- Demo-Projekt „Kundenportal“: mit gesetzten Umgebungsvariablen angelegt und in beiden Breiten geöffnet. `REQ-002` und die Architekturentscheidung sind erreichbar. Der Test bleibt übersprungen, solange `STUDIO_DEMO_EMAIL` und `STUDIO_DEMO_PASSWORD` nicht gesetzt sind.
- `docker compose up --build` wurde nicht ausgeführt. `docker` ist auf diesem Rechner nicht installiert. Compose-Dateien, Migration und Healthcheck sind vorhanden, der Neustart mit Volume aber nicht geprüft.

Nachtrag am 18. November 2026 für Bereiche, gespeicherte Ansichten und die Auswirkung über Diagrammgrenzen:

- `dotnet test tests/Studio.Api.IntegrationTests`: 6 Tests, 0 Fehler. Der neue Test legt zwei Prozessbereiche an, verbindet beide Schritte mit derselben Komponente und jeweils eigener Begründung, benennt die Komponente um und findet danach beide Abläufe, Begründungen und Knotenkennungen in der Übersicht. Ein Bereich aus einem fremden Projekt wird abgelehnt. Die gespeicherte Ansicht filtert auf einen Bereich.
- `npx playwright test e2e/organization.spec.ts --project=desktop`: bestanden. Vom Projektüberblick öffnet der betroffene Schritt das Diagramm mit `?node=` und der Schritt ist ausgewählt. Die bestehende Desktop-Planung `e2e/studio-flow.spec.ts` bleibt bestanden.

## Teamablauf

Die Projektsuche öffnet Prozessknoten über `diagramId` und `?node=`. Fachbereiche und gespeicherte Ansichten setzen `bereich` und `q` gemeinsam. Die bestehende Löschauswirkung und „Auswirkung auf Abläufe“ bleiben erhalten. Die neue Auswirkungsansicht ist ein eigener Endpunkt.

### Auswirkungsansicht

- Abschnitt „Auswirkungen“ an Anforderung, Prozessschritt, Screen, Komponente und Dokument. „Verwendet“ und „Verwendet von“ mit Beziehung, Typ, Titel, Bereich und Deep Link. Weitere Ebenen pro Zweig, Filter, serverseitige Begrenzung und Nachladen.
- Abnahme: zwei Prozesse verwenden denselben Berechtigungsdienst; von der Komponente sind beide Prozesse, ein Screen und eine Architekturentscheidung erreichbar. Zyklus, mehrfacher Pfad und fremdes Projekt sind geprüft.

### Änderungspakete

- Einstieg „Änderungen“. Paket mit Ziel, Bereich, Verantwortlicher Person, Prüfer und Status Entwurf, In Prüfung, Freigegeben. Kommentare bleiben lesbar, wenn das Ziel später fehlt. Einreichen hält eine Fassung fest; Änderungen während der Prüfung markieren sie als überholt.
- Abnahme: „Gastzugriff einführen“ mit Anforderung, Prozessknoten, Wireframe und Architekturentscheidung. Kommentar, Änderungswunsch, neue Fassung, Freigabe, Bearbeitung während der Prüfung und abgelehnte Viewer-Freigabe.

### Projektstände

- Benannte Projektstände und Prüfstände. Vergleich zeigt Hinzugefügt, Geändert, Entfernt und reine Positionsänderungen. Historische Fassungen bleiben ohne aktuelle Projektberechtigung unsichtbar.
- Abnahme: Screen geändert, Beziehung entfernt, Anforderung ergänzt; der Vergleich zeigt alle drei und die ursprüngliche Fassung bleibt lesbar.

### Übergabe und Transfer

- „Übergabe als Markdown“ aus der freigegebenen Fassung. Owner exportieren das Projekt, der Import legt ein neues Projekt an und prüft Format, Größe, Struktur und Verweise vorher.
- Abnahme: Export und Import eines befüllten Projekts, ungültige Datei ohne Teilprojekt, Markdown bleibt nach späterer Bearbeitung gleich.

### Gemeinsame Regeln

- Jede Abfrage und Mutation prüft Projekt und Rolle. Pakete nutzen die bestehende Versionsprüfung. Historie, Kommentare und Pfade öffnen sich bei Bedarf.

### Prüfergebnisse Teamablauf

Ausgeführt am 18. November 2026. Die API lief gegen PostgreSQL `127.0.0.1:54329`, Datenbank `studio`. Die Web-App lief über Vite auf `127.0.0.1:5175`.

- `dotnet test Studio.slnx`: 16 Unit-Tests und 10 Integrationstests, 0 Fehler. Die vier neuen Tests prüfen geteilte Komponentenpfade und Zyklen, Kommentare und abgelehnte Freigaben, den Vergleich von Projektständen und Export sowie Import inklusive ungültiger Datei.
- `npm test`, `npx tsc -b --pretty false` und `npm run build` in `apps/web`: erfolgreich. Vitest bleibt bei 4 Tests.
- Im Browser, angemeldet als Nora im Projekt Kundenportal: von der Komponente Bestell-API führt „Auswirkungen“ zur Anforderung und zum Schritt „Bestellung annehmen“. Der Deep Link öffnet das Diagramm an diesem Knoten. Das Paket „Gastzugriff einführen“ enthält den Schritt, den Screen „Bestellung prüfen“, die Architekturentscheidung ADR-001 und REQ-002. Einreichen, Freigeben und „Übergabe als Markdown“ sind durchlaufen. Die Übergabe nennt Ziel, Fassung 1, REQ-002, ADR-001 und die Links auf Fassung und aktuellen Stand. Die Seite wurde in Hell und Dunkel geprüft. Tastaturfokus liegt über `:focus-visible` mit 2 px Akzentfarbe.
- `docker compose` wurde nicht ausgeführt.

Das Paket „Gastzugriff einführen“ bleibt im Demo-Projekt Kundenportal. Architekturentscheidungen in Paketen werden als Entscheidung gekennzeichnet, nicht als Seite.
