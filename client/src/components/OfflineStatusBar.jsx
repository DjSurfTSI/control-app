import { useOffline } from '../hooks/useOffline';

function formatCachedAt(iso) {
  if (!iso) return 'нет данных';
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function OfflineStatusBar() {
  const {
    networkOnline,
    manualOffline,
    pending,
    syncing,
    caching,
    cacheStats,
    syncNow,
    toggleOfflineMode,
    lastSyncMessage,
  } = useOffline();

  const statusLabel = !networkOnline
    ? 'Нет сети'
    : manualOffline
      ? 'Офлайн (вручную)'
      : 'Онлайн';

  const statusClass = !networkOnline
    ? 'offline-status--network'
    : manualOffline
      ? 'offline-status--manual'
      : 'offline-status--online';

  const busy = syncing || caching;

  return (
    <div className={`offline-status-bar ${statusClass}${busy ? ' offline-status-bar--busy' : ''}`}>
      <div className="offline-status-main">
        <span className={`offline-status-dot ${statusClass}`} title={statusLabel} />
        <span className="offline-status-label">{statusLabel}</span>

        <span className="offline-status-sep" />

        <span className="offline-status-item" title="Заявки в кэше">
          📋 {cacheStats.taskCount}
        </span>
        <span className="offline-status-item" title="Заявки с кэшем фото">
          📷 {cacheStats.photoTaskCount}
        </span>
        <span
          className={`offline-status-item${pending > 0 ? ' offline-status-item--warn' : ''}`}
          title="Очередь на отправку"
        >
          ⏳ {pending}
        </span>

        {cacheStats.cachedAt && (
          <>
            <span className="offline-status-sep" />
            <span className="offline-status-meta" title="Время последнего кэширования">
              кэш: {formatCachedAt(cacheStats.cachedAt)}
            </span>
          </>
        )}

        {(syncing || caching) && (
          <span className="offline-status-meta offline-status-busy">
            {caching ? 'Кэширование…' : 'Синхронизация…'}
          </span>
        )}

        {lastSyncMessage && !busy && (
          <span className="offline-status-meta offline-status-feedback">{lastSyncMessage}</span>
        )}
      </div>

      <div className="offline-status-actions">
        {networkOnline && pending > 0 && (
          <button
            type="button"
            className="btn-sm btn-secondary"
            onClick={() => syncNow()}
            disabled={busy}
          >
            {syncing ? '…' : 'Синхр.'}
          </button>
        )}
        <button
          type="button"
          className={`btn-sm offline-mode-toggle${manualOffline ? ' active' : ''}`}
          onClick={() => toggleOfflineMode()}
          disabled={busy || (!networkOnline && !manualOffline)}
          title={
            manualOffline
              ? 'Выключить офлайн-режим и синхронизировать'
              : 'Включить офлайн-режим и обновить кэш'
          }
        >
          {caching ? '…' : manualOffline ? '📡 Выкл.' : '📡 Офлайн'}
        </button>
      </div>
    </div>
  );
}
