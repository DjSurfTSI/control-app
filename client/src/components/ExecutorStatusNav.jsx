import { EXECUTOR_MOBILE_TABS, countTasksForExecutorTab } from '../utils';

export default function ExecutorStatusNav({ activeTab, tasks, onTabChange }) {
  return (
    <>
      {EXECUTOR_MOBILE_TABS.map((tab) => {
        const count = countTasksForExecutorTab(tasks, tab);
        const active = activeTab === tab.id;
        const hasItems = count > 0;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${tab.label}, ${count}`}
            className={[
              'mobile-nav-item',
              'executor-status-tab',
              `executor-status-tab--${tab.id}`,
              active ? 'active' : '',
              hasItems ? 'has-items' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onTabChange?.(tab.id)}
          >
            <span className="executor-status-icon" aria-hidden>{tab.icon}</span>
            <span className="executor-status-label">{tab.shortLabel || tab.label}</span>
            <span className={`executor-status-count${hasItems ? ' has-items' : ''}`}>
              {count}
            </span>
          </button>
        );
      })}
    </>
  );
}
