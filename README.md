# FTB Tournament Platform

FTB ist eine selbst gehostete Turnierplattform, die standardmäßig für Flunkyball ausgelegt ist. Die Sportart kann beim Onboarding geändert werden, sodass das Projekt auch für andere einfache Teamturniere mit Sieg/Niederlage-Logik genutzt werden kann.

Die öffentliche Website ist rein lesend. Die komplette Administration erfolgt über einen Telegram-Bot. Dadurch braucht die Website keinen eigenen Admin-Login und die öffentlich erreichbare Angriffsfläche bleibt klein.

## Funktionen

### Öffentliche Turnierseite

- Mobile-First-Homepage
- Frei wählbarer Seitentitel und Sportname
- Veranstaltungslogo
- Bis zu drei Vereins- oder Eventfarben
- Automatische Kontrastprüfung für gute Lesbarkeit
- Hervorgehobenes Laufbanner für wichtige Hinweise
- Teamübersicht mit optionalen Logos
- Gruppen und Tabellen
- Spielplan und K.-o.-Phase
- Regelwerk
- Sichtbare Kennzeichnung disqualifizierter Teams
- Siegerbereich mit Siegesanimation
- Unterstützung von `prefers-reduced-motion`
- PDF-Download mit Turnierdaten

### Telegram-Administration

Administratoren werden über ihre numerische Telegram-User-ID freigeschaltet. Der Bot ist für private Chats vorgesehen.

Über den Bot können Administratoren:

- das komplette Onboarding durchführen
- Titel, Sportart, Logo und Farben festlegen
- das Regelwerk bearbeiten
- das Laufbanner setzen oder deaktivieren
- Teams mit optionalem Logo anlegen
- Teams manuell Gruppen zuweisen
- Gruppenzuordnungen später ändern
- Teams automatisch und möglichst gleichmäßig auf Gruppen verteilen
- Teams disqualifizieren
- Spiele verwalten
- Spiele als laufend oder abgesagt markieren
- den Sieger eines Spiels per Button festlegen
- automatisch eine passende K.-o.-Phase berechnen lassen
- das Finale als Einzelspiel oder Best of Three spielen
- Testdaten erstellen und später gezielt wieder löschen

## Wertung bei Flunkyball

FTB verwendet standardmäßig ausschließlich Siege und Niederlagen.

Die Gruppentabelle enthält:

| Platz | Team | Spiele | Siege | Niederlagen |
|---|---|---:|---:|---:|
| 1 | Beispielteam A | 4 | 4 | 0 |
| 2 | Beispielteam B | 4 | 3 | 1 |

Die Reihenfolge richtet sich zuerst nach der Anzahl der Siege. Bei Gleichstand wird zuerst der direkte Vergleich berücksichtigt. Disqualifizierte Teams bleiben sichtbar, werden aber nicht für die reguläre Qualifikation zur K.-o.-Phase gewertet.

## Automatische K.-o.-Phase

FTB berechnet aus der Anzahl der aktiven Teams eine sinnvolle Größe der K.-o.-Phase. Verwendet werden Zweierpotenzen wie 4, 8, 16 oder 32 Teams.

Dabei versucht das System:

- eine sinnvolle Anzahl von Teams für die K.-o.-Phase zu wählen
- die Qualifikationsplätze möglichst gleichmäßig auf die Gruppen zu verteilen
- verbleibende Wildcard-Plätze an die besten nächstplatzierten Teams zu vergeben
- direkte Wiederholungen aus derselben Vorrundengruppe in der ersten K.-o.-Runde möglichst zu vermeiden

Vor dem Erzeugen des Spielbaums zeigt der Telegram-Bot die Empfehlung an.

### Finalmodus

Für das Finale stehen zwei Varianten zur Verfügung:

- ein einzelnes Entscheidungsspiel
- Best of Three, das erste Team mit zwei Siegen gewinnt

Bei Best of Three wird ein drittes Finalspiel nur dann erzeugt, wenn es nach zwei Spielen 1:1 steht.

## Testmodus

Vor dem echten Turnier können Beispielteams und Beispielspiele erzeugt werden, um Website, Tabellen, Bot und PDF-Ausgabe zu testen.

Testdaten sind separat markiert. Die Funktion `Testdaten löschen` entfernt nur Testteams und Testspiele. Folgende Inhalte bleiben erhalten:

- Seitentitel
- Sportart
- Farben
- Veranstaltungslogo
- Regelwerk
- Laufbanner
- echte Teams
- echte Spiele

Testdaten werden aus dem finalen Turnier-PDF ausgeschlossen.

## Schutz vor gleichzeitiger Bearbeitung

