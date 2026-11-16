import { useState } from 'react';
import { FORFETTARIO_LIMIT, forfettarioTax, summarizeIncome } from '../lib/money';
import { INCOME_LABELS, INCOME_SOURCES, type Income, type IncomeSource } from '../lib/types';

interface Props {
  incomes: Income[];
  setIncomes: (fn: (list: Income[]) => Income[]) => void;
}

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

export default function IncomeView({ incomes, setIncomes }: Props) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [startup, setStartup] = useState(true);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), source: 'affiliate' as IncomeSource, amount: '', note: '' });
  const s = summarizeIncome(incomes, year);
  const years = [...new Set([thisYear, ...incomes.map((i) => Number(i.date.slice(0, 4)))])].sort((a, b) => b - a);
  const rows = incomes.filter((i) => i.date.startsWith(String(year))).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="stats">
      <form
        className="income-form"
        onSubmit={(e) => {
          e.preventDefault();
          const amount = Number(form.amount);
          if (!(amount > 0)) return;
          setIncomes((list) => [...list, { id: crypto.randomUUID(), date: form.date, source: form.source, amount, note: form.note.trim() }]);
          setForm((f) => ({ ...f, amount: '', note: '' }));
        }}
      >
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as IncomeSource })}>
          {INCOME_SOURCES.map((src) => (
            <option key={src} value={src}>
              {INCOME_LABELS[src]}
            </option>
          ))}
        </select>
        <input type="number" min={0} step="0.01" placeholder="Importo €" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <input placeholder="Nota (brand, prodotto…)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button type="submit" className="primary">
          Registra
        </button>
      </form>

      <div className="cal-head">
        <label className="inline">
          Anno
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="value">{eur.format(s.total)}</span>
          <span className="label">Entrate {year}</span>
        </div>
        <div className="tile">
          <span className="value">{eur.format(forfettarioTax(s.total, startup))}</span>
          <span className="label">
            Imposta forfettario stimata ({startup ? '5%' : '15%'} su 78%, contributi esclusi)
          </span>
          <label className="inline small">
            <input type="checkbox" checked={startup} onChange={(e) => setStartup(e.target.checked)} /> primi 5 anni (5%)
          </label>
        </div>
        <div className="tile">
          <span className="value">{Math.round(s.topShare * 100)}%</span>
          <span className="label">Peso della fonte principale{s.topSource && ` (${INCOME_LABELS[s.topSource]})`}</span>
        </div>
      </div>

      {s.topShare > 0.5 && <p className="warn">Oltre il 50% delle entrate viene da una sola fonte: diversifica (obiettivo: ≥ 3 fonti).</p>}
      {s.total > FORFETTARIO_LIMIT && <p className="warn">Superato il limite di {eur.format(FORFETTARIO_LIMIT)} del regime forfettario: parlane con il commercialista.</p>}

      <section>
        <h2>Per fonte</h2>
        {INCOME_SOURCES.map((src) => (
          <div key={src} className="bar-row wide">
            <span>{INCOME_LABELS[src]}</span>
            <div className="bar" style={{ width: `${s.total ? (s.bySource[src] / s.total) * 100 : 0}%` }} />
            <span>{eur.format(s.bySource[src])}</span>
          </div>
        ))}
      </section>

      <section>
        <h2>Movimenti</h2>
        {rows.length === 0 && <p className="muted">Nessuna entrata registrata per il {year}.</p>}
        <table>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td>{i.date}</td>
                <td>{INCOME_LABELS[i.source]}</td>
                <td>{i.note}</td>
                <td className="num-cell">{eur.format(i.amount)}</td>
                <td>
                  <button aria-label="Elimina" onClick={() => setIncomes((list) => list.filter((x) => x.id !== i.id))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
