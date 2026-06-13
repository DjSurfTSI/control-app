import { EXECUTOR_MOBILE_TABS, countTasksForExecutorTab } from '../utils';

export default function ExecutorStatusNav({ activeTab, tasks, onTabChange }) {
  return (
    <>
      {EXECUTOR_MOBILE_TABS.map((tab) => {
        const count = countTasksForExecutorTab(tasks, tab);
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`mobile-nav-item executor-status-tab${active ? ' active' : ''}`}
            onClick={() => onTabChange?.(tab.id)}
          >
            <span className="executor-status-label">{tab.label}</span>
            <span className={`executor-status-count${count > 0 ? ' has-items' : ''}`}>{count}</span>
          </button>
        );
      })}
    </>
  );
}
