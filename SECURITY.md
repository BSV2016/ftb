# Sicherheitsrichtlinie / Security Policy

## Unterstützte Versionen

FTB befindet sich derzeit in aktiver Entwicklung. Sicherheitskorrekturen werden für den aktuellen Stand von `main` sowie für die jeweils neueste veröffentlichte Version bereitgestellt.

| Version | Unterstützt |
| --- | --- |
| Aktuelle Version / `main` | ✅ |
| Ältere Entwicklungsstände | ❌ |

## Sicherheitslücken melden

Bitte veröffentliche vermutete Sicherheitslücken nicht als öffentliches GitHub-Issue und poste keine Zugangsdaten, Tokens, Passwörter oder personenbezogenen Daten im Repository.

Nutze nach Möglichkeit GitHubs Funktion **Private vulnerability reporting** im Bereich **Security** des Repositories. Falls diese Funktion nicht verfügbar ist, kontaktiere den Projektinhaber über einen privaten, im GitHub-Profil angegebenen Kontaktweg.

Bitte beschreibe möglichst:

- welche Version oder welcher Commit betroffen ist,
- wie sich das Problem reproduzieren lässt,
- welche Auswirkungen du erwartest,
- ob du bereits einen möglichen Fix kennst.

Eine bestätigte Sicherheitslücke wird priorisiert behandelt. Details sollten erst nach Bereitstellung einer Korrektur öffentlich gemacht werden.

## Secrets

Telegram-Bot-Tokens, Datenbankpasswörter und andere Zugangsdaten dürfen niemals committed werden. Verwende lokal `.env` und orientiere dich an `.env.example`.

---

## English summary

FTB supports security fixes for the current `main` branch and the latest released version. Please do not disclose vulnerabilities or secrets in public issues. Prefer GitHub Private Vulnerability Reporting when available, and never commit Telegram tokens, database passwords, or other credentials.
