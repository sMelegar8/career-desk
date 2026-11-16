# Settimana 1 – Speciale Halloween, 100% IA

Tre video, 9 clip da 8 secondi in tutto. Il lavoro manuale si riduce a **incollare 9 prompt e scaricare 9 file**. Montaggio, testi, etichetta IA e caption sono automatici.

| Uscita | Video | Serie | Clip |
|---|---|---|---|
| **sab 24/10** | Melograno di cristallo | Cristallo italiano | 3 |
| **lun 26/10** | Zucca di lava | Materiali impossibili | 3 |
| **mer 28/10** | Dentro la zucca c'è un borgo | Dentro c'è… | 3 |

Orari: YouTube Shorts alle 17:00; IG/FB/TikTok fra le 18:30 e le 20:30.

---

## 1. Quale generatore gratuito usare

| Provider | Gratis | Watermark | Uso commerciale col piano gratuito | Audio | Verdetto |
|---|---|---|---|---|---|
| **Google Flow (Veo 3.1)** | ~50 crediti al giorno | Nessuno visibile (SynthID invisibile) | Non chiaro: leggi i termini prima di monetizzare | ✅ genera anche i suoni | **Primo da provare** |
| **Dreamina (Seedance)** | 120–225 crediti al giorno (le fonti divergono) | Sì sul piano gratuito, secondo diverse fonti | Probabilmente no | ✅ | Riserva |
| Kling / Hailuo / PixVerse / Vidu | Crediti giornalieri o una tantum | Sì | No | Parziale | Solo per esperimenti |
| **Wan 2.2** (open source) | Illimitato su una tua GPU | No | ✅ Sì (licenza Apache 2.0) | ❌ (va aggiunto) | Fase 2, se hai un PC con GPU |

**Regole:**
- **Non pubblicare clip con watermark** e non rimuoverlo tagliando l'inquadratura: violi i termini del servizio, e le piattaforme penalizzano i watermark.
- Finché il canale non guadagna, i piani gratuiti vanno bene per crescere. **Prima di monetizzare** (Partner Program, sponsor, affiliazioni) servono un piano o un modello che consenta l'uso commerciale. I dettagli sono in [compendio §8](../compendio.md).
- I crediti cambiano spesso: in Flow scegli il modello **Fast** per spendere meno e generane **1 per prompt**. Rigenera solo se la clip è inutilizzabile.

## 2. Generare le clip (≈ 20 minuti a video)

1. Apri **Google Flow** (labs.google/flow) con il tuo account Google.
2. Crea un progetto "YouTuber Life", modalità **testo → video**, formato **9:16 verticale**, modello Veo **Fast**.
3. Per ogni clip copia il prompt da `studio/specs/<id>.json` (campo `prompt`). In alternativa, `python3 studio/assemble.py prompts` li stampa tutti in ordine.
4. Scarica ogni clip e rinominala `01.mp4`, `02.mp4`, `03.mp4` nell'ordine della specifica.
5. Mettile in `studio/clips/<id>/`, per esempio `studio/clips/w01-zucca-lava/02.mp4`.

**Se una clip esce male:** la lama attraversa l'oggetto senza tagliarlo, compaiono mani deformi o testo nell'immagine. Rigenera aggiungendo al prompt `single clean cut, no hands, no text, no watermark`. Se l'audio contiene musica, rigenera con `no music` in fondo.

## 3. Montaggio automatico

**Opzione A – sul tuo computer** (serve Python 3 + [ffmpeg](https://ffmpeg.org/download.html)):
```bash
python3 studio/assemble.py build              # tutti i video
python3 studio/assemble.py build w01-zucca-lava
```
Risultato in `studio/output/`:
- `<id>.mp4`: 1080×1920, 30 fps, audio normalizzato, testi a schermo ed etichetta "Generato con IA · AI-generated" sempre visibile;
- `<id>.md`: titolo, descrizione, caption per ogni piattaforma, commento da fissare ed etichette IA da attivare.

**Opzione B – lo faccio io:** mandami le 9 clip in una sessione (con i nomi `<id>-01.mp4` ecc.) e ti restituisco i video finali con le caption.

## 4. Pubblicare

Per ogni piattaforma attiva **sempre** l'etichetta IA:
- **TikTok:** interruttore "Contenuto generato dall'IA".
- **YouTube:** "Contenuti alterati o sintetici" → Sì.
- **Instagram/Facebook:** "Info IA". Pubblica il Reel su Instagram con la condivisione su Facebook attiva: un solo caricamento.

Usa titoli e caption del file `<id>.md`, poi fissa il commento.

## 5. Dopo 48 ore

Nel tool (scheda Pipeline → apri il video) registra: views, retention, iscritti e il generatore usato. La serie con la retention più alta guida la settimana 2.

**Idee per la settimana 2** (novembre): limone di cristallo, castagna d'oro, cavolo viola di marmo, "dentro la melagrana c'è un vigneto", ASMR lungo con le 9 clip della settimana 1.

---

Per importare il calendario nel tool: **Importa** → `docs/contenuti/settimana-01-ia.json`. I video si aggiungono a quelli esistenti senza cancellarli.
