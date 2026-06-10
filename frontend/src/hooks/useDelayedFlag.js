import { useEffect, useState } from 'react';

/**
 * Returns true only once `active` has stayed true continuously for at least
 * `delay` ms. If `active` flips back to false before the delay elapses, the
 * flag never turns on.
 *
 * Use it to gate loading skeletons/spinners so they don't flash on fast
 * (cached) responses: a fetch that resolves in a few milliseconds skips the
 * skeleton entirely, which removes the "boxes flicker in then vanish" effect.
 */
export default function useDelayedFlag(active, delay = 200) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active) {
      setShow(false);
      return undefined;
    }
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [active, delay]);
  return show;
}
