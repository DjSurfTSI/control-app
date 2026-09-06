import { useEffect, useState } from 'react';

export const MOBILE_BREAKPOINT = 768;

/** Ширина окна, а не UA: то же значение, на котором срабатывают media-запросы. */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return isMobile;
}
