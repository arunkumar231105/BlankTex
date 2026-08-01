import { useState, useEffect } from 'react';

// A useState that persists to localStorage, so the value survives page reloads
// and redeploys (a new JS bundle resets React state, but localStorage is kept).
// Used to keep form drafts / UI state where the user left them.
export default function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored != null ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or value not serialisable — skip persisting this change */
    }
  }, [key, value]);

  return [value, setValue];
}

export function clearPersistentState(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
