import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { ALL_LOCATIONS } from '@/lib/locations';

type PlacesLibrary = google.maps.PlacesLibrary;
let placesLibraryPromise: Promise<PlacesLibrary> | null = null;

function loadPlacesLibrary() {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return null;
  if (!placesLibraryPromise) {
    setOptions({ key, v: 'weekly', language: 'en', region: 'KE' });
    placesLibraryPromise = importLibrary('places');
  }
  return placesLibraryPromise;
}

function cleanKenyaLabel(label: string) {
  return label.replace(/,\s*Kenya\s*$/i, '').trim();
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
  className?: string;
  ariaLabel?: string;
}

export function PlaceAutocomplete({
  value,
  onChange,
  placeholder = 'Start typing any place in Kenya…',
  required,
  id,
  className = '',
  ariaLabel = 'Location in Kenya',
}: Props) {
  const [suggestions, setSuggestions] = useState<google.maps.places.PlacePrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const requestNumber = useRef(0);

  useEffect(() => {
    let active = true;
    const loader = loadPlacesLibrary();
    if (!loader) return;
    loader.then(({ AutocompleteSessionToken }) => {
      if (!active) return;
      sessionToken.current = new AutocompleteSessionToken();
      setGoogleReady(true);
    }).catch((error) => {
      console.error('Google Places could not load', error);
      if (active) setGoogleFailed(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!googleReady || value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const currentRequest = ++requestNumber.current;
    const timer = window.setTimeout(async () => {
      try {
        const { AutocompleteSuggestion } = await importLibrary('places');
        const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: value.trim(),
          includedRegionCodes: ['ke'],
          language: 'en',
          region: 'ke',
          sessionToken: sessionToken.current ?? undefined,
        });
        if (currentRequest === requestNumber.current) {
          setSuggestions(response.suggestions.flatMap((item) => item.placePrediction ? [item.placePrediction] : []));
          setOpen(true);
        }
      } catch (error) {
        console.error('Google Places suggestions failed', error);
        if (currentRequest === requestNumber.current) setGoogleFailed(true);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [googleReady, value]);

  const choose = async (prediction: google.maps.places.PlacePrediction) => {
    onChange(cleanKenyaLabel(prediction.text.text));
    setOpen(false);
    setSuggestions([]);
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress'] });
      if (place.formattedAddress) onChange(cleanKenyaLabel(place.formattedAddress));
      const { AutocompleteSessionToken } = await importLibrary('places');
      sessionToken.current = new AutocompleteSessionToken();
    } catch (error) {
      console.error('Google Place details failed', error);
    }
  };

  const fallbackSuggestions = !googleReady && value.trim().length > 1
    ? ALL_LOCATIONS.filter((place) => place.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8)
    : [];

  return (
    <div className="relative">
      <MapPin className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        id={id}
        value={value}
        onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 180)}
        autoComplete="off"
        placeholder={placeholder}
        required={required}
        aria-label={ariaLabel}
        aria-expanded={open && (suggestions.length > 0 || fallbackSuggestions.length > 0)}
        className={`input pl-10 ${className}`}
      />
      {open && (suggestions.length > 0 || fallbackSuggestions.length > 0) && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-ink-100 bg-white p-1 shadow-card-hover dark:bg-[#141416]">
          {suggestions.map((prediction) => (
            <button key={prediction.placeId} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(prediction)} className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-ink-50">
              <MapPin className="mt-0.5 h-4 w-4 flex-none text-brand-600" />
              <span><span className="block text-sm font-medium text-ink-800">{prediction.mainText?.text || prediction.text.text}</span>{prediction.secondaryText?.text && <span className="block text-xs text-ink-500">{prediction.secondaryText.text}</span>}</span>
            </button>
          ))}
          {fallbackSuggestions.map((place) => (
            <button key={place} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(place); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-50">
              <MapPin className="h-4 w-4 text-ink-400" /> {place}
            </button>
          ))}
        </div>
      )}
      {googleFailed && <p className="mt-1 text-xs text-ink-400">Suggestions are unavailable, but you can still type any Kenyan location.</p>}
    </div>
  );
}
