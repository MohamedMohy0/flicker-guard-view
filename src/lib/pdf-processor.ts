import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ProcessedPage {
  a: string;
  b: string;
  w: number;
  h: number;
}

// إعدادات الحماية - قيم منخفضة جداً للحفاظ على راحة العين
const ANTI_CAMERA_CONFIG = {
  SUBTLE_NOISE: 3,        // تشويش خفي (0-10) - العين لا تراه
  BRIGHTNESS_SHIFT: 6,    // تغيير السطوع بين الإطارات (0-20)
  PATTERN_DENSITY: 2,     // كثافة النمط الشبكي (1-4)
  ENHANCE_SHARPNESS: 2,   // تحسين وضوح الإطار الطبيعي
};

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
  const cvA = document.createElement("canvas"); 
  cvA.width = w; 
  cvA.height = h;
  const cvB = document.createElement("canvas"); 
  cvB.width = w; 
  cvB.height = h;
  const cxA = cvA.getContext("2d")!;
  const cxB = cvB.getContext("2d")!;
  const imgA = cxA.createImageData(w, h);
  const imgB = cxB.createImageData(w, h);
  const sd = src.data;
  const aD = imgA.data;
  const bD = imgB.data;

  // توليد الإطارات
  for (let i = 0; i < sd.length; i += 4) {
    // الإطار A: صورة طبيعية محسنة للرؤية البشرية
    aD[i] = Math.min(255, sd[i] + ANTI_CAMERA_CONFIG.ENHANCE_SHARPNESS);
    aD[i+1] = Math.min(255, sd[i+1] + ANTI_CAMERA_CONFIG.ENHANCE_SHARPNESS);
    aD[i+2] = Math.min(255, sd[i+2] + ANTI_CAMERA_CONFIG.ENHANCE_SHARPNESS);
    aD[i+3] = 255;

    // الإطار B: معكوس جزئياً + تشويش خفي - هذا ماستراه الكاميرا
    const randomNoiseR = (Math.random() - 0.5) * ANTI_CAMERA_CONFIG.SUBTLE_NOISE;
    const randomNoiseG = (Math.random() - 0.5) * ANTI_CAMERA_CONFIG.SUBTLE_NOISE;
    const randomNoiseB = (Math.random() - 0.5) * ANTI_CAMERA_CONFIG.SUBTLE_NOISE;
    
    bD[i] = Math.max(0, Math.min(255, 
      (255 - sd[i]) + randomNoiseR - ANTI_CAMERA_CONFIG.BRIGHTNESS_SHIFT
    ));
    bD[i+1] = Math.max(0, Math.min(255, 
      (255 - sd[i+1]) + randomNoiseG - ANTI_CAMERA_CONFIG.BRIGHTNESS_SHIFT
    ));
    bD[i+2] = Math.max(0, Math.min(255, 
      (255 - sd[i+2]) + randomNoiseB - ANTI_CAMERA_CONFIG.BRIGHTNESS_SHIFT
    ));
    bD[i+3] = 255;
  }

  cxA.putImageData(imgA, 0, 0);
  cxB.putImageData(imgB, 0, 0);
  
  // تطبيق تقنيات إضافية ضد الكاميرا
  applyAntiCameraTechniques(cvB);
  
  return { a: cvA, b: cvB };
}

function applyAntiCameraTechniques(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  
  // إضافة نمط شبكي دقيق جداً (غير مرئي للعين البشرية)
  // هذا النمط يتداخل مع مستشعرات الكاميرا الرقمية
  const step = ANTI_CAMERA_CONFIG.PATTERN_DENSITY;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const idx = (y * w + x) * 4;
      // تقليل البكسلات في نمط منتظم
      data[idx] = Math.max(0, data[idx] - 2);
      data[idx + 1] = Math.max(0, data[idx + 1] - 2);
      data[idx + 2] = Math.max(0, data[idx + 2] - 2);
    }
  }
  
  // إضافة تموج عالي التردد (High-frequency ripple)
  // هذا يسبب تداخل (Aliasing) في الكاميرات الرقمية
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const ripple = Math.sin(x * 0.5 + y * 0.3) * 2;
      data[idx] = Math.max(0, Math.min(255, data[idx] + ripple));
      data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + ripple));
      data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + ripple));
    }
  }
  
  ctx.putImageData(imgData, 0, 0);
}

function toDataUrl(c: HTMLCanvasElement): string {
  // استخدام PNG للحفاظ على الدقة
  return c.toDataURL("image/png");
}