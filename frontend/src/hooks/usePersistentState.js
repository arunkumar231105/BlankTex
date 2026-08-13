import { useState, useEffect } from 'react';

// A useState that persists to sessionStorage, so the value survives page reloads
// (refresh / hard refresh / redeploy within the same tab) but is cleared when the
// tab is closed and reopened. Used to keep form drafts where the user left them
// without carrying them into a brand-new tab/session.
export default function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.sessionStorage.getItem(key);
      return stored != null ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or value not serialisable — skip persisting this change */
    }
  }, [key, value]);

  return [value, setValue];
}

export function clearPersistentState(key) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