Wichtige Telegram-Abläufe verwenden kurzlebige Datenbank-Locks. Bearbeiten zwei Administratoren gleichzeitig denselben Bereich, erhält der zweite Administrator eine Warnung.

Spieländerungen verwenden zusätzlich Versionsnummern. Eine ältere Telegram-Aktion kann dadurch keine neuere Änderung still überschreiben.

## PDF-Export

Unter `/turnier.pdf` kann ein aktuelles PDF erzeugt werden. Es enthält reale Turnierdaten, unter anderem:

- Veranstaltungsinformationen
- Gruppentabellen
- Teams
- Spiele, Siege und Niederlagen
- Spielplan
- Ergebnisse
- K.-o.-Spielbaum
- Turniersieger

## Architektur

Typisches Self-Hosting:

```text
Internet
   |
Domain / HTTPS
   |
Reverse Proxy oder Pangolin
   |
Docker-Host
   |
   +-- FTB-Anwendung
   +-- PostgreSQL
   +-- Telegram-Bot innerhalb des App-Services
```

PostgreSQL veröffentlicht im mitgelieferten Compose-Stack keinen Host-Port.

## Voraussetzungen

Für das normale Docker-Deployment werden benötigt:

- ein Rechner oder Server mit Docker
- Docker Engine und Docker Compose
- ein Telegram-Bot-Token von BotFather
- die numerischen Telegram-IDs der Administratoren
- für den öffentlichen Betrieb ein HTTPS-Zugang zur Website

Dockge ist optional. Die mitgelieferte `compose.yaml` kann direkt mit Docker Compose oder als Dockge-Stack verwendet werden.

# Self-Hosting Schritt für Schritt

## 1. Repository klonen

```bash
git clone https://github.com/BSV2016/ftb.git
cd ftb
git switch feat/tournament-platform
```

Nach einem späteren Merge in `main` kann der Branch-Wechsel entfallen.

## 2. Telegram-Bot erstellen

In Telegram `@BotFather` öffnen und mit `/newbot` einen neuen Bot anlegen.

Den Bot-Token sicher speichern. Er ist wie ein Passwort zu behandeln.

## 3. Telegram-IDs der Administratoren ermitteln

FTB verwendet numerische Telegram-IDs, keine frei änderbaren Benutzernamen.

Mehrere Administratoren werden kommasepariert eingetragen:

```env
TELEGRAM_ADMIN_IDS=123456789,987654321
```

## 4. Umgebungsdatei anlegen

```bash
cp .env.example .env
```

Mindestens diese Werte setzen:

```env
DB_PASSWORD=ein-langes-zufaelliges-passwort
TELEGRAM_BOT_TOKEN=dein-bot-token
TELEGRAM_ADMIN_IDS=123456789
```

Die `.env` niemals in Git committen.

## 5. Stack starten

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

## 6. Deployment mit Dockge

Alternativ in Dockge einen neuen Stack erstellen und die `compose.yaml` verwenden.

Die Werte aus `.env` entweder auf dem Docker-Host bereitstellen oder in der Stack-Konfiguration setzen.

Danach den Stack deployen und prüfen, ob App und Datenbank gesund laufen.

## 7. Website über HTTPS veröffentlichen

Nur die FTB-Anwendung nach außen veröffentlichen. PostgreSQL bleibt intern.

Geeignete Lösungen sind zum Beispiel:

- Pangolin + Newt
- Caddy
- Traefik
- Nginx Proxy Manager
- Cloudflare Tunnel

Bei Pangolin zeigt die öffentliche Resource auf den internen Web-Service des FTB-Containers beziehungsweise auf dessen Docker-Netz.

## 8. Telegram-Onboarding starten

Im privaten Chat mit dem Bot:

```text
/start
```

Danach Titel, Sportart, Logo und Farben konfigurieren. Anschließend Regelwerk, Teams und Gruppen einrichten.

## 9. Testdaten verwenden

Vor dem Turnier Testdaten erstellen und mindestens folgende Punkte prüfen:

- Darstellung auf Smartphones
- Lesbarkeit der Vereinsfarben
- Teamlogos
- Gruppentabellen
- Ergebniseingabe über Telegram
- K.-o.-Empfehlung
- Finalmodus
- PDF-Download
- Siegeranzeige

Nach Abschluss der Tests nur die Testdaten löschen. Die restliche Konfiguration bleibt erhalten.

## 10. Backup erstellen

Vor dem Turniertag sollte die PostgreSQL-Datenbank gesichert werden.

Ein Dump kann mit `pg_dump` erstellt werden. Backups sollten außerhalb des Docker-Volumes und möglichst auch außerhalb des Hosts gespeichert werden.

