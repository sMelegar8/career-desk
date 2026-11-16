import { useState } from 'react';
import { PLATFORM_LABELS, PROVIDER_LABELS, STAGES, STAGE_LABELS, type Video } from '../lib/types';
import { needsComplianceAttention } from '../lib/compliance';
import { formatById } from '../lib/formats';
import { byStage, moveStage, newVideo } from '../lib/videos';

interface Props {
  videos: Video[];
  onSave: (v: Video) => void;
  onOpen: (v: Video) => void;
}

export default function Pipeline({ videos, onSave, onOpen }: Props) {
  const [title, setTitle] = useState('');
  const columns = byStage(videos);

  return (
    <>
      <form
        className="quick-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onSave(newVideo(title));
          setTitle('');
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nuova idea per un video…" />
        <button type="submit">Aggiungi</button>
      </form>

      <div className="board">
        {STAGES.map((stage) => (
          <section key={stage} className="column">
            <h2>
              {STAGE_LABELS[stage]} <span className="count">{columns[stage].length}</span>
            </h2>
            {columns[stage].map((v) => (
              <article key={v.id} className={`card ${needsComplianceAttention(v) ? 'alert' : ''}`} onClick={() => onOpen(v)}>
                <strong>{v.title}</strong>
                {needsComplianceAttention(v) && <small className="warn-text">⚠ checklist compliance incompleta</small>}
                {v.series && <small>🎬 {formatById(v.series)?.name ?? v.series}</small>}
                {v.provider && <small>🤖 {PROVIDER_LABELS[v.provider]}</small>}
                {v.platforms.length > 0 && <small>{v.platforms.map((p) => PLATFORM_LABELS[p]).join(' · ')}</small>}
                {v.publishDate && <small>📅 {v.publishDate}</small>}
                {v.tags.length > 0 && (
                  <div className="tags">
                    {v.tags.map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                  </div>
                )}
                <div className="moves" onClick={(e) => e.stopPropagation()}>
                  <button disabled={stage === STAGES[0]} onClick={() => onSave(moveStage(v, -1))} aria-label="Indietro">
                    ←
                  </button>
                  <button disabled={stage === STAGES[STAGES.length - 1]} onClick={() => onSave(moveStage(v, 1))} aria-label="Avanti">
                    →
                  </button>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
