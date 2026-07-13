# artemis-helper

CLI zum Sichern und Übertragen von Artemis-Aufgaben zwischen Kursen.

## Setup

```bash
nvm use          # Node 20 (siehe .nvmrc)
corepack enable
yarn install
```

## Nutzung

```bash
yarn artemis-login       # Basis-URL, Zugangsdaten und optional VCS-Token in .env speichern
yarn exercise-export     # interaktiv Kurs + Aufgabe(n) wählen und exportieren
yarn exercise-export 1 3 # direkt Aufgaben Nr. 1 und 3 aus der zuvor angezeigten Liste exportieren
yarn exercise-import     # interaktiv eine exportierte Aufgabe in einen (anderen) Kurs importieren
yarn exercise-edit       # Kurs + Aufgabe wählen und Titel/Termine/Punkte einer bestehenden Aufgabe live anpassen
```

`exercise-export`, `exercise-import` und `exercise-edit` prüfen zuerst, ob Zugangsdaten vorhanden sind. Fehlen sie (keine `.env`, keine Flags), wird interaktiv wie bei `artemis-login` nachgefragt und danach für künftige Aufrufe gespeichert.

### Import-Details

Beim Import wird pro Aufgabe geprüft, ob im Zielkurs bereits eine Aufgabe mit demselben Titel existiert. Falls ja, fragt das Tool nach: neuen Namen vergeben (mit Vorschlag für einen gültigen Short-Name) oder die bestehende Aufgabe löschen (Löschen erfordert exaktes Eintippen des Titels zur Bestätigung). Anschließend kann optional Titel, Veröffentlichungs-/Enddatum (fest oder "X Tage nach Veröffentlichung") und Punktzahl angepasst werden, bevor die Aufgabe angelegt wird — dieselbe Anpassungslogik wie bei `yarn exercise-edit`.

Ohne `.env` (z. B. für einmalige/Skript-Nutzung) lassen sich alle drei Befehle auch per Flags versorgen:

```bash
yarn exercise-export --username max --password ***          # Login ohne .env, nichts wird gespeichert
yarn exercise-export --token <bearer-jwt>                    # bereits vorhandenes Access-Token verwenden
yarn exercise-export --dir /pfad/zu/exporten 1 3              # abweichender Export-Ordner für diesen Lauf
```

- `--username`/`--password` bzw. `--token` überschreiben nur diesen einen Aufruf, ohne `.env` zu verändern.
- `--dir` (bzw. `--folder`) legt den Export-/Import-Ordner für diesen Aufruf fest. Ohne Flag wird der zuletzt gespeicherte Ordner aus `.env` verwendet, oder interaktiv gefragt (Antwort wird dann gespeichert).

Exporte landen standardmäßig in `exports/<id>-<slug>/` (nicht in Git). Zugangsdaten und der gemerkte Export-Ordner liegen in `.env` (ebenfalls nicht in Git, `chmod 600`).

## Grenzen der Artemis-API

- **Programmieraufgaben**: vollständig portabel – Export als Zip (Problemstellung, Template-/Lösungs-/Test-Repo, Konfiguration) plus optionalem direktem Git-Klon der Repos; Import funktioniert auch auf einer anderen Artemis-Instanz.
- **Text-/Modeling-/File-Upload-Aufgaben**: Artemis bietet nur einen "Import by reference" – die Original-Aufgabe muss dafür weiterhin auf derselben Artemis-Instanz existieren, auf der importiert wird.
- **Quiz-Aufgaben**: Artemis bietet serverseitig keinen Export/Import. Es wird nur die Konfiguration lokal gesichert, ein Re-Import ist nicht automatisierbar.
