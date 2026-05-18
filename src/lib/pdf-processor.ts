import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ProcessedPage {
  a: string;
  b: string;
  w: number;
  h: number;
}

// ✅ خفّضنا السعة لأن الضوضاء ستكون في نطاق عالي التردد — غير مرئية للعين
// لكن تُربك الكاميرا والضغط الرقمي (JPEG/H.264 compression artifacts)
const NOISE_AMPLITUDE = 38;

// ✅ بلوك صغير جداً (pixel-level checkerboard) = أعلى تردد ممكن = أقل إيذاء للعين
// الكاميرا لا تستطيع تجاهل هذا النمط لأنه يخلق تداخل مع بكسلات الاستشعار
const NOISE_BLOCK = 1;

// ✅ نمط "Bayer-like" محدد بدل العشوائي الكامل
// يخلق تدخلاً مع مصفوفة Bayer في حساس الكاميرا (مشكلة Moiré)
const CHECKERBOARD_PHASE = true;

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

  // ✅ طريقة جديدة: ضوضاء "Structured High-Frequency"
  // بدل الضوضاء العشوائية الكاملة، نستخدم نمطاً شبه حتمياً
  // يتغير كل بكسل (checkerboard) مع عشوائية صغيرة جداً فوقه
  
  // طبقة 1: نمط Checkerboard ثابت (أساس عالي التردد)
  // طبقة 2: ضوضاء عشوائية بسعة صغيرة جداً فوق الـ checkerboard
  const RANDOM_ON_TOP = 12; // سعة العشوائي الإضافي — صغير جداً
  
  // Pre-generate per-pixel random perturbation (صغير جداً)
  const perturbR = new Int8Array(w * h);
  const perturbG = new Int8Array(w * h);
  const perturbB = new Int8Array(w * h);
  for (let i = 0; i < perturbR.length; i++) {
    perturbR[i] = Math.round((Math.random() * 2 - 1) * RANDOM_ON_TOP);
    perturbG[i] = Math.round((Math.random() * 2 - 1) * RANDOM_ON_TOP);
    perturbB[i] = Math.round((Math.random() * 2 - 1) * RANDOM_ON_TOP);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pi = y * w + x;
      const i = pi * 4;

      // ✅ Checkerboard: يتقلّب بين +AMPLITUDE و -AMPLITUDE كل بكسل
      // هذا هو أعلى تردد مكاني ممكن = غير مرئي للعين تقريباً
      const sign = (x + y) % 2 === 0 ? 1 : -1;

      const nR = sign * NOISE_AMPLITUDE + perturbR[pi];
      const nG = sign * NOISE_AMPLITUDE + perturbG[pi];
      const nB = sign * NOISE_AMPLITUDE + perturbB[pi];

      // Frame A: pixel + noise
      aD[i]     = clamp(sd[i]     + nR);
      aD[i + 1] = clamp(sd[i + 1] + nG);
      aD[i + 2] = clamp(sd[i + 2] + nB);
      aD[i + 3] = 255;

      // Frame B: pixel - noise (complementary — عند الجمع يُلغي الضوضاء تماماً)
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
  return c.toDataURL("image/png");
}