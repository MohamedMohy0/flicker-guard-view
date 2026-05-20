import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ProcessedPage {
  a: Blob;
  b: Blob;
  w: number;
  h: number;
}

/* =========================================================
   Tunables
========================================================= */

// Higher = stronger camera interference
const NOISE_AMPLITUDE = 200;

// Size of grouped noise blocks
const NOISE_BLOCK = 4;

// Fine moiré frequency
const MOIRE_STRENGTH = 24;

// RGB channel separation
const RGB_SHIFT = 2;

// Temporal stripe intensity
const STRIPE_STRENGTH = 18;

// Dynamic overlay opacity
const OVERLAY_ALPHA = 0.045;

/* =========================================================
   Main PDF Processor
========================================================= */

export async function processPdf(
  file: File,
  onProgress?: (
    current: number,
    total: number,
  ) => void,
): Promise<ProcessedPage[]> {
  const buf = await file.arrayBuffer();

  const pdf =
    await pdfjs.getDocument({
      data: buf,
    }).promise;

  const out: ProcessedPage[] = [];

  for (
    let pageIndex = 1;
    pageIndex <= pdf.numPages;
    pageIndex++
  ) {
    const page =
      await pdf.getPage(pageIndex);

    const viewport =
      page.getViewport({
        scale: 1.45,
      });

    const w =
      Math.floor(viewport.width);

    const h =
      Math.floor(viewport.height);

    /* ======================================
       Base Render
    ====================================== */

    const canvas =
      document.createElement("canvas");

    canvas.width = w;
    canvas.height = h;

    const ctx =
      canvas.getContext("2d", {
        willReadFrequently: true,
      })!;

    ctx.fillStyle = "#ffffff";

    ctx.fillRect(0, 0, w, h);

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    }).promise;

    /* ======================================
       Source Image
    ====================================== */

    const src =
      ctx.getImageData(0, 0, w, h);

    /* ======================================
       Build Complementary Frames
    ====================================== */

    const {
      a,
      b,
    } = buildComplementaryFrames(
      src,
      w,
      h,
    );

    const [
      aBlob,
      bBlob,
    ] = await Promise.all([
      toBlob(a),
      toBlob(b),
    ]);

    out.push({
      a: aBlob,
      b: bBlob,
      w,
      h,
    });

    await new Promise((r) =>
      setTimeout(r, 0),
    );

    onProgress?.(
      pageIndex,
      pdf.numPages,
    );
  }

  return out;
}

/* =========================================================
   Complementary Frames
========================================================= */

