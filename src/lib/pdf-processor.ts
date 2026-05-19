import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ProcessedPage {
  a: Blob;
  b: Blob;
  w: number;
  h: number;
}

// ==============================
// Protection Settings
// ==============================

// Main chroma noise strength
const NOISE_AMPLITUDE = 200;

// Smaller blocks = harder OCR
const NOISE_BLOCK_MIN = 3;
const NOISE_BLOCK_MAX = 4;

// Edge amplification
const EDGE_BOOST = 1.8;
const EDGE_THRESHOLD = 40;

// Moiré overlay
const MOIRE_ALPHA = 0.045;
const MOIRE_STEP = 2;

// Tiny subpixel distortion
const SUBPIXEL_SHIFT = 0.6;

// ==============================

export async function processPdf(
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<ProcessedPage[]> {
  const buf = await file.arrayBuffer();

  const pdf = await pdfjs.getDocument({
    data: buf,
  }).promise;

  const out: ProcessedPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);

    const viewport = page.getViewport({
      scale: 1.4,
    });

    const w = Math.floor(viewport.width);
    const h = Math.floor(viewport.height);

    // ==========================
    // Render original page
    // ==========================

    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = w;
    srcCanvas.height = h;

    const srcCtx = srcCanvas.getContext("2d", {
      willReadFrequently: true,
    })!;

    srcCtx.fillStyle = "#ffffff";
    srcCtx.fillRect(0, 0, w, h);

    await page.render({
      canvas: srcCanvas,
      canvasContext: srcCtx,
      viewport,
    }).promise;

    // ==========================
    // Subpixel shift
    // ==========================

    const shifted = document.createElement("canvas");
    shifted.width = w;
    shifted.height = h;

    const sctx = shifted.getContext("2d", {
      willReadFrequently: true,
    })!;

    const ox = (Math.random() - 0.5) * SUBPIXEL_SHIFT;
    const oy = (Math.random() - 0.5) * SUBPIXEL_SHIFT;

    sctx.fillStyle = "#ffffff";
    sctx.fillRect(0, 0, w, h);

    sctx.drawImage(srcCanvas, ox, oy);

    // ==========================
    // Add moiré overlay
    // ==========================

    addMoirePattern(sctx, w, h);

    const img = sctx.getImageData(0, 0, w, h);

    // ==========================
    // Build protected frames
    // ==========================

    const { a, b } = buildComplementaryFrames(
      img,
      w,
      h,
    );

    const [aBlob, bBlob] = await Promise.all([
      toBlob(a),
      toBlob(b),
    ]);

    out.push({
      a: aBlob,
      b: bBlob,
      w,
      h,
    });

    await new Promise((r) => setTimeout(r, 0));

    onProgress?.(i, pdf.numPages);
  }

  return out;
}

// ======================================
// Main frame generation
// ======================================

function buildComplementaryFrames(
  src: ImageData,
  w: number,
  h: number,
) {
  const cvA = document.createElement("canvas");
  const cvB = document.createElement("canvas");

  cvA.width = w;
  cvA.height = h;

  cvB.width = w;
  cvB.height = h;

  const cxA = cvA.getContext("2d")!;
  const cxB = cvB.getContext("2d")!;

  const imgA = cxA.createImageData(w, h);
  const imgB = cxB.createImageData(w, h);

  const sd = src.data;

  const aD = imgA.data;
  const bD = imgB.data;

  // ==========================
  // Dynamic block size
  // ==========================

  const blockSize =
    Math.random() > 0.5
      ? NOISE_BLOCK_MIN
      : NOISE_BLOCK_MAX;

  const blocksW = Math.ceil(w / blockSize);
  const blocksH = Math.ceil(h / blockSize);

  // ==========================
  // Pre-generated chroma noise
  // ==========================

  const noiseR = new Int16Array(blocksW * blocksH);
  const noiseG = new Int16Array(blocksW * blocksH);
  const noiseB = new Int16Array(blocksW * blocksH);

  for (let i = 0; i < noiseR.length; i++) {
    noiseR[i] =
      (Math.random() * 2 - 1) *
      NOISE_AMPLITUDE;

    noiseG[i] =
      (Math.random() * 2 - 1) *
      NOISE_AMPLITUDE *
      0.8;

    noiseB[i] =
      (Math.random() * 2 - 1) *
      NOISE_AMPLITUDE *
      1.2;
  }

  // ==========================
  // Apply protection
  // ==========================

  for (let y = 0; y < h; y++) {
    const by = Math.floor(y / blockSize);

    for (let x = 0; x < w; x++) {
      const bx = Math.floor(x / blockSize);

      const bi = by * blocksW + bx;

      const i = (y * w + x) * 4;

      // ======================
      // Edge detection
      // ======================

      let edge = 0;

      if (x < w - 1) {
        edge += Math.abs(sd[i] - sd[i + 4]);
      }

      if (y < h - 1) {
        edge += Math.abs(
          sd[i] -
            sd[i + w * 4],
        );
      }

      let edgeMul = 1;

      if (edge > EDGE_THRESHOLD) {
        edgeMul = EDGE_BOOST;
      }

      // ======================
      // Chroma noise
      // ======================

      const nR =
        noiseR[bi] * edgeMul;

      const nG =
        noiseG[bi] * edgeMul;

      const nB =
        noiseB[bi] * edgeMul;

      // Frame A

      aD[i] = clamp(
        sd[i] + nR,
      );

      aD[i + 1] = clamp(
        sd[i + 1] - nG,
      );

      aD[i + 2] = clamp(
        sd[i + 2] + nB,
      );

      aD[i + 3] = 255;

      // Frame B

      bD[i] = clamp(
        sd[i] - nR,
      );

      bD[i + 1] = clamp(
        sd[i + 1] + nG,
      );

      bD[i + 2] = clamp(
        sd[i + 2] - nB,
      );

      bD[i + 3] = 255;
    }
  }

  cxA.putImageData(imgA, 0, 0);
  cxB.putImageData(imgB, 0, 0);

  return {
    a: cvA,
    b: cvB,
  };
}

// ======================================
// Moiré overlay
// ======================================

function addMoirePattern(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  ctx.save();

  ctx.globalAlpha = MOIRE_ALPHA;

  // Horizontal lines
  for (let y = 0; y < h; y += MOIRE_STEP) {
    ctx.fillStyle =
      y % 4 === 0
        ? "#000"
        : "#fff";

    ctx.fillRect(0, y, w, 1);
  }

  // Diagonal interference
  for (let x = -h; x < w; x += 6) {
    ctx.beginPath();

    ctx.moveTo(x, 0);
    ctx.lineTo(x + h, h);

    ctx.lineWidth = 0.5;

    ctx.strokeStyle =
      Math.random() > 0.5
        ? "#000"
        : "#fff";

    ctx.stroke();
  }

  ctx.restore();
}

// ======================================

function clamp(v: number): number {
  return v < 0
    ? 0
    : v > 255
      ? 255
      : v;
}

// ======================================

function toBlob(
  c: HTMLCanvasElement,
): Promise<Blob> {
  return new Promise(
    (resolve, reject) =>
      c.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(
                new Error(
                  "toBlob failed",
                ),
              ),
        "image/png",
      ),
  );
}