import english from '@tesseract.js-data/eng';
import sharp from 'sharp';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { extractRegistration, proposeRegistration } from './rc-registration';

let activeJobs = 0;

/** Local OCR only: the image and extracted text never go to an OCR vendor. */
export async function readRcImage(image: Buffer) {
  if (activeJobs >= 2) throw new Error('OCR capacity reached');
  activeJobs++;
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  try {
    const work = async () => {
      const prepared = await sharp(image, { limitInputPixels: 20_000_000 })
        .rotate()
        .resize({ width: 2200 })
        .grayscale()
        .normalize()
        .png()
        .toBuffer();
      if (expired) throw new Error('OCR timed out');
      worker = await createWorker('eng', OEM.LSTM_ONLY, {
        langPath: english.langPath,
        cacheMethod: 'none',
        // Reject failed jobs instead of Tesseract's default uncaught throw.
        errorHandler: () => {},
      });
      if (expired) {
        await worker.terminate();
        throw new Error('OCR timed out');
      }
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      let { data } = await worker.recognize(prepared);
      let parts = data.confidence >= 60 ? extractRegistration(data.text) : null;
      if (!parts) {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
        const retry = await worker.recognize(prepared);
        if (retry.data.confidence >= data.confidence) data = retry.data;
        parts = data.confidence >= 60 ? extractRegistration(data.text) : null;
      }
      const proposed =
        !parts && data.confidence >= 60 ? proposeRegistration(data.text) : null;
      // Overall confidence is only a coarse review gate, not a probability
      // that the registration number is correct.
      return {
        confidence: data.confidence,
        regNumberParts: parts ?? proposed,
        formatCorrected: proposed !== null,
      };
    };
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new Error('OCR timed out'));
        }, 20_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (worker) await worker.terminate();
    activeJobs--;
  }
}
