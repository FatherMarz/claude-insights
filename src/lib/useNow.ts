import { useEffect, useState } from 'react';

// A `now` Date that ticks on an interval so consumers re-derive when the
// Max-plan reset boundary is crossed mid-session. Without this, useMemo
// blocks that capture `new Date()` hold a pre-reset timestamp and the
// window never rolls over until the page is reloaded.
export function useNow(intervalMs: number = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
