
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ProcessedPage {
  a: string;
  b: string;
  w: number;
  h: number;
}

// Noise amplitude — higher = more camera disruption, but reduces eye comfort.
// 55 is a sweet spot: page still reads clearly to the eye, cameras get destroyed.
const NOISE_AMPLITUDE = 300;
// Block size for noise — larger blocks survive camera downsampling/compression.
const NOISE_BLOCK = 5;

export async function processPdf(
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<ProcessedPage[]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const out: ProcessedPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.6 });
    const w = Math.floor(viewport.width);
    const h = Math.floor(viewport.height);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const img = ctx.getImageData(0, 0, w, h);
    const { a, b } = buildComplementaryFrames(img, w, h);

    out.push({ a: toDataUrl(a), b: toDataUrl(b), w, h });
    onProgress?.(i, pdf.numPages);
  }
  return out;
}

function buildComplementaryFrames(src: ImageData, w: number, h: number) {
  const cvA = document.createElement("canvas"); cvA.width = w; cvA.height = h;
  const cvB = document.createElement("canvas"); cvB.width = w; cvB.height = h;
  const cxA = cvA.getContext("2d")!;
  const cxB = cvB.getContext("2d")!;
  const imgA = cxA.createImageData(w, h);
  const imgB = cxB.createImageData(w, h);
  const sd = src.data;
  const aD = imgA.data;
  const bD = imgB.data;

  // Pre-generate per-block noise so neighbors share noise → survives camera downsampling.
  const blocksW = Math.ceil(w / NOISE_BLOCK);
  const blocksH = Math.ceil(h / NOISE_BLOCK);
  const noiseR = new Int16Array(blocksW * blocksH);
  const noiseG = new Int16Array(blocksW * blocksH);
  const noiseB = new Int16Array(blocksW * blocksH);
  for (let i = 0; i < noiseR.length; i++) {
    noiseR[i] = (Math.random() * 2 - 1) * NOISE_AMPLITUDE;
    noiseG[i] = (Math.random() * 2 - 1) * NOISE_AMPLITUDE;
    noiseB[i] = (Math.random() * 2 - 1) * NOISE_AMPLITUDE;
  }

  for (let y = 0; y < h; y++) {
    const by = Math.floor(y / NOISE_BLOCK);
    for (let x = 0; x < w; x++) {
      const bx = Math.floor(x / NOISE_BLOCK);
      const bi = by * blocksW + bx;
      const i = (y * w + x) * 4;
      const nR = noiseR[bi];
      const nG = noiseG[bi];
      const nB = noiseB[bi];
      aD[i]     = clamp(sd[i]     + nR);
      aD[i + 1] = clamp(sd[i + 1] + nG);
      aD[i + 2] = clamp(sd[i + 2] + nB);
      aD[i + 3] = 255;
      bD[i]     = clamp(sd[i]     - nR);
      bD[i + 1] = clamp(sd[i + 1] - nG);
      bD[i + 2] = clamp(sd[i + 2] - nB);
      bD[i + 3] = 255;
    }
  }

  cxA.putImageData(imgA, 0, 0);
  cxB.putImageData(imgB, 0, 0);
  return { a: cvA, b: cvB };
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function toDataUrl(c: HTMLCanvasElement): string {
  // PNG preserves the exact noise pattern; JPEG would smooth it and reduce protection.
  return c.toDataURL("image/png");
}
