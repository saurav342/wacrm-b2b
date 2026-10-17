import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { readRcImage } from './rc-ocr';

// Opt-in real OCR check; keep personal RC photos outside the repository.
it.skipIf(!process.env.RC_OCR_TEST_IMAGE)(
  'reads the supplied RC photo using local Tesseract',
  async () => {
    const result = await readRcImage(
      await readFile(process.env.RC_OCR_TEST_IMAGE!)
    );
    expect(result.regNumberParts).toEqual(['AN', '01', 'J', '8844']);
  },
  30_000
);
