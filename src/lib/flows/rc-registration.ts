export type RegistrationParts = [string, string, string, string];

// Standard state/RTO/series/serial registrations only. Do not guess O/0 or I/1.
const STATES = new Set(
  'AN AP AR AS BR CG CH DD DL DN GA GJ HP HR JH JK KA KL LA LD MH ML MN MP MZ NL OD OR PB PY RJ SK TN TR TS TG UK UP UT WB'.split(
    ' '
  )
);

export function extractRegistration(text: string): RegistrationParts | null {
  const candidates = new Map<string, RegistrationParts>();
  const pattern = /\b([A-Z]{2})[\s-]*(\d{2})[\s-]*([A-Z]{1,3})[\s-]*(\d{4})\b/g;
  for (const match of text.toUpperCase().matchAll(pattern)) {
    if (!STATES.has(match[1])) continue;
    const parts: RegistrationParts = [match[1], match[2], match[3], match[4]];
    candidates.set(parts.join(''), parts);
  }
  // Multiple distinct numbers need review rather than picking the first one.
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}

/** A format-corrected proposal, always requiring human review. Only O→0 in
 * numeric positions is supported; never alter state or series letters. */
export function proposeRegistration(text: string): RegistrationParts | null {
  const corrected = text
    .toUpperCase()
    .replace(
      /\b([A-Z]{2})[\s-]*([\dO]{2})[\s-]*([A-Z]{1,3})[\s-]*([\dO]{4})\b/g,
      (_, state: string, rto: string, series: string, serial: string) =>
        `${state}${rto.replaceAll('O', '0')}${series}${serial.replaceAll('O', '0')}`
    );
  return extractRegistration(corrected);
}
