import { useEffect, useState } from "react";

/**
 * Returns a debounced version of the input value.
 * The returned value only updates after `delay` ms of inactivity.
 */
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}
