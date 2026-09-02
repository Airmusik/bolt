// A starter catalogue of common models, including Japanese imports used in Kenya.
// Suggestions are not a validation whitelist: owners may enter any other model.
const VEHICLE_MODELS: Record<string, readonly string[]> = {
  Toyota: ['Allion', 'Alphard', 'Aqua', 'Auris', 'Avanza', 'Avensis', 'Axio', 'Belta', 'C-HR', 'Camry', 'Corolla', 'Corolla Cross', 'Crown', 'Fielder', 'Fortuner', 'Harrier', 'Hiace', 'Hilux', 'IST', 'Land Cruiser', 'Mark X', 'Noah', 'Passo', 'Prado', 'Premio', 'Prius', 'Probox', 'Ractis', 'Raize', 'RAV4', 'Rush', 'Sienta', 'Spade', 'Starlet', 'Succeed', 'Vanguard', 'Vellfire', 'Vitz', 'Voxy', 'Wish', 'Yaris'],
  Nissan: ['AD Van', 'Almera', 'Bluebird Sylphy', 'Caravan', 'Cube', 'Dualis', 'Elgrand', 'Juke', 'Kicks', 'Lafesta', 'Latio', 'Leaf', 'March', 'Micra', 'Navara', 'Note', 'NV200', 'Pathfinder', 'Patrol', 'Qashqai', 'Serena', 'Sunny', 'Teana', 'Tiida', 'Wingroad', 'X-Trail'],
  Honda: ['Accord', 'Airwave', 'BR-V', 'City', 'Civic', 'CR-V', 'CR-Z', 'Fit', 'Fit Shuttle', 'Freed', 'Grace', 'HR-V', 'Insight', 'Jazz', 'N-Box', 'N-One', 'N-WGN', 'Odyssey', 'Shuttle', 'Stepwgn', 'Stream', 'Vezel'],
  Mazda: ['2', '3', '5', '6', 'Atenza', 'Axela', 'Biante', 'BT-50', 'Carol', 'CX-3', 'CX-30', 'CX-5', 'CX-60', 'CX-8', 'CX-9', 'Demio', 'Familia', 'Flair', 'MPV', 'Premacy', 'Verisa'],
  Suzuki: ['Alto', 'Baleno', 'Carry', 'Celerio', 'Ertiga', 'Escudo', 'Every', 'Grand Vitara', 'Hustler', 'Ignis', 'Jimny', 'S-Presso', 'Solio', 'Spacia', 'Splash', 'Swift', 'SX4', 'Vitara', 'Wagon R'],
  Hyundai: ['Accent', 'Atos', 'Creta', 'Elantra', 'Getz', 'Grand i10', 'H-1', 'i10', 'i20', 'i30', 'Ioniq', 'Kona', 'Palisade', 'Santa Fe', 'Sonata', 'Staria', 'Tucson', 'Venue', 'Verna'],
  Subaru: ['BRZ', 'Exiga', 'Forester', 'Impreza', 'Legacy', 'Levorg', 'Outback', 'Pleo', 'Stella', 'Trezia', 'Tribeca', 'WRX', 'XV'],
  Volkswagen: ['Amarok', 'Arteon', 'Beetle', 'Caddy', 'Golf', 'Jetta', 'Passat', 'Polo', 'Sharan', 'T-Cross', 'T-Roc', 'Tiguan', 'Touareg', 'Touran', 'Transporter', 'Up'],
  Mitsubishi: ['ASX', 'Colt', 'Delica', 'Eclipse Cross', 'eK Wagon', 'Galant', 'L200', 'Lancer', 'Mirage', 'Outlander', 'Pajero', 'Pajero IO', 'Pajero Sport', 'RVR', 'Triton', 'Xpander'],
  Mercedes: ['A-Class', 'B-Class', 'C-Class', 'CLA', 'CLS', 'E-Class', 'G-Class', 'GLA', 'GLB', 'GLC', 'GLE', 'GLK', 'GLS', 'ML', 'S-Class', 'SL', 'SLK', 'Sprinter', 'V-Class', 'Vito'],
  Isuzu: ['D-Max', 'Elf', 'Forward', 'MU-X', 'NKR', 'NPR', 'Trooper'],
  BMW: ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '6 Series', '7 Series', '8 Series', 'i3', 'i4', 'iX', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z4'],
  Audi: ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'e-tron', 'Q2', 'Q3', 'Q5', 'Q7', 'Q8', 'TT'],
  Ford: ['EcoSport', 'Escape', 'Everest', 'Explorer', 'Fiesta', 'Focus', 'Fusion', 'Kuga', 'Mondeo', 'Mustang', 'Ranger', 'Transit'],
  Peugeot: ['2008', '206', '207', '208', '3008', '301', '307', '308', '407', '5008', '508', 'Expert', 'Partner', 'Rifter'],
  Daihatsu: ['Atrai', 'Boon', 'Cast', 'Copen', 'Hijet', 'Mira', 'Mira e:S', 'Move', 'Rocky', 'Sirion', 'Tanto', 'Terios', 'Thor', 'Wake'],
};

export function getVehicleModels(make: string): readonly string[] {
  const normalized = make.trim().toLowerCase().replace(/^mercedes-benz$/, 'mercedes');
  const key = Object.keys(VEHICLE_MODELS).find(name => name.toLowerCase() === normalized);
  return key ? VEHICLE_MODELS[key] : [];
}
