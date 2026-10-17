import { expect, it } from 'vitest';
import {
  classifySubtype,
  classifyVehicle,
  correctDetails,
  detailsFromGemini,
  detailsSummary,
  normalizeDetails,
  validDate,
} from './rc-details';

it('reads sample dates and motor cab class without inventing purchase date or subtype', () => {
  const details = detailsFromGemini({
    registrationNumber: 'KA51AK9051',
    manufacturingDate: '09-2024',
    registrationDate: '02-01-2025',
    vehicleClass: 'Motor Cab',
    wheelCount: null,
    passengerCapacityExcludingDriver: null,
  });
  expect(details).toEqual({
    regNumberParts: ['KA', '51', 'AK', '9051'],
    manufacturingDate: '09-2024',
    registrationDate: '02-01-2025',
    purchaseDate: null,
    vehicleType: 'pcv',
    subType: null,
  });
  expect(detailsSummary(details)).toContain('Passenger Carrier (PCV)');
  expect(detailsSummary(details)).toContain(
    'Purchase (DD-MM-YYYY): Not available'
  );
});
it.each([
  '31-02-2024',
  '29-02-2025',
  '00-01-2020',
  '01-13-2020',
  '2024-01-01',
  '01-01-2999',
])('rejects invalid date %s', (value) => expect(validDate(value)).toBeNull());
it('validates manufacturing months and leap days', () => {
  expect(validDate('29-02-2024')).toBe('29-02-2024');
  expect(validDate('13-2024', true)).toBeNull();
  expect(validDate('09-2024', true)).toBe('09-2024');
});
it.each([
  ['gcv', 3, null, 'wheels3'],
  ['gcv', 4, null, 'wheels4plus'],
  ['gcv', 6, null, 'wheels4plus'],
  ['pcv', 4, 6, 'C1A'],
  ['pcv', 4, 7, 'C2'],
  ['pcv', 3, 6, 'C1B'],
  ['pcv', 3, 7, 'C3'],
  ['pcv', 3, 17, 'C3'],
  ['pcv', 3, 18, 'C2'],
  ['pcv', 2, null, 'C4'],
  ['pcv', null, 5, null],
  ['pcv', 4, null, null],
  ['car', 4, 5, null],
  ['pcv', 3, 0, null],
] as const)(
  'classifies %s with wheels %s passengers %s',
  (type, wheels, passengers, expected) => {
    expect(classifySubtype(type, wheels, passengers)).toBe(expected);
  }
);
it('does not classify LMV alone or map a motor cab to private car', () => {
  expect(classifyVehicle('LMV')).toBeNull();
  expect(classifyVehicle('Motor Cab')).toBe('pcv');
  expect(classifyVehicle('Motor Car')).toBe('car');
  expect(classifyVehicle('Motor Cycle')).toBe('bike');
});
it('corrects multiple fields atomically and retains other extracted fields', () => {
  const d = detailsFromGemini({
    registrationNumber: 'KA51AK9051',
    manufacturingDate: '09-2024',
    registrationDate: '02-01-2025',
    vehicleClass: 'Motor Cab',
  });
  expect(correctDetails(d, 'purchase: 01-01-2025\nsubtype: C1A')).toEqual({
    ...d,
    purchaseDate: '01-01-2025',
    subType: 'C1A',
  });
  expect(correctDetails(d, 'purchase: 31-02-2025\nsubtype: C1A')).toBeNull();
  expect(correctDetails(d, 'number: GJ06AZ8208')).toMatchObject({
    manufacturingDate: '09-2024',
    regNumberParts: ['GJ', '06', 'AZ', '8208'],
  });
  expect(correctDetails(d, 'type: gcv\nsubtype: C1A')).toBeNull();
});
it('resets incompatible subtypes and supports explicit unknown', () => {
  const d = normalizeDetails({
    vehicleType: 'pcv',
    subType: 'C1A',
    purchaseDate: '01-01-2025',
  });
  expect(correctDetails(d, 'type: car\npurchase: unknown')).toMatchObject({
    vehicleType: 'car',
    subType: null,
    purchaseDate: null,
  });
  expect(correctDetails(d, 'subtype: wheels3\ntype: gcv')).toMatchObject({
    vehicleType: 'gcv',
    subType: 'wheels3',
  });
  expect(correctDetails(d, 'type: car\ntype: bike')).toBeNull();
});

it('does not accept a wheelbase length as a wheel count', () => {
  expect(classifySubtype('gcv', 2450, null)).toBeNull();
});
