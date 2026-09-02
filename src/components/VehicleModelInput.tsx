import { useId } from 'react';
import { getVehicleModels } from '@/lib/vehicleModels';

export function VehicleModelInput({ id, make, value, onChange }: {
  id: string;
  make: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const models = getVehicleModels(make);
  return (
    <>
      <input
        id={id}
        list={models.length ? listId : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={!make}
        required
        autoComplete="off"
        className="input disabled:cursor-not-allowed disabled:opacity-60"
        placeholder={!make ? 'Select a make first' : models.length ? `Start typing a ${make} model…` : 'Enter your vehicle model'}
        aria-describedby={`${id}-hint`}
      />
      <datalist id={listId}>{models.map(model => <option key={model} value={model} />)}</datalist>
    </>
  );
}
