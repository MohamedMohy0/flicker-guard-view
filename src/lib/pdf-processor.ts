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

const NOISE_AMPLITUDE = 180;
const NOISE_BLOCK = 3;

const MOIRE_STRENGTH = 28;
const RGB_SHIFT = 3;

const STRIPE_STRENGTH = 24;
const OVERLAY_ALPHA = 0.05;

const PIXEL_JITTER = 1.8;
const EDGE_WARP = 9;

/* =========================================================
   Main Processor
========================================================= */

export async function processPdf(
  file: File,
  onProgress?: (
    current: number,
    total: number,
  ) => void,
): Promise<ProcessedPage[]> {
  const buf =
    await file.arrayBuffer();

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

    const src =
      ctx.getImageData(
        0,
        0,
        w,
        h,
      );

    /* ======================================
       Build Frames
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
    Math.ceil(
      w / NOISE_BLOCK,
    );

  const blocksH =
    Math.ceil(
      h / NOISE_BLOCK,
    );

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
     Main Loop
  ====================================== */

  for (let y = 0; y < h; y++) {
    const by =
      Math.floor(
        y / NOISE_BLOCK,
      );

    const stripe =
      Math.sin(y * 0.11) *
      STRIPE_STRENGTH;

    for (let x = 0; x < w; x++) {
      const bx =
        Math.floor(
          x / NOISE_BLOCK,
        );

      const bi =
        by * blocksW + bx;

      /* ====================================
         Pixel Jitter
      ==================================== */

      const jx =
        Math.floor(
          x +
            Math.sin(
              y * 0.2,
            ) *
              PIXEL_JITTER,
        );

      const jy =
        Math.floor(
          y +
            Math.cos(
              x * 0.15,
            ) *
              PIXEL_JITTER,
        );

      const sx =
        Math.max(
          0,
          Math.min(
            w - 1,
            jx,
          ),
        );

      const sy =
        Math.max(
          0,
          Math.min(
            h - 1,
            jy,
          ),
        );

      const i =
        (sy * w + sx) * 4;

      /* ====================================
         Base Noise
      ==================================== */

      const nR =
        noiseR[bi];

      const nG =
        noiseG[bi];

      const nB =
        noiseB[bi];

      /* ====================================
         Fine Moiré
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
         RGB Shift
      ==================================== */

      const rgbShift =
        ((x + y) % 2 === 0
          ? RGB_SHIFT
          : -RGB_SHIFT);

      /* ====================================
         Edge Distortion
      ==================================== */

      const edgeWarp =
        Math.sin(
          y * 0.9 +
            x * 0.12,
        ) * EDGE_WARP;

      const warp =
        Math.cos(
          x * 0.15 -
            y * 0.07,
        ) *
        (EDGE_WARP * 0.7);

      /* ====================================
         Final Channels
      ==================================== */

      const finalR =
        nR +
        moire +
        stripe +
        overlay +
        rgbShift +
        edgeWarp;

      const finalG =
        nG -
        moire * 0.6 +
        overlay +
        warp;

      const finalB =
        nB +
        moire * 0.8 -
        stripe -
        rgbShift -
        edgeWarp;

      /* ====================================
         Frame A/B Phase Distortion
      ==================================== */

      const phaseA =
        Math.sin(
          (x + y) * 0.08,
        ) * 12;

      const phaseB =
        Math.cos(
          (x - y) * 0.08,
        ) * 12;

      /* ====================================
         Frame A
      ==================================== */

      aD[i] = clamp(
        sd[i] +
          finalR +
          phaseA,
      );

      aD[i + 1] = clamp(
        sd[i + 1] +
          finalG +
          phaseA,
      );

      aD[i + 2] = clamp(
        sd[i + 2] +
          finalB +
          phaseA,
      );

      aD[i + 3] = 255;

      /* ====================================
         Frame B
      ==================================== */

      bD[i] = clamp(
        sd[i] -
          finalR +
          phaseB,
      );

      bD[i + 1] = clamp(
        sd[i + 1] -
          finalG +
          phaseB,
      );

      bD[i + 2] = clamp(
        sd[i + 2] -
          finalB +
          phaseB,
      );

      bD[i + 3] = 255;
    }
  }

  /* ======================================
     Scanlines
  ====================================== */

  applyScanlines(
    aD,
    w,
    h,
    0.035,
  );

  applyScanlines(
    bD,
    w,
    h,
    -0.035,
  );

  /* ======================================
     Write
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
  for (
    let y = 0;
    y < h;
    y += 2
  ) {
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