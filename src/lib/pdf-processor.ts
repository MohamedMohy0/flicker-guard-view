import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ProcessedPage {
  layers: string[];
  w: number;
  h: number;
}

const PDF_SCALE = 1.8;

// كلما زادت القيمة زاد التشويش على الكاميرا
// لكن هذه القيم ما زالت مريحة للعين
const EDGE_NOISE = 90;
const INNER_NOISE = 35;

// نسبة البيكسلات التي يطبق عليها التشويش
const NOISE_PROBABILITY = 0.22;

// ================================
// Main Processor
// ================================
export async function processPdf(
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<ProcessedPage[]> {

  const buffer = await file.arrayBuffer();

  const pdf = await pdfjs.getDocument({
    data: buffer
  }).promise;

  const pages: ProcessedPage[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {

    const page = await pdf.getPage(pageIndex);

    const viewport = page.getViewport({
      scale: PDF_SCALE
    });

    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", {
      willReadFrequently: true
    })!;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport
    }).promise;

    const sourceImage = ctx.getImageData(
      0,
      0,
      width,
      height
    );

    const protectedLayers = buildProtectedFrames(
      sourceImage,
      width,
      height
    );

    pages.push({
      layers: protectedLayers.map(toDataUrl),
      w: width,
      h: height
    });

    onProgress?.(
      pageIndex,
      pdf.numPages
    );
  }

  return pages;
}

// ================================
// Layer Generator
// ================================
function buildProtectedFrames(
  source: ImageData,
  width: number,
  height: number
): HTMLCanvasElement[] {

  const LAYER_COUNT = 4;

  const canvases = Array.from(
    { length: LAYER_COUNT },
    () => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      return c;
    }
  );

  const contexts = canvases.map(
    canvas => canvas.getContext("2d")!
  );

  const imageBuffers = contexts.map(
    context => context.createImageData(
      width,
      height
    )
  );

  const sourceData = source.data;

  for (let y = 0; y < height; y++) {

    // توزيع الصفوف على 4 طبقات
    const targetLayer = y % 4;

    for (let x = 0; x < width; x++) {

      const pixelIndex =
        (y * width + x) * 4;

      const r = sourceData[pixelIndex];
      const g = sourceData[pixelIndex + 1];
      const b = sourceData[pixelIndex + 2];

      const brightness =
        (r + g + b) / 3;

      const isBackground =
        brightness > 245;

      const isText =
        brightness < 210;

      let finalR = r;
      let finalG = g;
      let finalB = b;

      // تشويش فقط على النص
      if (!isBackground && isText) {

        if (Math.random() < NOISE_PROBABILITY) {

          const edge = isEdge(
            sourceData,
            x,
            y,
            width,
            height
          );

          const amplitude =
            edge
              ? EDGE_NOISE
              : INNER_NOISE;

          // Pattern survives camera compression
          const phase =
            ((x >> 2) + (y >> 2)) % 4;

          finalR = clamp(
            r + (
              phase % 2
                ? amplitude
                : -amplitude
            )
          );

          finalG = clamp(
            g + (
              phase % 3
                ? amplitude
                : -amplitude
            )
          );

          finalB = clamp(
            b + (
              phase % 4
                ? amplitude
                : -amplitude
            )
          );
        }
      }

      // توزيع البيكسلات على الطبقات
      for (
        let layer = 0;
        layer < LAYER_COUNT;
        layer++
      ) {

        const layerData =
          imageBuffers[layer].data;

        if (layer === targetLayer) {

          layerData[pixelIndex] =
            finalR;

          layerData[pixelIndex + 1] =
            finalG;

          layerData[pixelIndex + 2] =
            finalB;

          layerData[pixelIndex + 3] =
            255;

        } else {

          // خلفية بيضاء للطبقات الأخرى
          layerData[pixelIndex] =
            255;

          layerData[pixelIndex + 1] =
            255;

          layerData[pixelIndex + 2] =
            255;

          layerData[pixelIndex + 3] =
            255;
        }
      }
    }
  }

  for (
    let i = 0;
    i < LAYER_COUNT;
    i++
  ) {

    contexts[i].putImageData(
      imageBuffers[i],
      0,
      0
    );
  }

  return canvases;
}

// ================================
// Edge Detection
// ================================
function isEdge(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
  height: number
): boolean {

  if (
    x <= 0 ||
    y <= 0 ||
    x >= width - 1 ||
    y >= height - 1
  ) {
    return false;
  }

  const center =
    pixelBrightness(
      data,
      x,
      y,
      width
    );

  const left =
    pixelBrightness(
      data,
      x - 1,
      y,
      width
    );

  const right =
    pixelBrightness(
      data,
      x + 1,
      y,
      width
    );

  const top =
    pixelBrightness(
      data,
      x,
      y - 1,
      width
    );

  const bottom =
    pixelBrightness(
      data,
      x,
      y + 1,
      width
    );

  const difference =
    Math.abs(center - left) +
    Math.abs(center - right) +
    Math.abs(center - top) +
    Math.abs(center - bottom);

  return difference > 120;
}

// ================================
// Brightness
// ================================
function pixelBrightness(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  width: number
): number {

  const index =
    (y * width + x) * 4;

  return (
    data[index] +
    data[index + 1] +
    data[index + 2]
  ) / 3;
}

// ================================
// Utils
// ================================
function clamp(
  value: number
): number {

  if (value < 0) {
    return 0;
  }

  if (value > 255) {
    return 255;
  }

  return value;
}

function toDataUrl(
  canvas: HTMLCanvasElement
): string {

  return canvas.toDataURL(
    "image/png"
  );
}