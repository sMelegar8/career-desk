import { useState } from 'react';
import type { Video } from '../lib/types';
import { monthGrid } from '../lib/videos';

interface Props {
  videos: Video[];
  onOpen: (v: Video) => void;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export default function Calendar({ videos, onOpen }: Props) {
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const shift = (d: number) => {
    const date = new Date(cursor.y, cursor.m + d, 1);
    setCursor({ y: date.getFullYear(), m: date.getMonth() });
  };
  const label = new Date(cursor.y, cursor.m, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  return (
    <div className="calendar">
      <div className="cal-head">
        <button onClick={() => shift(-1)}>‹</button>
        <h2>{label}</h2>
        <button onClick={() => shift(1)}>›</button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="weekday">
            {d}
          </div>
        ))}
        {monthGrid(cursor.y, cursor.m).map((day, i) => (
          <div key={i} className={`day ${day ? '' : 'empty'}`}>
            {day && <span className="num">{Number(day.slice(8))}</span>}
            {day &&
              videos
                .filter((v) => v.publishDate === day)
                .map((v) => (
                  <button key={v.id} className={`event ${v.stage}`} onClick={() => onOpen(v)}>
                    {v.title}
                  </button>
                ))}
          </div>
        ))}
      </div>
    </div>
  );
}
