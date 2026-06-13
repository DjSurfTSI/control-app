import { useRef, useState } from 'react';

export default function ExcelImportModal({
  title,
  description,
  onClose,
  onDone,
  onImport,
  onDownloadTemplate,
}) {
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
      const data = await onImport(file);
      setResult(data);
      if (data.created > 0) onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal animate-slide-up" onClick={(ev) => ev.stopPropagation()}>
        <h2>{title}</h2>
        <p className="import-desc">{description}</p>
        {error && <div className="error-msg">{error}</div>}
        <div className="import-actions">
          <button type="button" className="btn-secondary" onClick={onDownloadTemplate}>
            📥 Скачать шаблон
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={handleImport} style={{ display: 'none' }} />
          <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()} disabled={loading}>
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
      </div>
    </div>
  );
}
