import { useEffect, useId, useRef, useState } from 'react';
import { getVehicleModels } from '@/lib/vehicleModels';
import { cn } from '@/lib/utils';

export function VehicleModelInput({ id, make, value, onChange }: {
  id: string;
  make: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState('');
  const models = getVehicleModels(make);
  const matches = models.filter(model => model.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8);
  const activeIndex = matches.indexOf(highlighted);
  const showSuggestions = open && matches.length > 0;
  useEffect(() => {
    if (open && highlighted) listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, highlighted]);
  const choose = (model: string) => {
    onChange(model);
    inputRef.current?.focus();
    setOpen(false);
    setHighlighted('');
  };
  return (
    <div onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        aria-controls={showSuggestions ? listId : undefined}
        aria-activedescendant={showSuggestions && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        value={value}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setHighlighted(''); }}
        onFocus={() => { setOpen(true); setHighlighted(''); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && matches.length > 0) {
            event.preventDefault();
            setOpen(true);
            const next = event.key === 'ArrowDown' ? (activeIndex + 1) % matches.length : activeIndex <= 0 ? matches.length - 1 : activeIndex - 1;
            setHighlighted(matches[next]);
          } else if (event.key === 'Enter' && showSuggestions && activeIndex >= 0) {
            event.preventDefault();
            choose(matches[activeIndex]);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
          } else if (event.key === 'Tab') setOpen(false);
        }}
        disabled={!make}
        required
        autoComplete="off"
        className="input disabled:cursor-not-allowed disabled:opacity-60"
        placeholder={!make ? 'Select a make first' : models.length ? `Start typing a ${make} model…` : 'Enter your vehicle model'}
        aria-describedby={`${id}-hint`}
      />
      {showSuggestions && (
        <div ref={listRef} id={listId} role="listbox" aria-label={`${make} model suggestions`} className="mt-2 max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-ink-100 bg-white p-1 shadow-soft dark:bg-[#141416]">
          {matches.map((model, index) => (
            <button key={model} id={`${listId}-${index}`} type="button" role="option" aria-selected={activeIndex === index} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(model)} className={cn('flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-left text-sm text-ink-800 hover:bg-ink-50', activeIndex === index && 'bg-ink-100')}>
              {model}
            </button>
          ))}
        </div>
      )}
      {open && models.length > 0 && matches.length === 0 && <p className="mt-2 text-xs text-ink-500">No matching suggestion. You can keep the model you typed.</p>}
    </div>
  );
}
