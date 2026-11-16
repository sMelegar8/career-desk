import type { Video } from '../lib/types';
import { computeStats } from '../lib/videos';
import { AGCOM_MONTHLY_VIEWS, YPP, thresholds } from '../lib/money';

const fmt = new Intl.NumberFormat('it-IT');

export default function StatsView({ videos }: { videos: Video[] }) {
  const s = computeStats(videos);
  const max = Math.max(1, ...s.publishedByMonth.map((m) => m.count));
  const t = thresholds(videos);

  return (
    <div className="stats">
      <div className="tiles">
        <Tile label="Video totali" value={s.total} />
        <Tile label="Pubblicati" value={s.published} />
        <Tile label="Visualizzazioni" value={s.totalViews} />
        <Tile label="Media views" value={s.avgViews} />
        <Tile label="Like" value={s.totalLikes} />
      </div>

      <section>
        <h2>Soglie da monitorare</h2>
        <p className="muted small">Stima dai video registrati: per i dati ufficiali vale YouTube Studio.</p>
        <Progress label="YPP livello 1 – iscritti" value={t.subscribers} goal={YPP.tier1.subscribers} />
        <Progress label="YPP livello 1 – views Shorts 90 gg" value={t.shortsViews90d} goal={YPP.tier1.shortsViews} />
        <Progress label="YPP livello 2 – iscritti" value={t.subscribers} goal={YPP.tier2.subscribers} />
        <Progress label="YPP livello 2 – views Shorts 90 gg" value={t.shortsViews90d} goal={YPP.tier2.shortsViews} />
        <Progress label="AGCOM – views ultimi 30 gg (soglia elenco influencer)" value={t.views30d} goal={AGCOM_MONTHLY_VIEWS} />
        {t.views30d >= AGCOM_MONTHLY_VIEWS && (
          <p className="warn">
            Superato 1 M di views al mese: se la media mensile resta sopra la soglia, scatta l'obbligo di iscrizione all'elenco AGCOM degli influencer rilevanti.
          </p>
        )}
      </section>

      <section>
        <h2>Video pubblicati per mese</h2>
        {s.publishedByMonth.length === 0 && <p className="muted">Nessun video pubblicato con data.</p>}
        {s.publishedByMonth.map((m) => (
          <div key={m.month} className="bar-row">
            <span>{m.month}</span>
            <div className="bar" style={{ width: `${(m.count / max) * 100}%` }} />
            <span>{m.count}</span>
          </div>
        ))}
      </section>

      <section>
        <h2>Top video</h2>
        {s.top.length === 0 && <p className="muted">Ancora nessun dato.</p>}
        <ol>
          {s.top.map((v) => (
            <li key={v.id}>
              {v.title} — {fmt.format(v.views ?? 0)} views
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Progress({ label, value, goal }: { label: string; value: number; goal: number }) {
  const pct = Math.min(100, (value / goal) * 100);
  return (
    <div className="progress">
      <div className="progress-label">
        <span>{label}</span>
        <span>
          {fmt.format(value)} / {fmt.format(goal)}
        </span>
      </div>
      <div className="track">
        <div className={`fill ${pct >= 100 ? 'done' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="tile">
      <span className="value">{fmt.format(value)}</span>
      <span className="label">{label}</span>
    </div>
  );
}
