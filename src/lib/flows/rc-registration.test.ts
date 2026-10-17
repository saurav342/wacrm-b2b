import { describe, expect, it } from 'vitest';
import { extractRegistration, proposeRegistration } from './rc-registration';

describe('RC registration extraction', () => {
  it.each(['Reg. No. AN01J 8844', 'AN-01-J-8844', 'an 01 j 8844'])(
    'reads %s preserving zeros',
    (text) => {
      expect(extractRegistration(text)).toEqual(['AN', '01', 'J', '8844']);
    }
  );
  it('reads the requested Gujarat format', () => {
    expect(extractRegistration('GJ06AZ8208')).toEqual([
      'GJ',
      '06',
      'AZ',
      '8208',
    ]);
  });
  it.each([
    'Chassis No. 600687B Engine No. 600687B',
    'AN O1 J 8844',
    'AN01J884',
    'XX01J8844',
    '22BH1234AA',
    'AN01J8844 GJ06AZ8208',
  ])('requires review for %s', (text) => {
    expect(extractRegistration(text)).toBeNull();
  });
  it('allows repeated readings of the same registration', () => {
    expect(extractRegistration('AN01J8844\nAN 01 J 8844')).toEqual([
      'AN',
      '01',
      'J',
      '8844',
    ]);
  });
  it('proposes O→0 only in numeric positions for review', () => {
    expect(proposeRegistration('ANO1J 8844')).toEqual([
      'AN',
      '01',
      'J',
      '8844',
    ]);
    expect(proposeRegistration('GJ06AO82O8')).toEqual([
      'GJ',
      '06',
      'AO',
      '8208',
    ]);
    expect(proposeRegistration('ANO1J8844 GJ06AZ8208')).toBeNull();
  });
});
