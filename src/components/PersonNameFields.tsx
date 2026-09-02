import { useId } from 'react';

export function PersonNameFields({ firstName, secondName, onFirstNameChange, onSecondNameChange }: {
  firstName: string;
  secondName: string;
  onFirstNameChange: (value: string) => void;
  onSecondNameChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-first`} className="label">First name <span className="text-danger">*</span></label>
          <input id={`${id}-first`} value={firstName} onChange={(event) => onFirstNameChange(event.target.value)} autoComplete="given-name" placeholder="e.g. Jane" className="input" required minLength={2} aria-describedby={`${id}-hint`} />
        </div>
        <div>
          <label htmlFor={`${id}-second`} className="label">Second name <span className="text-danger">*</span></label>
          <input id={`${id}-second`} value={secondName} onChange={(event) => onSecondNameChange(event.target.value)} autoComplete="family-name" placeholder="e.g. Wanjiku" className="input" required minLength={2} aria-describedby={`${id}-hint`} />
        </div>
      </div>
      <p id={`${id}-hint`} className="mt-1.5 text-xs leading-5 text-ink-500">Enter your first name and family or second name. Both appear on your profile and in chat.</p>
    </div>
  );
}
