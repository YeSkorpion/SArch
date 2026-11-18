# SArch

Deutschsprachige Webanwendung, in der Teams ein Softwareprojekt von der Anforderung bis zum technischen Entwurf planen. Anforderungen, Prozessschritte, Screens, Komponenten, Architekturentscheidungen und Dokumente bleiben miteinander verknüpft.

## Start

```bash
docker compose up --build
```

Die Oberfläche läuft danach auf http://localhost:8080. Voraussetzungen, der Start ohne Docker, die Installation auf einem Ubuntu-Server, Rollen und der Migrationsablauf stehen in [docs/start.md](docs/start.md). Der geplante Lieferumfang steht in [docs/implementation-plan.md](docs/implementation-plan.md).

## Ubuntu-Server

Ein Befehl lädt das Projekt von GitHub, installiert es und startet es hinter HTTPS:

```bash
curl -fsSL https://raw.githubusercontent.com/YeSkorpion/SArch/main/deploy/install-ubuntu.sh | sudo bash
```

Voraussetzung ist ein Ubuntu-Server, dessen DNS-Name bereits auf die Maschine zeigt. Voreingestellt ist `www.sarch.systemhaus-ess.de`.

## Annahmen

- Unterstützte Laufzeit ist .NET 10, die aktuelle LTS-Linie.
- Normale Ablaufkanten bleiben in einem Diagramm. Die Beziehung `triggers` darf ein Ereignis in einem anderen Prozess desselben Projekts ansprechen.
- Bedingungen und Ereignisnamen sind Daten. Sie werden nicht ausgeführt.
- Demo-Zugangsdaten und Beispieldaten gibt es nur, wenn der Entwicklungsmodus sie ausdrücklich einschaltet. Das Passwort steht nicht im Repository.
