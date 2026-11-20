import { IMAGE_UPLOAD_MAX_BYTES } from '@xeprime/types';

/**
 * Nén ảnh TRONG TRÌNH DUYỆT trước khi tải lên R2 — chỗ dùng chung cho MỌI ảnh người dùng chọn
 * (ảnh xe, ảnh gian hàng, ảnh giao nhận, giấy tờ, đính kèm chat…). Biên bản họp 19/11/2026: đổi
 * ảnh bìa mất ~1 phút vì ảnh điện thoại 4–8MB được đẩy nguyên bản rồi tải về lại nguyên bản.
 *
 * Phải chạy TRƯỚC presign: URL ký sẵn chứa `Content-Length` và `Content-Type` của tệp, nên tệp
 * đổi sau presign sẽ bị R2 từ chối.
 *
 * Nguyên tắc:
 *  - Thu cạnh dài về trần của hồ sơ (`IMAGE_COMPRESSION_PROFILES`) — màn hình không bao giờ vẽ ảnh
 *    xe to hơn ~1920px, nên phần điểm ảnh thừa chỉ tốn băng thông hai chiều.
 *  - Ảnh KHÔNG trong suốt → JPEG. Không dùng WebP cho mọi ảnh dù nhỏ hơn ~25%: ảnh xe còn được
 *    gửi sang MIC (open-api/upload-file) và bộ đọc OCR, hai nơi chưa chắc nhận WebP.
 *  - Ảnh CÓ nền trong suốt (logo, icon) → WebP nếu trình duyệt mã hoá được (giữ nền, nhỏ), không
 *    thì PNG đã thu nhỏ. Đổi sang JPEG sẽ làm nền trong suốt hoá đen/trắng.
 *  - Mã hoá lại = xoá EXIF (vị trí GPS, đời máy) và xoay đúng chiều theo EXIF trước khi vẽ.
 *  - Không bao giờ chặn việc tải lên: lỗi giải mã/mã hoá, trình duyệt thiếu API, hay kết quả
 *    không nhỏ hơn bản gốc ⇒ trả lại nguyên tệp gốc; kiểm MIME/dung lượng vẫn chạy sau đó.
 */

export interface ImageCompressionOptions {
  /** Cạnh dài tối đa sau khi nén (px). */
  readonly maxEdgePx: number;
  /** Chất lượng mã hoá JPEG/WebP lượt đầu (0–1). */
  readonly quality: number;
}

export const IMAGE_COMPRESSION_PROFILES = {
  /** Ảnh hiển thị: ảnh xe, logo/ảnh bìa gian hàng, ảnh đại diện, ảnh danh mục. */
  photo: { maxEdgePx: 1920, quality: 0.82 },
  /**
   * Ảnh làm BẰNG CHỨNG hoặc cần đọc chữ: ảnh giao nhận (vết xước), giấy tờ xe, giấy tờ khách,
   * chứng từ thu chi, hợp đồng chụp, đính kèm chat. Giữ nhiều chi tiết hơn.
   */
  detail: { maxEdgePx: 2560, quality: 0.86 },
  /** Banner trang chủ — cỡ chuẩn 1440px vẽ ở màn 2x là 2880px. */
  banner: { maxEdgePx: 2880, quality: 0.85 },
} as const satisfies Record<string, ImageCompressionOptions>;

export type ImageCompressionProfile = keyof typeof IMAGE_COMPRESSION_PROFILES;

/** Ảnh trình duyệt giải mã được. HEIC chỉ Safari giải được — nơi khác rơi về tệp gốc. */
const COMPRESSIBLE_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
/** Loại máy chủ nhận nguyên trạng — tệp đã đủ nhỏ thuộc loại này thì khỏi giải mã. */
const ACCEPTED_AS_IS: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Dưới ngưỡng này ảnh đã đủ nhẹ; giải mã + mã hoá lại chỉ tốn thời gian mà không lợi gì. */
export const SKIP_COMPRESSION_BELOW_BYTES = 200 * 1024;

/** Mỗi lượt quá trần dung lượng thì hạ chất lượng một nấc, không xuống dưới mức sàn. */
const QUALITY_STEP = 0.08;
const QUALITY_FLOOR = 0.55;

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Nén một ảnh theo hồ sơ. Tệp không phải ảnh (PDF…) hoặc không nén được trả về NGUYÊN TRẠNG,
 * nên nơi gọi có thể đưa mọi tệp qua đây trước presign.
 */
export async function compressImageForUpload(
  file: File,
  profile: ImageCompressionProfile = 'photo',
): Promise<File> {
  if (!COMPRESSIBLE_TYPES.has(file.type)) return file;
  if (file.size <= SKIP_COMPRESSION_BELOW_BYTES && ACCEPTED_AS_IS.has(file.type)) return file;
  if (!canCompressInBrowser()) return file;
  try {
    return await compress(file, IMAGE_COMPRESSION_PROFILES[profile]);
  } catch {
    return file;
  }
}

