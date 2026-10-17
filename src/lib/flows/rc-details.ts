import { extractRegistration, type RegistrationParts } from './rc-registration';

export const VEHICLE_TYPES = [
  { value: 'car', label: 'Private Car' },
  { value: 'bike', label: 'Two Wheeler' },
  { value: 'gcv', label: 'Goods Carrier (GCV)' },
  { value: 'pcv', label: 'Passenger Carrier (PCV)' },
] as const;
export const SUB_TYPES = {
  gcv: {
    label: 'Wheel type',
    options: [
      { value: 'wheels4plus', label: '>=4 wheeler' },
      { value: 'wheels3', label: '3 wheeler' },
    ],
  },
  pcv: {
    label: 'Passenger class',
    options: [
      { value: 'C1A', label: 'C1A - 4W, up to 6 passengers' },
      { value: 'C1B', label: 'C1B - 3W, up to 6 passengers' },
      { value: 'C2', label: 'C2 - 4W over 6 passengers / 3W over 17' },
      { value: 'C3', label: 'C3 - 3W, 7 to 17 passengers' },
      { value: 'C4', label: 'C4 - 2W for hire & reward' },
    ],
  },
} as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number]['value'];
export type VehicleDetails = {
  regNumberParts: RegistrationParts | null;
  manufacturingDate: string | null;
  purchaseDate: string | null;
  registrationDate: string | null;
  vehicleType: VehicleType | null;
  subType: string | null;
};
export function registration(value: unknown): RegistrationParts | null {
  if (typeof value !== 'string' || value.length > 32) return null;
  const normalized = value.toUpperCase().replace(/[\s-]/g, '');
  const parts = extractRegistration(normalized);
  return parts?.join('') === normalized ? parts : null;
}
export function validDate(value: unknown, monthOnly = false): string | null {
  if (typeof value !== 'string') return null;
  const match = (
    monthOnly ? /^(\d{2})-(\d{4})$/ : /^(\d{2})-(\d{2})-(\d{4})$/
  ).exec(value);
  if (!match) return null;
  const day = monthOnly ? 1 : Number(match[1]);
  const month = Number(match[monthOnly ? 1 : 2]);
  const year = Number(match[monthOnly ? 2 : 3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 &&
    year <= new Date().getUTCFullYear() &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getTime() <= Date.now()
    ? value
    : null;
}
export function subtypeOptions(type: VehicleType | null) {
  return type === 'gcv' || type === 'pcv' ? SUB_TYPES[type].options : [];
}
export function normalizeDetails(value: unknown): VehicleDetails {
  const v =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const vehicleType =
    VEHICLE_TYPES.find((t) => t.value === v.vehicleType)?.value ?? null;
  return {
    regNumberParts: Array.isArray(v.regNumberParts)
      ? registration(v.regNumberParts.join(''))
      : null,
    manufacturingDate: validDate(v.manufacturingDate, true),
    purchaseDate: validDate(v.purchaseDate),
    registrationDate: validDate(v.registrationDate),
    vehicleType,
    subType:
      subtypeOptions(vehicleType).find((o) => o.value === v.subType)?.value ??
      null,
  };
}
/** Conservative mapping from printed class; LMV alone does not establish use. */
export function classifyVehicle(vehicleClass: unknown): VehicleType | null {
  if (typeof vehicleClass !== 'string') return null;
  const c = vehicleClass
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (/\b(goods|gcv|truck|lorry)\b/.test(c)) return 'gcv';
  if (
    /\b(motor cab|maxi cab|motorcab|maxicab|taxi|omnibus|bus|pcv|passenger carrier|motor cycle for hire|motorcycle for hire)\b/.test(
      c
    )
  )
    return 'pcv';
  if (/\b(motor cycle|motorcycle|scooter|moped)\b/.test(c)) return 'bike';
  if (/\b(motor car|motorcar|private car)\b/.test(c)) return 'car';
  return null;
}
/** Uses only explicit wheel count and passengers EXCLUDING driver. */
export function classifySubtype(
  type: VehicleType | null,
  wheels: unknown,
  passengers: unknown
): string | null {
  if (!Number.isInteger(wheels) || Number(wheels) < 2 || Number(wheels) > 40)
    return null;
  if (type === 'gcv')
    return wheels === 3
      ? 'wheels3'
      : Number(wheels) >= 4
        ? 'wheels4plus'
        : null;
  if (type !== 'pcv') return null;
  if (wheels === 2) return 'C4';
  if (
    !Number.isInteger(passengers) ||
    Number(passengers) < 1 ||
    Number(passengers) > 200
  )
    return null;
  const p = Number(passengers);
  if (wheels === 4) return p <= 6 ? 'C1A' : 'C2';
  if (wheels === 3) return p <= 6 ? 'C1B' : p <= 17 ? 'C3' : 'C2';
  return null;
}
export function detailsFromGemini(v: Record<string, unknown>): VehicleDetails {
  const vehicleType = classifyVehicle(v.vehicleClass);
  return normalizeDetails({
    regNumberParts: registration(v.registrationNumber),
    manufacturingDate: v.manufacturingDate,
    purchaseDate: v.purchaseDate,
    registrationDate: v.registrationDate,
    vehicleType,
    subType: classifySubtype(
      vehicleType,
      v.wheelCount,
      v.passengerCapacityExcludingDriver
    ),
  });
}
export function detailsSummary(d: VehicleDetails): string {
  const unknown = 'Not available — please provide or confirm unknown';
  return [
    `Vehicle number: *${d.regNumberParts?.join(' ') ?? 'Please provide'}*`,
    `Vehicle type: ${VEHICLE_TYPES.find((t) => t.value === d.vehicleType)?.label ?? unknown}`,
    `Subtype: ${d.vehicleType === 'car' || d.vehicleType === 'bike' ? 'Not applicable' : (subtypeOptions(d.vehicleType).find((o) => o.value === d.subType)?.label ?? unknown)}`,
    `Manufacturing (MM-YYYY): ${d.manufacturingDate ?? unknown}`,
    `Purchase (DD-MM-YYYY): ${d.purchaseDate ?? unknown}`,
    `Registration (DD-MM-YYYY): ${d.registrationDate ?? unknown}`,
  ].join('\n');
}
export function correctionPrompt(d: VehicleDetails): string {
  const options = subtypeOptions(d.vehicleType)
    .map((o) => `${o.value}: ${o.label}`)
    .join('\n');
  return (
    'Jo details change/add karni hain, is format mein bhejein (one per line):\nnumber: KA51AK9051\ntype: car / bike / gcv / pcv\nmanufacturing: MM-YYYY\npurchase: DD-MM-YYYY\nregistration: DD-MM-YYYY\nsubtype: code\n\n' +
    (options ||
      'GCV codes: wheels4plus, wheels3. PCV codes: C1A, C1B, C2, C3, C4.') +
    '\n\nUnknown field ke liye unknown likhein. Purchase date aur registration date alag hain. Details bhejne ke baad naya confirmation aayega.'
  );
}
/** Parse explicit field edits, never infer dates/types from arbitrary prose. Atomic on invalid input. */
export function correctDetails(
  d: VehicleDetails,
  text: string
): VehicleDetails | null {
  const number = registration(text.trim());
  if (number) return { ...d, regNumberParts: number };
  if (text.length > 1500) return null;
  const edits = new Map<string, string>();
  for (const line of text.trim().split('\n')) {
    const m =
      /^\s*(number|type|subtype|manufacturing|purchase|registration)\s*:\s*(.+?)\s*$/i.exec(
        line
      );
    if (!m || edits.has(m[1].toLowerCase())) return null;
    edits.set(m[1].toLowerCase(), m[2]);
  }
  const next = { ...d };
  if (edits.has('type')) {
    const value = edits.get('type')!.toLowerCase();
    const type = VEHICLE_TYPES.find((t) => t.value === value)?.value ?? null;
    if (!type && value !== 'unknown') return null;
    if (type !== next.vehicleType) next.subType = null;
    next.vehicleType = type;
  }
  for (const [key, value] of edits) {
    const unknown = value.toLowerCase() === 'unknown';
    if (key === 'number') {
      const parts = registration(value);
      if (!parts) return null;
      next.regNumberParts = parts;
    } else if (key === 'subtype') {
      const subtype = subtypeOptions(next.vehicleType).find(
        (o) => o.value.toLowerCase() === value.toLowerCase()
      );
      if (!subtype && !unknown) return null;
      next.subType = subtype?.value ?? null;
    } else if (key !== 'type') {
      const field =
        key === 'manufacturing'
          ? 'manufacturingDate'
          : key === 'purchase'
            ? 'purchaseDate'
            : 'registrationDate';
      const date = validDate(value, key === 'manufacturing');
      if (!date && !unknown) return null;
      next[field] = date;
    }
  }
  return next;
}
