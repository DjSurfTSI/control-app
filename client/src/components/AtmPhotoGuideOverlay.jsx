import { PHOTO_TYPE_LABELS } from '../utils';

const GUIDE_HINTS = {
  left: 'Снимите банкомат слева — в рамку должен попасть весь корпус',
  right: 'Снимите банкомат справа — в рамку должен попасть весь корпус',
  front: 'Снимите банкомат спереди — экран и панель внутри рамки',
  top: 'Снимите сверху — видны верхняя часть и клавиатура',
};

/** SVG-контур банкомата для подсказки кадрирования (вид зависит от ракурса). */
export default function AtmPhotoGuideOverlay({ photoType, className = '', compact = false }) {
  const hint = GUIDE_HINTS[photoType] || 'Разместите банкомат в рамке';
  const label = PHOTO_TYPE_LABELS[photoType] || photoType;

  return (
    <div className={`atm-photo-guide ${compact ? 'atm-photo-guide-compact' : ''} ${className}`.trim()} aria-hidden={compact}>
      <svg className="atm-photo-guide-svg" viewBox="0 0 200 280" preserveAspectRatio="xMidYMid meet">
        <rect className="atm-guide-frame" x="8" y="8" width="184" height="264" rx="8" />
        {photoType === 'front' && (
          <g className="atm-guide-shape">
            <rect x="55" y="40" width="90" height="200" rx="6" />
            <rect x="68" y="55" width="64" height="48" rx="4" className="atm-guide-screen" />
            <rect x="68" y="165" width="64" height="55" rx="4" className="atm-guide-keypad" />
          </g>
        )}
        {(photoType === 'left' || photoType === 'right') && (
          <g className={`atm-guide-shape${photoType === 'right' ? ' atm-guide-flip' : ''}`}>
            <path d="M 70 45 L 130 55 L 125 215 L 65 205 Z" />
            <rect x="78" y="70" width="35" height="30" rx="3" className="atm-guide-screen" />
          </g>
        )}
        {photoType === 'top' && (
          <g className="atm-guide-shape">
            <rect x="45" y="70" width="110" height="140" rx="8" />
            <rect x="58" y="95" width="84" height="55" rx="4" className="atm-guide-keypad" />
            <rect x="70" y="168" width="60" height="28" rx="3" className="atm-guide-screen" />
          </g>
        )}
        <line className="atm-guide-corner" x1="8" y1="8" x2="38" y2="8" />
        <line className="atm-guide-corner" x1="8" y1="8" x2="8" y2="38" />
        <line className="atm-guide-corner" x1="192" y1="8" x2="162" y2="8" />
        <line className="atm-guide-corner" x1="192" y1="8" x2="192" y2="38" />
        <line className="atm-guide-corner" x1="8" y1="272" x2="38" y2="272" />
        <line className="atm-guide-corner" x1="8" y1="272" x2="8" y2="242" />
        <line className="atm-guide-corner" x1="192" y1="272" x2="162" y2="272" />
        <line className="atm-guide-corner" x1="192" y1="272" x2="192" y2="242" />
      </svg>
      {!compact && (
        <div className="atm-photo-guide-caption">
          <strong>{label}</strong>
          <span>{hint}</span>
        </div>
      )}
    </div>
  );
}

export { GUIDE_HINTS };
