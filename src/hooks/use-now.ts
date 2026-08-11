import { useEffect, useRef, useState } from 'react';

const MINUTE_MS = 60_000;
const TIMER_TOLERANCE_MS = 25;

export function useNow(active = true) {
  const [now, setNow] = useState(() => new Date());
  const wasActive = useRef(active);

  useEffect(() => {
    if (!active) {
      wasActive.current = false;
      return;
    }

    if (!wasActive.current) setNow(new Date());
    wasActive.current = true;

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const scheduleNextMinute = () => {
      const delay = MINUTE_MS - (Date.now() % MINUTE_MS) + TIMER_TOLERANCE_MS;
      timeout = setTimeout(() => {
        setNow(new Date());
        scheduleNextMinute();
      }, delay);
    };

    scheduleNextMinute();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [active]);

  return now;
}
