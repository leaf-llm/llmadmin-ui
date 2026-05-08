import { useState, useRef, useEffect } from 'react';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  min?: string;
  max?: string;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function DatePicker({ value, onChange, label, min, max }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => parseDate(value));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const current = parseDate(value);
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  function prevMonth() {
    setViewDate(new Date(viewYear, viewMonth - 1, 1));
  }

  function nextMonth() {
    setViewDate(new Date(viewYear, viewMonth + 1, 1));
  }

  function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
  }

  function getFirstDayOfMonth(year: number, month: number) {
    return new Date(year, month, 1).getDay();
  }

  function isDisabled(day: number) {
    const date = new Date(viewYear, viewMonth, day);
    const minDate = min ? parseDate(min) : null;
    const maxDate = max ? parseDate(max) : null;
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  }

  function isSelected(day: number) {
    return (
      day === current.getDate() &&
      viewMonth === current.getMonth() &&
      viewYear === current.getFullYear()
    );
  }

  function selectDay(day: number) {
    const newDate = new Date(viewYear, viewMonth, day);
    onChange(formatDate(newDate));
    setOpen(false);
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const days: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];

  return (
    <div className="field" style={{ flex: 1, minWidth: 140 }}>
      {label && <div className="label">{label}</div>}
      <div className="date-picker" ref={ref}>
        <button
          type="button"
          className="date-picker__trigger"
          onClick={() => setOpen(!open)}
        >
          {value || 'Select date'}
        </button>
        {open && (
          <div className="date-picker__calendar">
            <div className="date-picker__header">
              <button type="button" className="date-picker__nav" onClick={prevMonth}>&#8249;</button>
              <span className="date-picker__title">
                {MONTHS[viewMonth]} {viewYear}
              </span>
              <button type="button" className="date-picker__nav" onClick={nextMonth}>&#8250;</button>
            </div>
            <div className="date-picker__days">
              {DAYS.map(d => (
                <div key={d} className="date-picker__day-name">{d}</div>
              ))}
              {days.map((day, i) => (
                <button
                  key={i}
                  type="button"
                  className={`date-picker__day ${day === null ? 'empty' : ''} ${day && isSelected(day) ? 'selected' : ''} ${day && isDisabled(day) ? 'disabled' : ''}`}
                  onClick={() => day && !isDisabled(day) && selectDay(day)}
                  disabled={day === null || isDisabled(day)}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