function buildComplementaryFrames(
  src: ImageData,
  w: number,
  h: number,
) {
  const cvA =
    document.createElement("canvas");

  const cvB =
    document.createElement("canvas");

  cvA.width = w;
  cvA.height = h;

  cvB.width = w;
  cvB.height = h;

  const cxA =
    cvA.getContext("2d")!;

  const cxB =
    cvB.getContext("2d")!;

  const imgA =
    cxA.createImageData(w, h);

  const imgB =
    cxB.createImageData(w, h);

  const sd = src.data;

  const aD = imgA.data;
  const bD = imgB.data;

  /* ======================================
     Shared Noise Blocks
  ====================================== */

  const blocksW =
    Math.ceil(w / NOISE_BLOCK);

  const blocksH =
    Math.ceil(h / NOISE_BLOCK);

  const noiseR =
    new Int16Array(
      blocksW * blocksH,
    );

  const noiseG =
    new Int16Array(
      blocksW * blocksH,
    );

  const noiseB =
    new Int16Array(
      blocksW * blocksH,
    );

  for (
    let i = 0;
    i < noiseR.length;
    i++
  ) {
    noiseR[i] =
      (Math.random() * 2 - 1) *
      NOISE_AMPLITUDE;

    noiseG[i] =
      (Math.random() * 2 - 1) *
      NOISE_AMPLITUDE;

    noiseB[i] =
      (Math.random() * 2 - 1) *
      NOISE_AMPLITUDE;
  }

  /* ======================================
     Main Pixel Loop
  ====================================== */

  for (let y = 0; y < h; y++) {
    const by =
      Math.floor(
        y / NOISE_BLOCK,
      );

    /* --------------------------------------
       Moving stripe phase
    -------------------------------------- */

    const stripe =
      Math.sin(y * 0.12) *
      STRIPE_STRENGTH;

    for (let x = 0; x < w; x++) {
      const bx =
        Math.floor(
          x / NOISE_BLOCK,
        );

      const bi =
        by * blocksW + bx;

      const i =
        (y * w + x) * 4;

      /* ====================================
         Base Shared Noise
      ==================================== */

      const nR =
        noiseR[bi];

      const nG =
        noiseG[bi];

      const nB =
        noiseB[bi];

      /* ====================================
         Fine Moiré Pattern
      ==================================== */

      const moire =
        Math.sin(
          x * 0.23 +
            y * 0.11,
        ) *
          MOIRE_STRENGTH +
        Math.cos(
          x * 0.07 -
            y * 0.17,
        ) *
          (MOIRE_STRENGTH *
            0.5);

      /* ====================================
         Dynamic Overlay
      ==================================== */

      const overlay =
        (
          Math.sin(
            x * 0.02,
          ) +
          Math.cos(
            y * 0.03,
          )
        ) *
        255 *
        OVERLAY_ALPHA;

      /* ====================================
         RGB Channel Shift
      ==================================== */

      const rgbShift =
        ((x + y) % 2 === 0
          ? RGB_SHIFT
          : -RGB_SHIFT);

      /* ====================================
         Final Noise
      ==================================== */

      const finalR =
        nR +
        moire +
        stripe +
        overlay +
        rgbShift;

      const finalG =
        nG -
        moire * 0.6 +
        overlay;

      const finalB =
        nB +
        moire * 0.8 -
        stripe -
        rgbShift;

      /* ====================================
         Frame A
      ==================================== */

      aD[i] = clamp(
        sd[i] + finalR,
      );

      aD[i + 1] = clamp(
        sd[i + 1] + finalG,
      );

      aD[i + 2] = clamp(
        sd[i + 2] + finalB,
      );

      aD[i + 3] = 255;

      /* ====================================
         Frame B
      ==================================== */

      bD[i] = clamp(
        sd[i] - finalR,
      );

      bD[i + 1] = clamp(
        sd[i + 1] - finalG,
      );

      bD[i + 2] = clamp(
        sd[i + 2] - finalB,
      );

      bD[i + 3] = 255;
    }
  }

  /* ======================================
     Horizontal Scanline Layer
  ====================================== */

  applyScanlines(
    aD,
    w,
    h,
    0.03,
  );

  applyScanlines(
    bD,
    w,
    h,
    -0.03,
  );

  /* ======================================
     Write Frames
  ====================================== */

  cxA.putImageData(
    imgA,
    0,
    0,
  );

  cxB.putImageData(
    imgB,
    0,
    0,
  );

  return {
    a: cvA,
    b: cvB,
  };
}

/* =========================================================
   Scanlines
========================================================= */

function applyScanlines(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  strength: number,
) {
  for (let y = 0; y < h; y += 2) {
    const mul =
      1 + strength;

    for (let x = 0; x < w; x++) {
      const i =
        (y * w + x) * 4;

      data[i] *= mul;
      data[i + 1] *= mul;
      data[i + 2] *= mul;
    }
  }
}

/* =========================================================
   Clamp
========================================================= */

function clamp(v: number) {
  return v < 0
    ? 0
    : v > 255
      ? 255
      : v;
}

/* =========================================================
   Canvas To Blob
========================================================= */

function toBlob(
  canvas: HTMLCanvasElement,
): Promise<Blob> {
  return new Promise(
    (resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(
              new Error(
                "toBlob failed",
              ),
            );
          }
        },
        "image/png",
      );
    },
  );
}