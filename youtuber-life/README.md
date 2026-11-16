# YouTuber Life

Tool per creator YouTube: gestisci le idee, segui ogni video lungo la pipeline di produzione, pianifica le uscite sul calendario editoriale e tieni d'occhio le statistiche del canale.

## Funzionalità

- **Pipeline** – bacheca kanban: Idea → Script → Riprese → Montaggio → Programmato → Pubblicato, con avviso se un video pubblicato ha la checklist di compliance incompleta
- **Format** – libreria di serie generate con l'IA ("L'Italia impossibile") con hook, struttura e durata; un clic crea il video con lo script precompilato
- **Calendario** – vista mensile delle uscite programmate e pubblicate
- **Statistiche** – views, like, uscite per mese, top 5, avanzamento verso le soglie del YouTube Partner Program e allerta AGCOM (1 M views/mese)
- **Entrate** – registro per fonte, indice di diversificazione, stima dell'imposta in regime forfettario
- **Editor video** – fase, serie, piattaforme, data, tag, script, metriche (views, like, retention, iscritti) e generatore IA usato e checklist di compliance (etichetta IA, diritti del provider, marchi/beni culturali, audio, #ADV)
- **Esporta / Importa** – backup di video ed entrate in JSON

## Studio: produzione video con l'IA

I video sono generati al 100% con l'IA (vedi `docs/compendio.md` §8).

```bash
python3 studio/assemble.py prompts   # prompt da incollare nel generatore (es. Google Flow)
python3 studio/assemble.py build     # monta le clip di studio/clips/<id>/ in studio/output/<id>.mp4 + caption
```

Specifiche dei video in `studio/specs/`, guida della prima settimana in `docs/contenuti/settimana-01-ia.md`. Serve solo Python 3 + ffmpeg.

La ricerca di mercato, l'analisi legale per l'Italia e la strategia sono in [`docs/compendio.md`](docs/compendio.md).

I dati sono salvati nel browser (`localStorage`).

## Avvio

```bash
npm install
npm run dev      # sviluppo
npm test         # test
npm run build    # build di produzione in dist/
```

Stack: React 18 + TypeScript + Vite, test con Vitest.
