import { useState, useRef, useEffect } from 'react';

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  label?: string;
  placeholder?: string;
}

export default function Select({
  value,
  onChange,
  options,
  label,
  placeholder = 'Select...',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  function selectOption(opt: Option) {
    onChange(opt.value);
    setOpen(false);
  }

  function handleKeyNav(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    const currentIndex = options.findIndex((o) => o.value === value);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(currentIndex + 1, options.length - 1);
      onChange(options[next].value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(currentIndex - 1, 0);
      onChange(options[prev].value);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="field" style={{ flex: 1, minWidth: 140 }}>
      {label && <div className="label">{label}</div>}
      <div className="select" ref={ref}>
        <button
          type="button"
          className="select__trigger"
          onClick={() => setOpen(!open)}
          onKeyDown={handleKeyNav}
          aria-expanded={open}
        >
          <span className={selected ? '' : 'muted'}>
            {selected ? selected.label : placeholder}
          </span>
          <span className="select__arrow">{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <div className="select__options">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`select__option ${opt.value === value ? 'selected' : ''}`}
                onClick={() => selectOption(opt)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
