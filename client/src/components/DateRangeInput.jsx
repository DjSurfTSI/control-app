import DateInput from './DateInput';

export default function DateRangeInput({ label, from, to, onFromChange, onToChange }) {
  return (
    <div className="form-group date-range" style={{ margin: 0 }}>
      <label>{label}</label>
      <div className="date-range-inputs">
        <DateInput value={from} onChange={onFromChange} placeholder="с" />
        <span className="date-range-sep">—</span>
        <DateInput value={to} onChange={onToChange} placeholder="по" />
      </div>
      <style>{`
        .date-range-inputs { display: flex; align-items: center; gap: 0.35rem; }
        .date-range-inputs .date-input-wrap { flex: 1; min-width: 0; }
        .date-range-sep { color: var(--text-muted); font-size: 0.85rem; }
      `}</style>
    </div>
  );
}
