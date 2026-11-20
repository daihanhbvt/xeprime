import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  compressImageForUpload,
  IMAGE_COMPRESSION_PROFILES,
  renameExtension,
  SKIP_COMPRESSION_BELOW_BYTES,
} from './image-compression';

/**
 * jsdom không có canvas/`createImageBitmap` — dựng một canvas giả đủ để đi hết đường ống: ghi
 * lại cỡ canvas cuối cùng, trả blob đúng loại được xin, và cho chọn ảnh có/không trong suốt.
 */

interface FakeCanvasState {
  /** Alpha của mọi điểm ảnh `getImageData` trả về — 255 là đục hoàn toàn. */
  alpha: number;
  /** Dung lượng blob `toBlob` sinh ra, theo chất lượng được xin. */
  blobSize: (type: string, quality: number) => number;
  /** Loại blob trả về — mặc định đúng loại được xin; Safari cũ trả PNG khi xin WebP. */
  blobType?: (type: string) => string;
  webp: boolean;
  encoded: { width: number; height: number; type: string; quality: number }[];
}

const state: FakeCanvasState = {
  alpha: 255,
  blobSize: () => 300 * 1024,
  webp: true,
  encoded: [],
};

function fakeContext() {
  return {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(state.alpha),
    }),
  };
}

function bigFile(name: string, type: string, size = 4 * 1024 * 1024): File {
  return new File([new Uint8Array(size)], name, { type, lastModified: 1 });
}

beforeEach(() => {
  state.alpha = 255;
  state.blobSize = () => 300 * 1024;
  state.blobType = undefined;
  state.webp = true;
  state.encoded = [];

  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => fakeContext() as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation((type?: string) =>
    type === 'image/webp' && state.webp ? 'data:image/webp;base64,' : 'data:image/png;base64,',
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type = 'image/png',
    quality = 0.92,
  ) {
    state.encoded.push({ width: this.width, height: this.height, type, quality });
    const blobType = state.blobType?.(type) ?? type;
    callback(new Blob([new Uint8Array(state.blobSize(type, quality))], { type: blobType }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('compressImageForUpload', () => {
  it('ảnh chụp to: thu cạnh dài về 1920px, ra JPEG, đổi đuôi', async () => {
    const result = await compressImageForUpload(bigFile('IMG_1.png', 'image/png'));

    expect(result.type).toBe('image/jpeg');
    expect(result.name).toBe('IMG_1.jpg');
    expect(result.size).toBe(300 * 1024);
    expect(state.encoded.at(-1)).toMatchObject({
      width: 1920,
      height: 1440,
      quality: IMAGE_COMPRESSION_PROFILES.photo.quality,
    });
  });

  it('hồ sơ detail giữ tới 2560px cho ảnh bằng chứng/giấy tờ', async () => {
    await compressImageForUpload(bigFile('a.jpg', 'image/jpeg'), 'detail');
    expect(state.encoded.at(-1)).toMatchObject({ width: 2560, height: 1920 });
  });

  it('logo có nền trong suốt: ra WebP để giữ nền', async () => {
    state.alpha = 0;
    const result = await compressImageForUpload(bigFile('logo.png', 'image/png'));
    expect(result.type).toBe('image/webp');
    expect(result.name).toBe('logo.webp');
  });

  it('nền trong suốt mà trình duyệt không mã hoá được WebP: giữ PNG', async () => {
    state.alpha = 0;
    state.webp = false;
    const result = await compressImageForUpload(bigFile('logo.png', 'image/png'));
    expect(result.type).toBe('image/png');
  });

  it('vượt trần dung lượng thì hạ chất lượng từng nấc', async () => {
    state.blobSize = (_type, quality) => (quality > 0.7 ? 11 * 1024 * 1024 : 900 * 1024);
    const result = await compressImageForUpload(bigFile('a.jpg', 'image/jpeg'));
    expect(result.size).toBe(900 * 1024);
    expect(state.encoded.map((e) => e.quality).length).toBeGreaterThan(1);
  });

  it('không thu nhỏ mà bản nén không nhẹ hơn: giữ nguyên bản gốc', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1200, height: 800, close: vi.fn() })),
    );
    const original = bigFile('small.jpg', 'image/jpeg', 400 * 1024);
    state.blobSize = () => 500 * 1024;
    expect(await compressImageForUpload(original)).toBe(original);
  });

  it('trình duyệt trả sai loại blob (Safari giả WebP): dùng bản gốc', async () => {
    state.blobType = () => 'image/png';
    const original = bigFile('a.jpg', 'image/jpeg');
    expect(await compressImageForUpload(original)).toBe(original);
  });

  it('giải mã hỏng: không chặn tải lên, trả bản gốc', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('decode');
      }),
    );
    const original = bigFile('broken.jpg', 'image/jpeg');
    expect(await compressImageForUpload(original)).toBe(original);
  });

  it('PDF và ảnh đã nhẹ đi qua nguyên trạng, không giải mã', async () => {
    const pdf = bigFile('hd.pdf', 'application/pdf');
    const light = bigFile('a.jpg', 'image/jpeg', SKIP_COMPRESSION_BELOW_BYTES);
    expect(await compressImageForUpload(pdf)).toBe(pdf);
    expect(await compressImageForUpload(light)).toBe(light);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('thiếu createImageBitmap (trình duyệt cũ): trả bản gốc', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const original = bigFile('a.jpg', 'image/jpeg');
    expect(await compressImageForUpload(original)).toBe(original);
  });
});

describe('renameExtension', () => {
  it('thay đuôi theo loại mới, giữ tên', () => {
    expect(renameExtension('IMG_1234.HEIC', 'image/jpeg')).toBe('IMG_1234.jpg');
    expect(renameExtension('no-extension', 'image/webp')).toBe('no-extension.webp');
    expect(renameExtension('.hidden', 'image/png')).toBe('.hidden.png');
  });
});
