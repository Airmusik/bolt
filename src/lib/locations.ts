// All 47 counties of Kenya.
export const KENYAN_COUNTIES = [
  'Mombasa', 'Kwale', 'Kilifi', 'Tana River', 'Lamu', 'Taita-Taveta',
  'Garissa', 'Wajir', 'Mandera', 'Marsabit', 'Isiolo', 'Meru',
  'Tharaka-Nithi', 'Embu', 'Kitui', 'Machakos', 'Makueni', 'Nyandarua',
  'Nyeri', 'Kirinyaga', 'Murang\'a', 'Kiambu', 'Turkana', 'West Pokot',
  'Samburu', 'Trans Nzoia', 'Uasin Gishu', 'Elgeyo-Marakwet', 'Nandi',
  'Baringo', 'Laikipia', 'Nakuru', 'Narok', 'Kajiado', 'Kericho',
  'Bomet', 'Kakamega', 'Vihiga', 'Bungoma', 'Busia', 'Siaya',
  'Kisumu', 'Homa Bay', 'Migori', 'Kisii', 'Nyamira', 'Nairobi',
  'Kiambu',
];

// Common towns used as a quick location picker alongside counties.
export const KENYAN_TOWNS = [
  'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika',
  'Nyeri', 'Malindi', 'Kitale', 'Garissa', 'Kakamega', 'Machakos',
  'Meru', 'Kericho', 'Nanyuki', 'Voi', 'Lamu', 'Wajir',
];

export const ALL_LOCATIONS = Array.from(new Set([...KENYAN_COUNTIES, ...KENYAN_TOWNS])).sort();

export const VEHICLE_MAKES = [
  'Toyota', 'Nissan', 'Honda', 'Mazda', 'Suzuki', 'Hyundai',
  'Subaru', 'Volkswagen', 'Mitsubishi', 'Mercedes', 'Isuzu', 'BMW',
  'Audi', 'Ford', 'Peugeot', 'Daihatsu', 'Other',
];
