import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { HandoverPhotoSlot, HandoverType } from '@xeprime/types';
import { handoversApi, type Handover, type HandoverUploadMeta } from './api';

/**
 * Bề rộng tối đa sau khi nén.
 *
 * 1600px đủ đọc biển số và vết xước trên một ảnh bằng chứng, và cắt ảnh 12MP của máy hiện đại
 * từ ~5MB xuống vài trăm KB. Ảnh gốc là thứ giết luồng này ở bãi xe: sóng 3G một thanh, mười
 * ảnh 5MB nghĩa là nhân viên đứng chờ.
 */
const MAX_WIDTH = 1600;

/** Chất lượng JPEG. 0.7 là mốc mà mắt thường không phân biệt được với 1.0 trên ảnh chụp xe. */
const JPEG_QUALITY = 0.7;

export const PHOTO_SOURCE = {
  CAMERA: 'camera',
  LIBRARY: 'library',
} as const;

export type PhotoSource = (typeof PHOTO_SOURCE)[keyof typeof PHOTO_SOURCE];

/**
 * Một tấm ảnh đã nén, sẵn sàng tải lên.
 *
 * KHÔNG có `fileSize`. Số byte thật chỉ đọc được bằng cách mở file ra, và bước tải lên phải mở
 * nó ra rồi — nên nó đo ở đó, một lần, ngay cạnh chỗ dùng. Mang theo một con số đoán trước từ
 * đây là mở lại đúng cái bẫy đã làm hỏng luồng này: xem chú thích ở `uploadHandoverPhoto`.
 */
export interface PickedPhoto {
  uri: string;
  fileName: string;
  contentType: string;
}

/**
 * Chụp hoặc chọn MỘT ảnh, rồi nén ngay tại máy.
 *
 * Trả `null` khi người dùng huỷ hoặc từ chối quyền — huỷ KHÔNG phải lỗi, và ném ở đây buộc mọi
 * nơi gọi phải bọc try/catch cho một thao tác bình thường.
 */
export async function pickHandoverPhoto(source: PhotoSource): Promise<PickedPhoto | null> {
  const permission =
    source === PHOTO_SOURCE.CAMERA
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) return null;

  const result =
    source === PHOTO_SOURCE.CAMERA
      ? await ImagePicker.launchCameraAsync({ quality: 1, exif: false })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 1,
          exif: false,
        });

  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  /*
   * Thu nhỏ CHỈ khi ảnh rộng hơn trần. `resize` không phải "giới hạn", nó là "đặt bằng": ảnh
   * 800px đưa qua `{ width: 1600 }` bị PHÓNG TO gấp đôi — nặng hơn, mờ hơn, ngược hẳn mục đích
   * của cả bước nén này.
   */
  const actions = asset.width > MAX_WIDTH ? [{ resize: { width: MAX_WIDTH } }] : [];

  const compressed = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return {
    uri: compressed.uri,
    // Tên file chỉ để người vận hành nhận ra ảnh trong kho — server không tin nó.
    fileName: asset.fileName ?? `handover-${Date.now()}.jpg`,
    contentType: 'image/jpeg',
  };
}

/**
 * Tải MỘT ảnh hiện trạng lên — ba bước, đúng thứ tự.
 *
 * ```
 * POST .../photos/presign  → { uploadUrl, fileId }
 * PUT  <uploadUrl>           ảnh lên R2, KHÔNG qua API
 * POST .../photos            { fileId, slot } → HandoverDto
 * ```
 *
 * Bước PUT đi THẲNG tới bucket riêng tư: đẩy ảnh qua API nghĩa là mọi tấm ảnh chiếm một tiến
 * trình Node trong vài giây, và một bãi xe mất sóng sẽ kéo sập cả API.
 *
 * `fetch` trần chứ không phải `apiPut`: `uploadUrl` là URL của R2, không phải của API — gửi kèm
 * `Authorization` của XePrime tới đó là rò token sang một host khác.
 */
export async function uploadHandoverPhoto(input: {
  bookingId: string;
  type: HandoverType;
  slot: HandoverPhotoSlot;
  photo: PickedPhoto;
}): Promise<Handover> {
  /*
   * Mở file RA TRƯỚC, rồi mới xin URL — theo đúng số byte vừa đọc được.
   *
   * Server ký `Content-Length` VÀO URL đã ký (`presignPrivateUpload` truyền `ContentLength` cho
   * `PutObjectCommand`, và `content-length` nằm trong `X-Amz-SignedHeaders`). Nghĩa là số byte
   * khai lúc xin URL và số byte thật lúc PUT phải khớp TUYỆT ĐỐI, nếu không R2 trả **403** —
   * chữ ký không khớp, không phải CORS, không phải hết hạn phiên.
   *
   * Chỗ này từng lấy `fileSize` của ảnh GỐC từ trình chọn ảnh rồi PUT ảnh ĐÃ NÉN: khai 2.4MB,
   * gửi ~300KB, và mọi tấm ảnh đều 403. Web không dính vì nó đo đúng cái `File` nó gửi đi.
   *
   * Đọc trước cũng đóng luôn đường tái phát: số được ký CHÍNH LÀ `body` sẽ gửi, không còn hai
   * con số để lệch nhau.
   */
  const body = await (await fetch(input.photo.uri)).blob();

  const meta: HandoverUploadMeta = {
    fileName: input.photo.fileName,
    contentType: input.photo.contentType,
    fileSize: body.size,
  };

  /*
   * Ba bước, ba kiểu hỏng khác hẳn nhau — nên mỗi bước tự khai tên mình khi ngã.
   *
   * Trước đây cả ba cùng nổ thành một câu "không tải được ảnh", và câu đó không phân biệt nổi:
   * server từ chối cấp URL (413/403/hết hạn phiên) · R2 từ chối PUT (sai content-type, URL hết
   * hạn) · hay chính bước gắn vào biên bản bị 409. Ba nguyên nhân, ba cách sửa.
   *
   * `stage` đi kèm lỗi để lớp giao diện log ra được, và `cause` giữ nguyên lỗi gốc.
   */
  const presign = await step('presign', meta, () =>
    handoversApi.presignPhoto(input.bookingId, input.type, input.slot, meta),
  );

  const uploaded = await step('upload', meta, async () => {
    const response = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': input.photo.contentType },
      body,
    });
    if (!response.ok) {
      throw new Error(`R2 PUT ${response.status} ${response.statusText}`);
    }
    return response;
  });
  void uploaded;

  return step('attach', meta, () =>
    handoversApi.attachPhoto(input.bookingId, input.type, presign.fileId, input.slot),
  );
}

/** Bước nào của luồng tải ảnh đã ngã — đi kèm mọi lỗi ném ra từ đây. */
export type HandoverUploadStage = 'presign' | 'upload' | 'attach';

export class HandoverUploadError extends Error {
  constructor(
    readonly stage: HandoverUploadStage,
    readonly meta: HandoverUploadMeta,
    override readonly cause: unknown,
  ) {
    super(`[handover-photo] ${stage} thất bại — ${describe(cause)}`);
    this.name = 'HandoverUploadError';
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

async function step<T>(
  stage: HandoverUploadStage,
  meta: HandoverUploadMeta,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new HandoverUploadError(stage, meta, error);
  }
}
