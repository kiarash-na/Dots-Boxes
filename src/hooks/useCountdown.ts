import { useEffect, useState } from 'react';

/** Milliseconds left until `deadline` (epoch ms), re-rendering a few times a second. */
export function useCountdown(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline === null ? 0 : Math.max(0, deadline - now);
}
