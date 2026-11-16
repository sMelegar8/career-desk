export const STAGES = ['idea', 'script', 'riprese', 'montaggio', 'programmato', 'pubblicato'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  idea: 'Idea',
  script: 'Script',
  riprese: 'Riprese',
  montaggio: 'Montaggio',
  programmato: 'Programmato',
  pubblicato: 'Pubblicato',
};

export const PLATFORMS = ['shorts', 'reels', 'facebook', 'tiktok', 'youtube', 'snapchat', 'pinterest'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  shorts: 'YT Shorts',
  reels: 'IG Reels',
  facebook: 'FB Reels',
  tiktok: 'TikTok',
  youtube: 'YouTube long',
  snapchat: 'Snapchat Spotlight',
  pinterest: 'Pinterest',
};

export const COMPLIANCE_ITEMS = {
  ai: 'Etichetta "Generato con IA" nel video e nella caption + flag IA attivato sulla piattaforma',
  rights: 'Il piano del provider consente questo uso (i piani gratuiti spesso vietano l\'uso commerciale)',
  ip: 'Nessun marchio, persona reale o bene culturale riconoscibile (David, Colosseo…)',
  music: 'Audio generato dal modello o con licenza commerciale (niente brani protetti)',
  adv: 'Sponsor / link affiliati dichiarati (#ADV) – oppure nessuno',
} as const;
export type ComplianceKey = keyof typeof COMPLIANCE_ITEMS;

export interface Video {
  id: string;
  title: string;
  notes: string;
  tags: string[];
  stage: Stage;
  platforms: Platform[];
  /** id of the format in the library this video belongs to */
  series?: string;
  /** AI video generator used for the clips */
  provider?: Provider;
  compliance: Partial<Record<ComplianceKey, boolean>>;
  /** ISO date (YYYY-MM-DD) of planned or actual publication */
  publishDate?: string;
  views?: number;
  likes?: number;
  /** average percentage viewed, 0-100 */
  retention?: number;
  subsGained?: number;
  createdAt: string;
}

export const PROVIDERS = ['flow', 'dreamina', 'kling', 'hailuo', 'wan', 'other'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_LABELS: Record<Provider, string> = {
  flow: 'Google Flow (Veo)',
  dreamina: 'Dreamina (Seedance)',
  kling: 'Kling',
  hailuo: 'Hailuo',
  wan: 'Wan 2.2 (open source)',
  other: 'Altro',
};

export const INCOME_SOURCES = ['shorts', 'longform', 'affiliate', 'sponsor', 'product', 'other'] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number];

export const INCOME_LABELS: Record<IncomeSource, string> = {
  shorts: 'Pagamenti per views (Shorts, FB, Snap)',
  longform: 'YouTube long-form',
  affiliate: 'Affiliazioni (tool IA, Amazon, TikTok Shop)',
  sponsor: 'Sponsor / UGC',
  product: 'Prodotti digitali (prompt pack, e-book)',
  other: 'Altro',
};

export interface Income {
  id: string;
  date: string;
  source: IncomeSource;
  amount: number;
  note: string;
}
