import { useRef, useState } from 'react';
import { api } from '../api';

export default function ImportTasksModal({ onClose, onDone }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const data = await api.importTasks(file);
      setResult(data);
      if (data.created > 0) onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const downloadTemplate = async () => {
    try {
      await api.downloadImportTemplate();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <h2>Импорт заданий из Excel</h2>
        <p className="import-desc">
          Загрузите файл .xlsx со столбцами: <strong>Банкомат</strong>, <strong>Дата</strong>,
          Email уборщика, Приоритет, Примечание.
        </p>

        {error && <div className="error-msg">{error}</div>}

        <div className="import-actions">
          <button type="button" className="btn-secondary" onClick={downloadTemplate}>
            📥 Скачать шаблон
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
          >
            {loading ? 'Импорт...' : '📤 Выбрать файл'}
          </button>
        </div>

        {result && (
          <div className="import-result animate-fade-in">
            <p className="import-summary">
              Обработано: {result.total} · Создано: <span className="ok">{result.created}</span>
              {result.failed > 0 && <> · Ошибок: <span className="err">{result.failed}</span></>}
            </p>
            {result.errors?.length > 0 && (
              <ul className="import-errors">
                {result.errors.map((e, i) => (
                  <li key={i}>Строка {e.line}: {e.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Закрыть</button>
        </div>

        <style>{`
          .import-desc { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem; }
          .import-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
          .import-result { background: var(--bg); border-radius: 8px; padding: 1rem; margin-top: 1rem; }
          .import-summary { font-size: 0.95rem; }
          .import-summary .ok { color: var(--success); font-weight: 600; }
          .import-summary .err { color: var(--danger); font-weight: 600; }
          .import-errors { margin-top: 0.75rem; font-size: 0.85rem; color: #fca5a5; list-style: none; max-height: 150px; overflow-y: auto; }
          .import-errors li { padding: 0.25rem 0; border-bottom: 1px solid var(--border); }
        `}</style>
      </div>
    </div>
  );
}
