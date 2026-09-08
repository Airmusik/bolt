const AREAS: Record<string, [number, number]> = {
  westlands: [-1.2676, 36.8108], kilimani: [-1.2921, 36.7837], karen: [-1.3197, 36.7073],
  kasarani: [-1.2258, 36.8976], embakasi: [-1.3197, 36.8957], rongai: [-1.3964, 36.7580],
  utawala: [-1.2800, 36.9690], kawangware: [-1.2820, 36.7500], ruaka: [-1.2060, 36.7780],
  thika: [-1.0332, 37.0693], juja: [-1.1018, 37.0144], kitengela: [-1.4697, 36.9610],
  syokimau: [-1.3620, 36.9370], mlolongo: [-1.4000, 36.9400], machakos: [-1.5177, 37.2634],
  ngong: [-1.3618, 36.6566], limuru: [-1.1069, 36.6432], kikuyu: [-1.2454, 36.6633],
  kiambu: [-1.1714, 36.8356], naivasha: [-0.7172, 36.4310], nakuru: [-0.3031, 36.0800],
  mombasa: [-4.0435, 39.6682], kisumu: [-0.0917, 34.7680], eldoret: [0.5143, 35.2698],
};
const normalize=(value:string|null|undefined)=>String(value||'').toLowerCase();
export function locationCoordinates(value:string|null|undefined){const text=normalize(value);const key=Object.keys(AREAS).find(area=>text.includes(area));return key?AREAS[key]:null}
export function distanceKm(a:string|null|undefined,b:string|null|undefined){const one=locationCoordinates(a),two=locationCoordinates(b);if(!one||!two)return null;const rad=Math.PI/180;const dLat=(two[0]-one[0])*rad,dLon=(two[1]-one[1])*rad;const x=Math.sin(dLat/2)**2+Math.cos(one[0]*rad)*Math.cos(two[0]*rad)*Math.sin(dLon/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
export function withinLocationRadius(candidate:string|null|undefined,center:string,radius:number){if(!center||!radius)return true;const distance=distanceKm(candidate,center);return distance==null?normalize(candidate).includes(normalize(center)):distance<=radius}

