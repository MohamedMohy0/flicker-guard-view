import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ProcessedPage {
  a: string;
  b: string;
  w: number;
  h: number;
}

// Eye-friendly values
const NOISE_AMPLITUDE = 12;

// Optional dynamic flicker
const FLICKER_AMPLITUDE = 8;

// Pixel-level pattern
const PATTERN_SCALE = 1;

export async function processPdf(
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<ProcessedPage[]> {
  const buf = await file.arrayBuffer();

  const pdf = await pdfjs.getDocument({
    data: buf,
  }).promise;

  const out: ProcessedPage[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex);

    const viewport = page.getViewport({
      scale: 1.6,
    });

    const w = Math.floor(viewport.width);
    const h = Math.floor(viewport.height);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    })!;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    }).promise;

    const sourceImage = ctx.getImageData(0, 0, w, h);

    const { a, b } = buildComplementaryFrames(
      sourceImage,
      w,
      h,
    );

    out.push({
      a: toDataUrl(a),
      b: toDataUrl(b),
      w,
      h,
    });

    onProgress?.(pageIndex, pdf.numPages);
  }

  return out;
}

function buildComplementaryFrames(
  src: ImageData,
  w: number,
  h: number,
) {
  const canvasA = document.createElement("canvas");
  const canvasB = document.createElement("canvas");

  canvasA.width = w;
  canvasA.height = h;

  canvasB.width = w;
  canvasB.height = h;

  const ctxA = canvasA.getContext("2d")!;
  const ctxB = canvasB.getContext("2d")!;

  const imgA = ctxA.createImageData(w, h);
  const imgB = ctxB.createImageData(w, h);

  const srcData = src.data;
  const dataA = imgA.data;
  const dataB = imgB.data;

  // Temporal seed
  const timeSeed = Date.now() % 255;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const index = (y * w + x) * 4;

      // High-frequency checker pattern
      const checker =
        (
          (
            Math.floor(x / PATTERN_SCALE) +
            Math.floor(y / PATTERN_SCALE)
          ) % 2
        ) === 0
          ? 1
          : -1;

      // Camera-unfriendly RGB phase shifts
      const noiseR =
        checker * NOISE_AMPLITUDE;

      const noiseG =
        checker * (-NOISE_AMPLITUDE * 0.7);

      const noiseB =
        checker * (NOISE_AMPLITUDE * 0.85);

      // Simulated sensor flicker
      const flicker =
        Math.sin(
          (x * 0.35) +
          (y * 0.25) +
          (timeSeed * 0.08),
        ) * FLICKER_AMPLITUDE;

      // Frame A
      dataA[index] = clamp(
        srcData[index] +
          noiseR +
          flicker,
      );

      dataA[index + 1] = clamp(
        srcData[index + 1] +
          noiseG,
      );

      dataA[index + 2] = clamp(
        srcData[index + 2] +
          noiseB,
      );

      dataA[index + 3] = 255;

      // Frame B (inverse)
      dataB[index] = clamp(
        srcData[index] -
          noiseR -
          flicker,
      );

      dataB[index + 1] = clamp(
        srcData[index + 1] -
          noiseG,
      );

      dataB[index + 2] = clamp(
        srcData[index + 2] -
          noiseB,
      );

      dataB[index + 3] = 255;
    }
  }

  ctxA.putImageData(imgA, 0, 0);
  ctxB.putImageData(imgB, 0, 0);

  return {
    a: canvasA,
    b: canvasB,
  };
}

function clamp(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}

function toDataUrl(
  canvas: HTMLCanvasElement,
): string {
  // PNG preserves protection patterns
  return canvas.toDataURL("image/png");
}