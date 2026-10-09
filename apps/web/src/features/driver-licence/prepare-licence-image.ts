import { DRIVER_LICENCE_IMAGE_MAX_EDGE_PX, DRIVER_LICENCE_UPLOAD_MAX_BYTES } from '@xeprime/types';

/**
 * Chuẩn bị ảnh bằng lái trước khi tải lên — chạy hoàn toàn trong trình duyệt.
 *
 *  - Thu cạnh dài về `DRIVER_LICENCE_IMAGE_MAX_EDGE_PX`: ảnh điện thoại 12MP nặng 4–8MB, mà bộ
 *    đọc chỉ cần ~2000px để đọc rõ từng chữ. Tải 600KB thay vì 6MB là khác biệt giữa "xong ngay"
 *    và "đứng hình" trên 4G.
 *  - Mã hoá lại thành JPEG: xoá luôn EXIF (vị trí GPS, đời máy) — không có lý do gì để thông tin
 *    đó theo ảnh bằng lái lên máy chủ — và đưa HEIC/ảnh lạ về định dạng máy chủ nhận.
 *  - Xoay đúng chiều theo EXIF trước khi vẽ, nên ảnh chụp dọc không bị nằm ngang.
 */

/** Cạnh dài tối thiểu — nhỏ hơn thế chữ trên bằng không còn đọc được, khỏi tải lên làm gì. */
export const MIN_LICENCE_IMAGE_EDGE_PX = 640;

const QUALITY_STEPS = [0.88, 0.8, 0.7, 0.6] as const;

export type PrepareImageRejection = 'unsupported' | 'tooSmall' | 'tooLarge';

export class PrepareImageError extends Error {
  constructor(readonly reason: PrepareImageRejection) {
    super(reason);
    this.name = 'PrepareImageError';
  }
}

export async function prepareLicenceImage(file: File): Promise<File> {
  const source = await decode(file);
  try {
    const longEdge = Math.max(source.width, source.height);
    if (longEdge < MIN_LICENCE_IMAGE_EDGE_PX) throw new PrepareImageError('tooSmall');

    const scale = Math.min(1, DRIVER_LICENCE_IMAGE_MAX_EDGE_PX / longEdge);
    const width = Math.round(source.width * scale);
    const height = Math.round(source.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new PrepareImageError('unsupported');
    // Nền trắng: ảnh PNG trong suốt mã hoá thành JPEG sẽ ra nền đen.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(source.image, 0, 0, width, height);

    for (const quality of QUALITY_STEPS) {
      const blob = await toBlob(canvas, quality);
      if (blob && blob.size <= DRIVER_LICENCE_UPLOAD_MAX_BYTES) {
        return new File([blob], 'driver-licence.jpg', { type: 'image/jpeg' });
      }
    }
    throw new PrepareImageError('tooLarge');
  } finally {
    source.release();
  }
}

interface DecodedImage {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Rơi xuống đường <img>: vài trình duyệt cũ không nhận tuỳ chọn `imageOrientation`.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new PrepareImageError('unsupported'));
      element.src = url;
    });
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error instanceof PrepareImageError ? error : new PrepareImageError('unsupported');
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}
