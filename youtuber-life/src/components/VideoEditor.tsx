import { useState } from 'react';
import { FORMATS } from '../lib/formats';
import {
  COMPLIANCE_ITEMS,
  PLATFORMS,
  PLATFORM_LABELS,
  PROVIDERS,
  PROVIDER_LABELS,
  type Provider,
  STAGES,
  STAGE_LABELS,
  type ComplianceKey,
  type Stage,
  type Video,
} from '../lib/types';
import { missingCompliance } from '../lib/compliance';

interface Props {
  video: Video;
  onSave: (v: Video) => void;
  onDelete: () => void;
  onClose: () => void;
}

const toNumber = (s: string, max = Infinity) => (s === '' ? undefined : Math.min(max, Math.max(0, Number(s))));

export default function VideoEditor({ video, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState(video);
  const [tags, setTags] = useState(video.tags.join(', '));
  const set = <K extends keyof Video>(k: K, v: Video[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const missing = missingCompliance(draft);

  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...draft, title: draft.title.trim() || video.title, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) });
        }}
      >
        <h2>Modifica video</h2>
        <label>
          Titolo
          <input value={draft.title} onChange={(e) => set('title', e.target.value)} />
        </label>
        <div className="row">
          <label>
            Fase
            <select value={draft.stage} onChange={(e) => set('stage', e.target.value as Stage)}>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Serie / format
            <select value={draft.series ?? ''} onChange={(e) => set('series', e.target.value || undefined)}>
              <option value="">—</option>
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Generatore IA
          <select value={draft.provider ?? ''} onChange={(e) => set('provider', (e.target.value || undefined) as Provider | undefined)}>
            <option value="">—</option>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Piattaforme</legend>
          {PLATFORMS.map((p) => (
            <label key={p} className="inline">
              <input
                type="checkbox"
                checked={draft.platforms.includes(p)}
                onChange={(e) => set('platforms', e.target.checked ? [...draft.platforms, p] : draft.platforms.filter((x) => x !== p))}
              />
              {PLATFORM_LABELS[p]}
            </label>
          ))}
        </fieldset>
        <label>
          Data di pubblicazione
          <input type="date" value={draft.publishDate ?? ''} onChange={(e) => set('publishDate', e.target.value || undefined)} />
        </label>
        <label>
          Tag (separati da virgola)
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <label>
          Note / script
          <textarea rows={7} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
        </label>
        <div className="row">
          <label>
            Visualizzazioni
            <input type="number" min={0} value={draft.views ?? ''} onChange={(e) => set('views', toNumber(e.target.value))} />
          </label>
          <label>
            Like
            <input type="number" min={0} value={draft.likes ?? ''} onChange={(e) => set('likes', toNumber(e.target.value))} />
          </label>
          <label>
            Retention media %
            <input type="number" min={0} max={100} value={draft.retention ?? ''} onChange={(e) => set('retention', toNumber(e.target.value, 100))} />
          </label>
          <label>
            Iscritti guadagnati
            <input type="number" min={0} value={draft.subsGained ?? ''} onChange={(e) => set('subsGained', toNumber(e.target.value))} />
          </label>
        </div>
        <fieldset>
          <legend>Checklist compliance {missing.length === 0 ? '✅' : `(${missing.length} da completare)`}</legend>
          {(Object.keys(COMPLIANCE_ITEMS) as ComplianceKey[]).map((k) => (
            <label key={k} className="inline">
              <input
                type="checkbox"
                checked={!!draft.compliance[k]}
                onChange={(e) => set('compliance', { ...draft.compliance, [k]: e.target.checked })}
              />
              {COMPLIANCE_ITEMS[k]}
            </label>
          ))}
        </fieldset>
        {draft.stage === 'pubblicato' && missing.length > 0 && <p className="warn">Video pubblicato con la checklist incompleta.</p>}
        <div className="actions">
          <button type="button" className="danger" onClick={() => confirm('Eliminare questo video?') && onDelete()}>
            Elimina
          </button>
          <span />
          <button type="button" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="primary">
            Salva
          </button>
        </div>
      </form>
    </div>
  );
}
