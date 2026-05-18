// Client-side PDF processing: render each page and split into 2 interlaced layers
// to defeat camera/screenshot capture via temporal multiplexing.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ProcessedPage {
  a: string; // data url
  b: string;
  w: number;
  h: number;
}

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
    const layerA = createLayer(img, w, h, 0);
    const layerB = createLayer(img, w, h, 1);

    out.push({
      a: canvasToDataUrl(layerA),
      b: canvasToDataUrl(layerB),
      w, h,
    });
    onProgress?.(i, pdf.numPages);
  }
  return out;
}

function createLayer(src: ImageData, w: number, h: number, parity: 0 | 1): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext("2d")!;
  // Mid-gray background — when alternated at 60Hz the eye averages it out toward the real image.
  cx.fillStyle = "rgb(128,128,128)";
  cx.fillRect(0, 0, w, h);

  const out = cx.getImageData(0, 0, w, h);
  const sd = src.data;
  const od = out.data;
  for (let y = 0; y < h; y++) {
    if (y % 2 !== parity) continue; // keep only this layer's rows
    const rowStart = y * w * 4;
    for (let x = 0; x < w * 4; x++) {
      // Boost contrast: pull values away from midgray toward true value, doubled
      const v = sd[rowStart + x];
      if ((x & 3) === 3) { od[rowStart + x] = 255; continue; }
      od[rowStart + x] = Math.max(0, Math.min(255, 2 * v - 128));
    }
  }
  cx.putImageData(out, 0, 0);

  // Thin random noise lines — opposite direction per layer
  cx.globalAlpha = 0.25;
  cx.strokeStyle = parity === 0 ? "rgb(40,40,40)" : "rgb(220,220,220)";
  cx.lineWidth = 1;
  for (let k = 0; k < 8; k++) {
    cx.beginPath();
    const y0 = Math.random() * h;
    cx.moveTo(0, y0);
    cx.lineTo(w, y0 + (Math.random() - 0.5) * 20);
    cx.stroke();
  }
  cx.globalAlpha = 1;
  return cv;
}

function canvasToDataUrl(c: HTMLCanvasElement): string {
  return c.toDataURL("image/jpeg", 0.7);
}
