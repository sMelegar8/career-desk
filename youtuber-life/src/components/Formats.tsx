import { FORMATS, scriptTemplate, type Format } from '../lib/formats';
import { PLATFORM_LABELS, type Video } from '../lib/types';
import { newVideo } from '../lib/videos';

interface Props {
  videos: Video[];
  onCreate: (v: Video) => void;
}

export function videoFromFormat(f: Format): Video {
  return {
    ...newVideo(f.name),
    stage: 'script',
    series: f.id,
    platforms: [...f.platforms],
    notes: scriptTemplate(f),
    tags: ['ia'],
  };
}

export default function Formats({ videos, onCreate }: Props) {
  return (
    <div className="formats">
      <p className="muted">
        Serie ricorrenti generate con l'IA. "Usa format" crea un video in pipeline con lo script già impostato; i prompt delle clip stanno in studio/specs.
      </p>
      <div className="format-grid">
        {FORMATS.map((f) => {
          const used = videos.filter((v) => v.series === f.id);
          const published = used.filter((v) => v.stage === 'pubblicato');
          const avgViews = published.length ? Math.round(published.reduce((s, v) => s + (v.views ?? 0), 0) / published.length) : 0;
          return (
            <article key={f.id} className="format">
              <h2>{f.name}</h2>
              <p>{f.pitch}</p>
              <p>
                <strong>Hook:</strong> {f.hook}
              </p>
              <ul>
                {f.structure.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <div className="meta">
                <span>⏱ {f.duration}</span>
                <span>🎯 {f.role}</span>
              </div>
              <div className="tags">
                {f.platforms.map((p) => (
                  <span key={p}>{PLATFORM_LABELS[p]}</span>
                ))}
              </div>
              <footer>
                <small className="muted">
                  {used.length} video · {published.length} pubblicati{published.length > 0 && ` · media ${avgViews.toLocaleString('it-IT')} views`}
                </small>
                <button className="primary" onClick={() => onCreate(videoFromFormat(f))}>
                  Usa format
                </button>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
