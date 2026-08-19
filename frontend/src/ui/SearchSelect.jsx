import { useEffect, useMemo, useRef, useState } from 'react';

// Type-to-filter dropdown for long catalog lists (a DIGI supplier carries hundreds of
// styles and colours, which a native <select> makes you scroll blindly through).
// Options: { value, label, hint } — `hint` is the code shown beside the name and is
// searchable too, so "DG001" finds a style just as well as "cotton tee".
const MAX_VISIBLE = 200;

export default function SearchSelect({ value, options, placeholder = 'Select…', disabled = false, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((option) => String(option.value) === String(value)) || null;
  const selectedText = selected ? `${selected.label}${selected.hint ? ` (${selected.hint})` : ''}` : '';

  const matches = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return options;
    return options.filter((option) => {
      const haystack = `${option.label} ${option.hint || ''}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [options, search]);
  const visible = matches.slice(0, MAX_VISIBLE);

  useEffect(() => setActive(0), [search, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => { if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Keep the highlighted row inside the scroll viewport while arrowing through.
  useEffect(() => {
    if (!open || !menuRef.current) return;
    menuRef.current.querySelector('.search-select-option.active')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (option) => {
    onChange(option.value);
    setSearch('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) return setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      return setActive((current) => (visible.length ? (current + step + visible.length) % visible.length : 0));
    }
    if (event.key === 'Enter') {
      // Never let picking an option submit the surrounding order form.
      if (open) { event.preventDefault(); if (visible[active]) choose(visible[active]); }
      return;
    }
    if (event.key === 'Escape' && open) { event.preventDefault(); setSearch(''); setOpen(false); }
  };

  return (
    <div className={`search-select${open ? ' open' : ''}${disabled ? ' disabled' : ''}`} ref={boxRef}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        className={`search-select-input${!open && selected ? ' has-value' : ''}`}
        value={open ? search : selectedText}
        placeholder={open ? (selectedText || 'Type to search…') : placeholder}
        onChange={(event) => { setSearch(event.target.value); setOpen(true); }}
        onFocus={() => { if (!disabled) { setSearch(''); setOpen(true); } }}
        onKeyDown={onKeyDown}
      />
      {selected && !disabled
        ? <button type="button" className="search-select-clear" title="Clear" aria-label="Clear selection" onClick={() => { onChange(''); setSearch(''); setOpen(false); }}>×</button>
        : <span className="search-select-caret" aria-hidden="true">▾</span>}
      {open && (
        <div className="search-select-menu" ref={menuRef}>
          {visible.length ? visible.map((option, index) => (
            <button
              type="button"
              key={option.value}
              className={`search-select-option${index === active ? ' active' : ''}${String(option.value) === String(value) ? ' selected' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {option.hint && <small>{option.hint}</small>}
            </button>
          )) : <div className="search-select-empty">{options.length ? 'No matches' : 'Nothing to choose'}</div>}
          {matches.length > visible.length && <div className="search-select-more">+{matches.length - visible.length} more — keep typing to narrow</div>}
        </div>
      )}
    </div>
  );
}
