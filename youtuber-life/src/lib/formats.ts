import type { Platform } from './types';

export interface Format {
  id: string;
  name: string;
  pitch: string;
  hook: string;
  structure: string[];
  duration: string;
  platforms: Platform[];
  /** why it earns: discovery, watch hours, affiliate… */
  role: string;
}

/** Recurring AI-generated series from the AI-only strategy (docs/compendio.md §8). */
export const FORMATS: Format[] = [
  {
    id: 'cristallo-italiano',
    name: 'Cristallo italiano',
    pitch: 'Cibi simbolo italiani fatti di vetro o cristallo, tagliati in macro: limone, mozzarella, cannolo, melograno…',
    hook: 'Fotogramma 0: la lama entra nel vetro, primo "crack" cristallino.',
    structure: [
      'Clip 1 (8 s): taglio in macro con suono cristallino',
      'Clip 2 (8 s): le metà si aprono, l\'interno brilla',
      'Clip 3 (8 s): dettaglio "satisfying" (chicchi, gocce, briciole di vetro)',
      'Testo "Lo sapevi?" con una curiosità vera sul cibo',
    ],
    duration: '20–24 s',
    platforms: ['shorts', 'reels', 'facebook', 'tiktok'],
    role: 'Scoperta: il formato con l\'identità italiana',
  },
  {
    id: 'materiali-impossibili',
    name: 'Materiali impossibili',
    pitch: 'Frutta e verdura di lava, marmo, oro, ghiaccio, galassia: un materiale nuovo a ogni episodio.',
    hook: 'Il contrasto: un oggetto familiare con un materiale impossibile, già tagliato al primo secondo.',
    structure: ['Clip 1: primo taglio + suono del materiale', 'Clip 2: rallentatore sull\'interno', 'Clip 3: le due metà, finale in loop'],
    duration: '20–24 s',
    platforms: ['shorts', 'reels', 'facebook', 'tiktok'],
    role: 'Reach ed episodi legati alle feste (Halloween, Natale)',
  },
  {
    id: 'dentro-ce',
    name: 'Dentro c\'è…',
    pitch: 'Tagli un frutto e dentro c\'è un mondo in miniatura: un borgo, un vigneto, un mare. Mai luoghi reali riconoscibili.',
    hook: 'Testo: "Dentro questa zucca c\'è un borgo". Lo stacco rivela la miniatura.',
    structure: ['Clip 1: taglio + rivelazione', 'Clip 2: carrellata dentro la miniatura', 'Clip 3: allargamento sul frutto che diventa lanterna'],
    duration: '20–24 s',
    platforms: ['shorts', 'reels', 'facebook', 'tiktok', 'pinterest'],
    role: 'Condivisioni e commenti ("dove vorresti vivere?")',
  },
  {
    id: 'asmr-lungo',
    name: 'ASMR lungo per studio e sonno',
    pitch: 'Compilation delle clip migliori della settimana, solo suono, capitoli per oggetto.',
    hook: 'Miniatura del frutto di cristallo più bello; titolo "1 ora di taglio ASMR, niente musica".',
    structure: ['Clip della settimana montate in sequenza', 'Dissolvenze lente', 'Capitoli per oggetto'],
    duration: '20–60 min',
    platforms: ['youtube'],
    role: 'Ore di visione per il Partner Program',
  },
  {
    id: 'dietro-le-quinte',
    name: 'Dietro le quinte: il prompt',
    pitch: 'Come è nato il video: prompt, tentativi falliti, risultato. Aggiunge valore umano e trasparenza.',
    hook: '"Questo video l\'ha fatto un\'IA. Ecco il prompt esatto."',
    structure: ['Il video finale (3 s)', 'Il prompt a schermo', '2 tentativi sbagliati', 'Link al tool (#ADV se affiliato) / prompt pack'],
    duration: '30–45 s',
    platforms: ['shorts', 'reels', 'tiktok', 'youtube'],
    role: 'Affiliazioni ai tool IA e vendita di prompt pack',
  },
];

export function formatById(id: string | undefined): Format | undefined {
  return FORMATS.find((f) => f.id === id);
}

export function scriptTemplate(f: Format): string {
  return [`Hook: ${f.hook}`, '', 'Struttura:', ...f.structure.map((s) => `- ${s}`), '', `Durata: ${f.duration}`].join('\n');
}
