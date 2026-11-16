import { useState } from 'react';
import { mergeById, normalizeVideos, useIncomes, useVideos } from './lib/storage';
import type { Video } from './lib/types';
import Pipeline from './components/Pipeline';
import Calendar from './components/Calendar';
import StatsView from './components/StatsView';
import VideoEditor from './components/VideoEditor';
import Formats from './components/Formats';
import IncomeView from './components/IncomeView';

const TABS = ['pipeline', 'format', 'calendario', 'statistiche', 'entrate'] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const [videos, setVideos] = useVideos();
  const [incomes, setIncomes] = useIncomes();
  const [tab, setTab] = useState<Tab>('pipeline');
  const [editing, setEditing] = useState<Video | null>(null);

  const save = (v: Video) =>
    setVideos((list) => (list.some((x) => x.id === v.id) ? list.map((x) => (x.id === v.id ? v : x)) : [...list, v]));
  const remove = (id: string) => setVideos((list) => list.filter((x) => x.id !== id));

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ videos, incomes }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'youtuber-life.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      // older exports were a bare array of videos
      const imported = Array.isArray(data) ? { videos: data } : data;
      if (!imported || !Array.isArray(imported.videos)) throw new Error('invalid');
      // merge so importing a content pack keeps existing work; same id = update
      setVideos((list) => mergeById(list, normalizeVideos(imported.videos)));
      if (Array.isArray(imported.incomes)) setIncomes((list) => mergeById(list, imported.incomes));
    } catch {
      alert('File non valido');
    }
  };

  return (
    <div className="app">
      <header>
        <h1>▶ YouTuber Life</h1>
        <nav>
          {TABS.map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        <div className="io">
          <button onClick={exportData}>Esporta</button>
          <label className="button">
            Importa
            <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          </label>
        </div>
      </header>

      <main>
        {tab === 'pipeline' && <Pipeline videos={videos} onSave={save} onOpen={setEditing} />}
        {tab === 'format' && (
          <Formats
            videos={videos}
            onCreate={(v) => {
              save(v);
              setEditing(v);
            }}
          />
        )}
        {tab === 'calendario' && <Calendar videos={videos} onOpen={setEditing} />}
        {tab === 'statistiche' && <StatsView videos={videos} />}
        {tab === 'entrate' && <IncomeView incomes={incomes} setIncomes={setIncomes} />}
      </main>

      {editing && (
        <VideoEditor
          video={editing}
          onSave={(v) => {
            save(v);
            setEditing(null);
          }}
          onDelete={() => {
            remove(editing.id);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
