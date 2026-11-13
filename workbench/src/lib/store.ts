import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'rosetta:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch { return fallback; }
}
export function save<T>(key: string, value: T): void {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/** useState that persists to localStorage. */
export function useStored<T>(key: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => load(key, fallback));
  useEffect(() => { save(key, value); }, [key, value]);
  return [value, setValue];
}

export function useHashRoute(): [string[], (path: string) => void] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [parts, setParts] = useState<string[]>(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((path: string) => { window.location.hash = '/' + path.replace(/^\//, ''); }, []);
  return [parts, go];
}

export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}