# Updates

Bei Nutzung fertiger Container-Images:

```bash
docker compose pull
docker compose up -d
```

In Dockge kann entsprechend Pull und Redeploy genutzt werden.

Für echte Turniere sind versionierte Image-Tags besser als ausschließlich `latest`, weil ein Rollback dadurch einfacher wird.

# Hosting ohne eigene Domain oder VPS

Eine eigene Domain und ein VPS sind komfortabel, aber nicht zwingend erforderlich.

## Variante 1: Heimserver + Cloudflare Tunnel

Wenn bereits ein Heimserver, NAS, Mini-PC oder Raspberry Pi vorhanden ist, kann die Anwendung dort per Docker laufen.

Ein Tunnel-Dienst kann die Website nach außen veröffentlichen, ohne Ports am Router freizugeben. Für langfristigen öffentlichen Betrieb ist eine eigene Domain meist die sauberste Lösung.

## Variante 2: Tailscale Funnel

Für Tests oder kleinere Veranstaltungen kann ein lokaler Dienst über eine von Tailscale bereitgestellte HTTPS-Adresse veröffentlicht werden.

Vor echtem Turnierbetrieb sollten aktuelle Limits, Nutzungsbedingungen und erwartete Besucherzahlen geprüft werden.

## Variante 3: Docker-Hosting-Plattform

FTB braucht einen dauerhaft laufenden Node.js-Container sowie PostgreSQL.

Daher eignen sich Plattformen, die Docker-Container und eine persistente beziehungsweise verwaltete PostgreSQL-Datenbank anbieten.

Wichtig bei der Auswahl:

- persistente Datenbank
- kein aggressives Einschlafen während des Turniers
- ausreichend ausgehender Netzwerkzugriff für Telegram
- HTTPS
- transparente Kosten
- Backup-Möglichkeiten

## Variante 4: GitHub für Code und Docker-Images

GitHub eignet sich sehr gut für den Quellcode, automatische Builds und die Bereitstellung fertiger Docker-Images über GHCR.

GitHub Pages allein kann FTB jedoch nicht hosten. GitHub Pages liefert nur statische Dateien aus. FTB benötigt einen laufenden Node.js-Prozess, PostgreSQL und den Telegram-Bot.

Ein mögliches Setup ohne eigenen Server ist:

```text
GitHub Repository
   |
GitHub Actions
   |
GitHub Container Registry
   |
Docker-Hosting-Anbieter
   |
Managed PostgreSQL
```

## Variante 5: Nur lokal zum Testen

Für Entwicklung und Tests kann FTB auch auf einem Laptop oder Desktop-PC laufen. Ein sicherer temporärer Tunnel kann die Website kurzfristig öffentlich erreichbar machen.

Für einen echten Turniertag sollte ein solches Setup vorher unter realistischen Bedingungen getestet werden.

# Sicherheitshinweise

- PostgreSQL niemals direkt ins Internet veröffentlichen.
- Telegram-Bot-Token niemals ins Repository schreiben.
- Nur numerische Telegram-IDs für Administratoren freigeben.
- Docker-Images und Host-System aktuell halten.
- Die öffentliche Website nur über HTTPS betreiben.
- Starke zufällige Datenbankpasswörter verwenden.
- Regelmäßige Backups erstellen.
- Dockge und den Docker-Host selbst nicht ungeschützt öffentlich erreichbar machen.
- Keine unnötigen Linux-Capabilities oder `privileged`-Container verwenden.
- Administratorliste vor jedem Turnier prüfen.
- Einen kompromittierten Telegram-Token sofort bei BotFather ersetzen.

# Entwicklungsstatus

FTB befindet sich noch in aktiver Entwicklung. Vor einem echten Turnier sollte der vollständige Ablauf mit Testdaten geprüft werden, insbesondere Tabellenberechnung, K.-o.-Qualifikation, Finalmodus, PDF-Export und Wiederherstellung aus einem Backup.

---

# English summary

FTB is a self-hosted tournament platform built primarily for Flunkyball, but its sport name and branding are configurable. The public site is read-only, while administrators manage the tournament through a private Telegram bot.

Main features include configurable branding, team logos, manual or automatic groups, win/loss standings, disqualification, automatic knockout recommendations, single-match or best-of-three finals, demo data, concurrent-edit protection, a winner animation and PDF export.

FTB runs with Docker and PostgreSQL. It can be deployed on a home server behind Pangolin, a reverse proxy or a secure tunnel, or on a container hosting platform with persistent PostgreSQL. GitHub Pages alone is not sufficient because FTB requires a running application service, database and Telegram bot.
