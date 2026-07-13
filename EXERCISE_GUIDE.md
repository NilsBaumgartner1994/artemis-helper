# Anleitung: Exportierte Artemis-Aufgaben bearbeiten

Diese Anleitung beschreibt die Ordnerstruktur einer mit `yarn exercise-export` exportierten Aufgabe und was beim Bearbeiten zu beachten ist — gedacht für Menschen **und** KI-Assistenten, die eine Aufgabe anpassen sollen, bevor sie mit `yarn exercise-import` (erneut) importiert wird.

## Ordnerstruktur eines Exports

```
<exerciseId>-<slug>/
├── README.md          Kurzinfo zur Aufgabe, verweist hierher
├── manifest.json      CLI-Metadaten (Quell-Kurs, IDs, Exportdatum) – nicht bearbeiten
├── exercise.json      Vollständige API-Antwort der Aufgabe – nur Referenz, wird beim Import NICHT verwendet
├── export/            Entpacktes Artemis-Export-Bundle – DAS wird beim Import hochgeladen
│   ├── Exercise-Details-<Titel>.json   Aufgaben-Konfiguration (Punkte, Termine, Problemstellung, Build-Config)
│   ├── Problem-Statement-<Titel>.md    Problemstellung als Markdown (Kopie der JSON-Problemstellung)
│   └── <Kurs>-<Titel>-<id>-<zeitstempel>/
│       ├── ...-exercise/   Template-Repository (Startpunkt der Studierenden)
│       ├── ...-solution/   Musterlösungs-Repository
│       └── ...-tests/      Test-Repository (bestimmt die Bewertung!)
└── repos/             Optionale direkte Git-Klone (nur mit VCS-Token; mit .git und Remote)
```

Beim Import zippt die CLI den Inhalt von `export/` (ohne `.git`-Ordner) und lädt ihn nach Artemis hoch. **Alle Änderungen in `export/` landen also in der importierten Aufgabe.** Änderungen in `repos/` sind davon unabhängig (das sind Arbeitskopien mit Remote zur Quell-Instanz).

## Wie die Bewertung funktioniert (Java-Programmieraufgaben)

- **Punkte**: `maxPoints` / `bonusPoints` stehen in der `Exercise-Details-*.json` (können beim Import auch interaktiv geändert werden).
- **Struktur-Tests** (`ClassTest`, `AttributeTest`, `MethodTest`, `ConstructorTest` im Tests-Repo): prüfen per Reflection gegen das Orakel `test/…/test.json`. Dort sind Klassen, Attribute, Methoden mit Sichtbarkeiten/Typen deklariert. Wer die Aufgabenstruktur ändert (Klassenname, Attribute, Signaturen), muss `test.json` konsistent mitändern.
- **Behavior-Tests** (z. B. `<Klasse>BehaviorTest.java`): prüfen das Verhalten. **Wichtig: Behavior-Tests müssen Reflection verwenden** (`Class.forName(…)`, `getMethod(…)`, `invoke(…)`) statt die Studierenden-Klasse direkt zu referenzieren. Das Template enthält die Klasse anfangs oft noch gar nicht — eine direkte Referenz führt dann zu einem Compile-Fehler, der den **gesamten Build** crasht (alle Tests schlagen mit verwirrender Compiler-Meldung fehl, statt einzeln und verständlich).
- **Aufgaben-Verknüpfung**: In der Problemstellung verknüpfen Annotationen wie `[task][Beschreibung](<testid>1234</testid>)` die Teilaufgaben mit Testfällen; im UML-Teil analog `testsColor(<testid>…</testid>)`. Die numerischen IDs sind instanzspezifisch — beim Import ordnet Artemis sie über die **Testnamen** neu zu. Deshalb: **Testmethoden-Namen nicht ändern**, es sei denn, Problemstellung und Bewertungskonfiguration werden bewusst mit angepasst.
- **Gewichte** der Testfälle (wie viele Punkte ein einzelner Test bringt) sind Teil der Artemis-Bewertungskonfiguration und werden beim Import mit übernommen; im Repo selbst stehen sie nicht.
- **Konsistenz-Regel**: Template, Lösung, Tests und Problemstellung müssen zusammenpassen. Wer z. B. eine Methode umbenennt, ändert: Lösung + `test.json` + ggf. Behavior-Test + Problemstellung/UML.

## Typischer Ablauf

1. `yarn exercise-export` — Aufgabe(n) wählen, wird nach `export/` entpackt.
2. Dateien in `export/` bearbeiten (Problemstellung, Tests, Lösung, Template, Konfiguration).
3. `yarn exercise-import` — Zielkurs wählen; bei Namenskonflikt wird umbenennen/löschen angeboten; Termine/Punkte können angepasst werden. Die CLI zippt `export/` und lädt hoch.

Vom Server beim Import neu erzeugt werden u. a.: Aufgaben-ID, Projekt-Schlüssel, Repository-URLs, Build-Plan. Diese Felder aus den JSONs zu übernehmen ist daher zwecklos — Titel/Short-Name werden beim Import gesetzt.

## Grenzen

- **Quiz-Aufgaben**: kein Export/Import über die Artemis-API möglich.
- **Text-/Modeling-/File-Upload-Aufgaben**: kein Datei-Bundle; Import nur "by reference" (Original muss auf derselben Instanz noch existieren).
- Der Import über Instanzgrenzen hinweg funktioniert nur für Programmieraufgaben (über das Bundle in `export/`).
