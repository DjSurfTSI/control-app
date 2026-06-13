import { useRef } from 'react';

export default function DateInput({ className = '', onClick, ...props }) {
  const ref = useRef(null);

  const openPicker = (e) => {
    onClick?.(e);
    const el = ref.current;
    if (!el || typeof el.showPicker !== 'function') return;
    try {
      el.showPicker();
    } catch {
      /* ignore: already open or unsupported context */
    }
  };

  return (
    <input
      ref={ref}
      type="date"
      className={`date-input ${className}`.trim()}
      onClick={openPicker}
      {...props}
    />
  );
}
