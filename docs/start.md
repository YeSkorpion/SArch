# SArch starten

Die Anwendung besteht aus der Weboberfläche, der API und PostgreSQL. Im Browser bleibt alles auf derselben Origin: die Oberfläche leitet `/api` an die API weiter.

## Mit Docker

Voraussetzung ist Docker Compose. Im Projektverzeichnis:

```bash
docker compose up --build
```

Die Oberfläche ist danach unter http://localhost:8080 erreichbar. Compose legt ein persistentes PostgreSQL-Volume an, führt die Migrationen in einem eigenen Schritt aus und startet die API erst danach. Ein gespeichertes Projekt bleibt nach einem Neustart mit demselben Volume erhalten.

Für einen frischen Checkout sind keine Zugangsdaten nötig. Compose verwendet dann die lokalen Entwicklungsvorgaben Benutzer `studio` und Passwort `studio_local_dev`. Echte Zugangsdaten setzt du über eine nicht eingecheckte `.env`, siehe `.env.example`.

Demo-Daten sind aus. Sie entstehen nur, wenn `STUDIO_SEED_DEMO=true` gesetzt ist und dazu die vier Werte `STUDIO_DEMO_OWNER_EMAIL`, `STUDIO_DEMO_EDITOR_EMAIL`, `STUDIO_DEMO_VIEWER_EMAIL` und `STUDIO_DEMO_PASSWORD` außerhalb des Repositorys gesetzt sind. Das Beispielprojekt heißt **Kundenportal** und enthält eine Bestellprüfung von der Anforderung bis zur Architekturentscheidung.

## Ohne Docker

Voraussetzungen: .NET SDK 10, Node.js 24 und PostgreSQL 16 oder neuer.

1. Lege eine Datenbank an und setze die Verbindung, ohne sie ins Repository zu schreiben:

```bash
set ConnectionStrings__Database=Host=127.0.0.1;Port=5432;Database=studio;Username=studio;Password=dein-passwort
set ASPNETCORE_ENVIRONMENT=Development
```

2. Migrationen ausführen und die API starten:

```bash
dotnet run --project src/Studio.Api -- --migrate
dotnet run --project src/Studio.Api
```

Die API lauscht auf http://localhost:5080. Sie wendet Migrationen beim normalen Start nicht selbst an. Fehlen sie, beendet sie sich mit einem Hinweis.

3. Oberfläche starten:

```bash
cd apps/web
npm ci
npm run dev
```

Die Oberfläche ist unter http://localhost:5173 erreichbar, sofern der Port frei ist, und leitet `/api` an Port 5080 weiter. Die Browser-Tests verwenden Port 5175, damit sie nicht mit einer anderen lokalen Anwendung kollidieren.

## Rollen

Rollen gelten je Projekt.

- **Eigentümer** verwalten Name, Archivierung und Mitglieder. Der letzte Eigentümer bleibt erhalten.
- **Bearbeiter** pflegen Inhalte.
- **Betrachter** können lesen und suchen.

Archivierte Projekte bleiben lesbar. Nur ein Eigentümer kann sie wieder öffnen.

## Prüfungen

```bash
dotnet test Studio.slnx
cd apps/web
npm run lint
npx tsc -b --pretty false
npm test
npm run test:e2e
```

Die API-Integrationstests brauchen PostgreSQL. Ohne `STUDIO_TEST_CONNECTION` verwenden sie `Host=127.0.0.1;Port=54329;Database=studio_test;Username=studio`.

## Ablauf der Migrationen

`dotnet Studio.Api.dll --migrate` wendet alle ausstehenden EF-Core-Migrationen an und beendet sich. Compose führt genau diesen Befehl aus, bevor die API Anfragen annimmt. Die Verlaufstabelle heißt `__ef_migrations_history`.