/** Cần `createImageBitmap` + canvas — jsdom và trình duyệt rất cũ không có thì bỏ qua nén. */
function canCompressInBrowser(): boolean {
  return typeof document !== 'undefined' && typeof createImageBitmap === 'function';
}

async function compress(file: File, options: ImageCompressionOptions): Promise<File> {
  const bitmap = await decodeBitmap(file);
  let canvas: HTMLCanvasElement | null = null;
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (longEdge === 0) return file;
    const scale = Math.min(1, options.maxEdgePx / longEdge);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    canvas = drawScaled(bitmap, width, height);
    const transparent = file.type !== 'image/jpeg' && hasTransparency(canvas);
    const type = transparent ? (supportsWebpEncoding() ? 'image/webp' : 'image/png') : 'image/jpeg';
    if (type === 'image/jpeg' && file.type !== 'image/jpeg') canvas = flattenOnWhite(canvas);

    const blob = await encodeWithinLimit(canvas, type, options.quality);
    if (!blob) return file;

    // Không thu nhỏ mà cũng không nhẹ hơn ⇒ bản gốc đã tối ưu; giữ nguyên để khỏi mất chất lượng.
    if (scale === 1 && blob.size >= file.size && ACCEPTED_AS_IS.has(file.type)) return file;
    return new File([blob], renameExtension(file.name, type), {
      type,
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
    if (canvas) releaseCanvas(canvas);
  }
}

async function decodeBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Vài trình duyệt cũ không nhận tuỳ chọn `imageOrientation` — chúng vốn xoay theo EXIF sẵn.
    return createImageBitmap(file);
  }
}

/**
 * Thu nhỏ theo từng nấc một nửa rồi mới về đúng cỡ: thu một phát từ 4000px xuống 1920px làm
 * nét chữ/viền xe răng cưa ở trình duyệt nội suy song tuyến (Safari, Firefox).
 */
function drawScaled(source: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  let current: CanvasImageSource = source;
  let currentWidth = source.width;
  let currentHeight = source.height;
  let previous: HTMLCanvasElement | null = null;

  while (currentWidth / 2 >= width && currentHeight / 2 >= height) {
    const step = createCanvas(Math.round(currentWidth / 2), Math.round(currentHeight / 2));
    paint(step, current);
    if (previous) releaseCanvas(previous);
    previous = step;
    current = step;
    currentWidth = step.width;
    currentHeight = step.height;
  }

  const target = createCanvas(width, height);
  paint(target, current);
  if (previous) releaseCanvas(previous);
  return target;
}

function paint(target: HTMLCanvasElement, source: CanvasImageSource): void {
  const context = target.getContext('2d');
  if (!context) throw new Error('canvas 2d unavailable');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, target.width, target.height);
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Trả bộ nhớ đệm điểm ảnh ngay — Safari iOS giới hạn tổng bộ nhớ canvas khá thấp. */
function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

/** Có điểm ảnh nào không đục hoàn toàn không — đọc trên bản thu nhỏ 64px cho nhanh. */
function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const probe = createCanvas(Math.min(64, canvas.width), Math.min(64, canvas.height));
  try {
    const context = probe.getContext('2d', { willReadFrequently: true });
    if (!context) return false;
    context.drawImage(canvas, 0, 0, probe.width, probe.height);
    const { data } = context.getImageData(0, 0, probe.width, probe.height);
    for (let index = 3; index < data.length; index += 4) {
      if (data[index]! < 255) return true;
    }
    return false;
  } finally {
    releaseCanvas(probe);
  }
}

/** Nền trắng dưới ảnh trước khi mã hoá JPEG — phần trong suốt không bị hoá đen. */
function flattenOnWhite(source: HTMLCanvasElement): HTMLCanvasElement {
  const flat = createCanvas(source.width, source.height);
  const context = flat.getContext('2d');
  if (!context) return source;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, flat.width, flat.height);
  context.drawImage(source, 0, 0);
  releaseCanvas(source);
  return flat;
}

/**
 * Safari cũ "mã hoá WebP" bằng cách lặng lẽ trả PNG — phải thử thật. Chỉ chạy cho ảnh trong
 * suốt, trên canvas 1×1, nên không cần nhớ kết quả.
 */
function supportsWebpEncoding(): boolean {
  try {
    return createCanvas(1, 1).toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

/** Mã hoá, quá trần dung lượng của máy chủ thì hạ chất lượng từng nấc (PNG không có nấc). */
async function encodeWithinLimit(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  let current = quality;
  for (;;) {
    const blob = await toBlob(canvas, type, current);
    if (!blob || blob.type !== type) return null;
    const lossy = type !== 'image/png';
    if (blob.size <= IMAGE_UPLOAD_MAX_BYTES || !lossy || current - QUALITY_STEP < QUALITY_FLOOR) {
      return blob;
    }
    current -= QUALITY_STEP;
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** `IMG_1234.HEIC` → `IMG_1234.jpg` — máy chủ đặt tên khoá theo `contentType`, tên chỉ để đọc. */
export function renameExtension(name: string, type: string): string {
  const extension = EXTENSION_BY_TYPE[type];
  if (!extension) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name || 'image';
  return `${base}.${extension}`;
}
