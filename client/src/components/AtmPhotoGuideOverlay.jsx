import { PHOTO_TYPE_LABELS, PHOTO_TYPES } from '../utils';

const GUIDE_HINTS = {
  left: 'Обойдите банкомат и встаньте слева. Весь корпус — внутри зелёного контура.',
  right: 'Обойдите банкомат и встаньте справа. Весь корпус — внутри зелёного контура.',
  front: 'Встаньте прямо перед банкоматом. Экран и клавиатура должны быть видны.',
  top: 'Поднимите телефон и снимите сверху — видны верхняя часть и клавиатура.',
};

const ANGLE_ICONS = {
  left: '←',
  right: '→',
  front: '◎',
  top: '↓',
};

const MISSION_LABELS = {
  left: 'Ракурс слева',
  right: 'Ракурс справа',
  front: 'Ракурс спереди',
  top: 'Ракурс сверху',
};

function AtmSilhouette({ photoType }) {
  if (photoType === 'front') {
    return (
      <g className="atm-guide-shape atm-guide-shape-main">
        <rect x="72" y="48" width="216" height="480" rx="14" />
        <rect x="96" y="72" width="168" height="120" rx="8" className="atm-guide-screen" />
        <rect x="120" y="210" width="120" height="8" rx="2" className="atm-guide-slot" />
        <rect x="96" y="340" width="168" height="140" rx="8" className="atm-guide-keypad" />
        {[0, 1, 2, 3].map((row) => (
          [0, 1, 2].map((col) => (
            <circle
              key={`${row}-${col}`}
              cx={120 + col * 48}
              cy={365 + row * 28}
              r="6"
              className="atm-guide-key"
            />
          ))
        ))}
      </g>
    );
  }

  if (photoType === 'left' || photoType === 'right') {
    const flip = photoType === 'right' ? ' atm-guide-flip' : '';
    return (
      <g className={`atm-guide-shape atm-guide-shape-main${flip}`}>
        <path d="M 108 52 L 252 72 L 240 500 L 96 480 Z" />
        <rect x="128" y="100" width="72" height="88" rx="6" className="atm-guide-screen" />
        <rect x="118" y="320" width="90" height="120" rx="6" className="atm-guide-keypad" />
      </g>
    );
  }

  if (photoType === 'top') {
    return (
      <g className="atm-guide-shape atm-guide-shape-main">
        <rect x="60" y="120" width="240" height="320" rx="16" />
        <rect x="84" y="160" width="192" height="130" rx="8" className="atm-guide-keypad" />
        {[0, 1, 2, 3].map((row) => (
          [0, 1, 2, 3].map((col) => (
            <circle
              key={`t-${row}-${col}`}
              cx={108 + col * 42}
              cy={185 + row * 26}
              r="5"
              className="atm-guide-key"
            />
          ))
        ))}
        <rect x="108" y="340" width="144" height="60" rx="6" className="atm-guide-screen" />
      </g>
    );
  }

  return null;
}

function CornerBrackets() {
  const size = 28;
  const inset = 12;
  const corners = [
    { x1: inset, y1: inset, x2: inset + size, y2: inset, x3: inset, y3: inset + size },
    { x1: 360 - inset, y1: inset, x2: 360 - inset - size, y2: inset, x3: 360 - inset, y3: inset + size },
    { x1: inset, y1: 640 - inset, x2: inset + size, y2: 640 - inset, x3: inset, y3: 640 - inset - size },
    { x1: 360 - inset, y1: 640 - inset, x2: 360 - inset - size, y2: 640 - inset, x3: 360 - inset, y3: 640 - inset - size },
  ];
  return (
    <g className="atm-guide-corners">
      {corners.map((c, i) => (
        <g key={i}>
          <line className="atm-guide-corner" x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} />
          <line className="atm-guide-corner" x1={c.x1} y1={c.y1} x2={c.x3} y2={c.y3} />
        </g>
      ))}
    </g>
  );
}

/** Подсказка кадрирования: полноэкранный режим для камеры или компактный для ячейки фотоотчёта. */
export default function AtmPhotoGuideOverlay({
  photoType,
  className = '',
  compact = false,
  stepIndex,
  totalSteps = PHOTO_TYPES.length,
}) {
  const hint = GUIDE_HINTS[photoType] || 'Разместите банкомат в зелёном контуре';
  const label = PHOTO_TYPE_LABELS[photoType] || photoType;
  const mission = MISSION_LABELS[photoType] || label;
  const step = stepIndex ?? PHOTO_TYPES.indexOf(photoType) + 1;
  const angleIcon = ANGLE_ICONS[photoType] || '◎';

  if (compact) {
    return (
      <div className={`atm-photo-guide atm-photo-guide-compact ${className}`.trim()} aria-hidden>
        <svg className="atm-photo-guide-svg" viewBox="0 0 360 640" preserveAspectRatio="xMidYMid meet">
          <AtmSilhouette photoType={photoType} />
        </svg>
        <span className="atm-photo-guide-compact-label">{label}</span>
      </div>
    );
  }

  return (
    <div className={`atm-photo-guide atm-photo-guide-full ${className}`.trim()}>
      <div className="atm-guide-hud-top">
        <div className="atm-guide-mission">
          <span className="atm-guide-mission-badge">🎯 Миссия</span>
          <strong><span className="atm-guide-angle-inline">{angleIcon}</span> {mission}</strong>
        </div>
        <div className="atm-guide-step-pill">
          Шаг {step} / {totalSteps}
        </div>
      </div>

      <div className="atm-guide-viewfinder">
        <svg className="atm-photo-guide-svg" viewBox="0 0 360 640" preserveAspectRatio="xMidYMid meet">
          <rect className="atm-guide-vignette" x="0" y="0" width="360" height="640" />
          <CornerBrackets />
          <AtmSilhouette photoType={photoType} />
          <rect className="atm-guide-scan-line" x="24" y="0" width="312" height="4" rx="2" />
          <circle className="atm-guide-target-ring" cx="180" cy="320" r="118" />
        </svg>
      </div>

      <div className="atm-guide-hud-bottom">
        <p className="atm-guide-main-text">Вместите банкомат в зелёный контур</p>
        <p className="atm-guide-sub-text">{hint}</p>
        <div className="atm-guide-progress" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={totalSteps}>
          {PHOTO_TYPES.map((type, i) => (
            <span
              key={type}
              className={`atm-guide-progress-dot${i + 1 === step ? ' active' : ''}${i + 1 < step ? ' done' : ''}`}
              title={PHOTO_TYPE_LABELS[type]}
            />
          ))}
        </div>
        <p className="atm-guide-xp-hint">+25 XP за каждый ракурс 📸</p>
      </div>
    </div>
  );
}

export { GUIDE_HINTS };
