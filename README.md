# FTB Tournament Platform

FTB ist eine selbst gehostete Turnierplattform, die standardmäßig auf Flunkyball ausgelegt ist. Die Sportart kann im Onboarding geändert werden, daher eignet sich das Projekt auch für andere einfache Turnierformate mit Sieg/Niederlage-Wertung.

Die öffentliche Webseite ist rein lesend. Die komplette Administration erfolgt über einen Telegram-Bot. Dadurch ist auf der Homepage kein eigener Admin-Login notwendig.

## Interaktives Mock-up

Eine statische Demo zeigt die Bedienung des Telegram-Bots und die Auswirkungen direkt auf einer simulierten Turnierhomepage.

**[Interaktives FTB Mock-up öffnen](https://bsv2016.github.io/ftb/)**

Hinweis: Der Link funktioniert, sobald der GitHub-Pages-Workflow nach dem Merge aktiviert und erfolgreich ausgeführt wurde. Das Mock-up enthält keine echten Telegram-Zugangsdaten, keine Datenbank und keine produktiven Admin-Funktionen.

## Funktionen

### Öffentliche Turnierseite

- für Smartphones optimierte Homepage
- frei wählbarer Veranstaltungstitel und Sportart
- Veranstaltungslogo
- bis zu drei Vereins- oder Veranstaltungsfarben
- automatische Kontrastprüfung für gute Lesbarkeit
- farblich hervorgehobenes Laufbanner für wichtige Meldungen
- Teamübersicht mit optionalen Logos
- Gruppen und Tabellen
- Spielplan und K.-o.-Phase
- Regelwerk
- sichtbare Kennzeichnung disqualifizierter Teams
- Siegeranzeige mit Animation nach Turnierende
- Berücksichtigung von `prefers-reduced-motion`
- PDF-Download des Turniers

### Administration über Telegram

Administratoren werden anhand ihrer numerischen Telegram-User-ID zugelassen. Der Bot ist für private Chats vorgesehen.

Über den Bot können Administratoren:

- das initiale Onboarding durchführen
- Titel, Sportart, Logo und Farben einstellen
- das Regelwerk pflegen
- das Laufbanner setzen oder deaktivieren
- Teams mit optionalem Logo anlegen
- Teams manuell Gruppen zuweisen
- Gruppenzuordnungen nachträglich ändern
- Teams automatisch und möglichst gleichmäßig auf Gruppen verteilen
- Teams disqualifizieren
- Spiele verwalten
- Spiele als laufend oder abgesagt markieren
- den Sieger eines Spiels per Button auswählen
- eine passende K.-o.-Phase automatisch berechnen lassen
- das Finale als Einzelspiel oder Best of Three festlegen
- Testdaten erzeugen und gezielt wieder löschen

## Wertung

FTB verwendet standardmäßig eine reine Sieg/Niederlage-Wertung.

Die Gruppentabellen enthalten:

- Platz
- Team
- Spiele
- Siege
- Niederlagen

Die Sortierung erfolgt primär nach Siegen. Bei Gleichstand wird zuerst der direkte Vergleich berücksichtigt. Disqualifizierte Teams bleiben sichtbar, werden aber aus der regulären Qualifikation ausgeschlossen.

## Automatische K.-o.-Phase

FTB berechnet aus der Anzahl der aktiven Teams eine sinnvolle K.-o.-Größe wie 4, 8, 16 oder 32 Teilnehmer.

Die Qualifikationsplätze werden möglichst gleichmäßig über die Gruppen verteilt. Verbleibende Plätze werden an die besten nächstplatzierten Teams vergeben. Bei der Erstellung der Paarungen versucht das System außerdem, direkte Wiederholungen aus derselben Vorrundengruppe zu vermeiden.

Vor dem Erzeugen des Spielbaums zeigt der Telegram-Bot die Empfehlung an und fragt nach dem Finalmodus:

- ein Entscheidungsspiel
- Best of Three, erstes Team mit zwei Siegen gewinnt

Beim Best-of-Three wird ein drittes Finalspiel nur erzeugt, wenn es benötigt wird.

## Testdaten

Organisatoren können vor dem echten Turnier Beispielteams und Beispielspiele anlegen lassen.

Testdaten werden eindeutig gekennzeichnet. Die Funktion `Testdaten löschen` entfernt ausschließlich Testteams und Testspiele. Erhalten bleiben:

- Seitentitel
- Sportart
- Farben
- Veranstaltungslogo
- Regelwerk
- Laufbanner
- echte Teams
- echte Spiele

Testdaten werden nicht in das finale Turnier-PDF übernommen.

## Schutz vor gleichzeitiger Bearbeitung

Kritische Bot-Abläufe verwenden kurzlebige Datenbanksperren. Wenn zwei Administratoren denselben Bereich gleichzeitig bearbeiten wollen, erhält der zweite Administrator eine Warnung.

Spieländerungen verwenden zusätzlich Versionsnummern. Eine veraltete Aktion kann dadurch kein neueres Ergebnis unbemerkt überschreiben.

## PDF-Export

Unter `/turnier.pdf` erzeugt die Anwendung ein aktuelles PDF mit den echten Turnierdaten, unter anderem:

- Veranstaltungsinformationen
- Gruppentabellen
- Teams
- Siege und Niederlagen
- Spielplan
- Ergebnisse
- K.-o.-Informationen
- Turniersieger

## Architektur

```text
Internet
   |
Domain / HTTPS
   |
Reverse Proxy oder Pangolin
   |
Docker-Host
   |
   +-- FTB Anwendung
   +-- PostgreSQL
   +-- Telegram-Bot innerhalb des App-Services
```

PostgreSQL veröffentlicht im mitgelieferten Compose-Setup keinen Host-Port.

## Voraussetzungen

Für das Standard-Deployment benötigst du:

- einen Rechner oder Server mit Docker
- Docker Engine und Docker Compose
- einen Telegram-Bot-Token von BotFather
- die numerischen Telegram-User-IDs der Administratoren
- für öffentliche Nutzung einen HTTPS-Zugang zur Anwendung

Dockge ist optional. Die vorhandene `compose.yaml` kann direkt mit Docker Compose oder als Dockge-Stack verwendet werden.

## Self-Hosting mit Docker

### 1. Repository klonen

```bash
git clone https://github.com/BSV2016/ftb.git
cd ftb
```

### 2. Telegram-Bot anlegen

Öffne Telegram und starte einen Chat mit `@BotFather`.

Erstelle mit `/newbot` einen Bot und speichere den Token sicher. Der Token ist ein Geheimnis und gehört niemals ins Git-Repository.

### 3. Telegram-IDs der Administratoren ermitteln

FTB verwendet numerische Telegram-User-IDs, keine Benutzernamen.

Beispiel:

```env
TELEGRAM_ADMIN_IDS=123456789,987654321
```

### 4. Umgebungsdatei erstellen

```bash
cp .env.example .env
```

Danach mindestens diese Werte anpassen:

```env
DB_PASSWORD=ein-langes-zufaelliges-passwort
TELEGRAM_BOT_TOKEN=dein-bot-token
TELEGRAM_ADMIN_IDS=123456789
```

Die Datei `.env` darf nicht committed werden.

### 5. Stack starten

```bash
docker compose pull
docker compose up -d
```

Status prüfen:

```bash
docker compose ps
```

Logs anzeigen:

```bash
docker compose logs -f app
```

### 6. Mit Dockge deployen

Erstelle in Dockge einen neuen Stack und verwende die `compose.yaml` dieses Repositories.

Hinterlege die gleichen Umgebungsvariablen beziehungsweise eine `.env` auf dem Docker-Host und starte den Stack.

### 7. HTTPS bereitstellen

Veröffentliche ausschließlich die FTB-Anwendung über einen vertrauenswürdigen HTTPS-Reverse-Proxy oder Tunnel. PostgreSQL bleibt intern.

Mögliche Varianten:

- Pangolin + Newt
- Caddy
- Traefik
- Nginx Proxy Manager
- Cloudflare Tunnel

### 8. Telegram-Onboarding starten

Sende deinem Bot in einem privaten Chat:

```text
/start
```

Danach kannst du Branding, Regelwerk, Teams und Gruppen konfigurieren.

### 9. Vor dem Turnier testen

Nutze die Testdaten-Funktion und prüfe mindestens:

- Darstellung auf dem Smartphone
- Farbkontraste
- Teamlogos
- Gruppentabellen
- Ergebniseingabe
- automatische K.-o.-Empfehlung
- Best-of-Three-Finale
- PDF-Download
- Siegeranzeige

Lösche die Testdaten danach über den Bot.

### 10. Backup erstellen

Vor dem Turnier sollte ein PostgreSQL-Backup erstellt werden. Bewahre Backups außerhalb des Docker-Volumes auf.

## Aktualisieren

Bei Nutzung der GHCR-Images:

```bash
docker compose pull
docker compose up -d
```

Für echte Turniere sind versionierte Image-Tags besser als ausschließlich `latest`, da ein Rollback dadurch einfacher wird.

## Hosting ohne eigene Domain oder VPS

Eine eigene Domain und ein VPS sind nicht zwingend notwendig.

### Cloudflare Tunnel

Ein Cloudflare Tunnel kann einen Dienst vom Heimserver veröffentlichen, ohne eingehende Ports im Router freizugeben.

### Tailscale Funnel

Für Tests oder kleinere Veranstaltungen kann Tailscale Funnel einen lokalen Dienst über eine von Tailscale verwaltete HTTPS-Adresse verfügbar machen.

### Container-Hosting

FTB benötigt einen laufenden App-Container und PostgreSQL. Geeignet sind deshalb Hosting-Anbieter, die Docker oder Container sowie eine persistente PostgreSQL-Datenbank anbieten.

### GitHub

GitHub eignet sich für:

- Quellcode
- Pull Requests und Versionsverwaltung
- GitHub Actions für Builds und Tests
- GitHub Container Registry für Docker-Images
- GitHub Pages für das statische Mock-up

Die echte FTB-Anwendung kann nicht vollständig auf GitHub Pages laufen, da Pages nur statische Dateien ausliefert. Für die echte Anwendung werden Node.js, PostgreSQL und der laufende Telegram-Bot benötigt.

## Sicherheit

- PostgreSQL niemals direkt ins Internet veröffentlichen.
- Telegram-Bot-Token niemals committen.
- `.env` nicht ins Repository aufnehmen.
- nur numerische Telegram-IDs erlaubter Administratoren hinterlegen.
- HTTPS verwenden.
- starke zufällige Datenbankpasswörter einsetzen.
- Docker-Host und Images aktuell halten.
- Dockge und den Docker-Host selbst nicht öffentlich zugänglich machen.
- keine unnötigen Container-Rechte vergeben.
- vor jedem Turnier die Admin-Liste kontrollieren.
- einen offengelegten Telegram-Token sofort bei BotFather widerrufen und ersetzen.

## Entwicklungsstand

FTB befindet sich noch in aktiver Entwicklung. Vor einem echten Turnier sollte der komplette Ablauf mit Testdaten geprüft werden.

---

## English summary

FTB is a self-hosted tournament platform built primarily for Flunkyball and other simple win/loss team tournaments. It provides a public mobile-first tournament website and Telegram-based administration without a public admin login.

Main features include configurable branding, teams and logos, automatic or manual group assignment, win/loss standings, disqualification, automatic knockout recommendations, single-game or best-of-three finals, demo data, concurrent-admin protection, winner animations and PDF export.

The real application requires Docker, PostgreSQL and a Telegram bot. GitHub Pages hosts only the static interactive mock-up.

**[Open the interactive mock-up](https://bsv2016.github.io/ftb/)**
