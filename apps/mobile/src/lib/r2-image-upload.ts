import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { UploadMeta, UploadPresign } from '@xeprime/api-client';

/**
 * Bề rộng tối đa sau khi nén — cùng con số với ảnh bàn giao.
 *
 * 1600px đủ đọc biển số và chi tiết nội thất trên một ảnh giới thiệu xe, và cắt ảnh 12MP của máy
 * hiện đại từ ~5MB xuống vài trăm KB. Ảnh gốc là thứ giết luồng này khi sóng yếu.
 */
const MAX_WIDTH = 1600;

/** Chất lượng JPEG. 0.7 là mốc mắt thường không phân biệt được với 1.0 trên ảnh chụp xe. */
const JPEG_QUALITY = 0.7;

export const IMAGE_SOURCE = {
  CAMERA: 'camera',
  LIBRARY: 'library',
} as const;

export type ImageSource = (typeof IMAGE_SOURCE)[keyof typeof IMAGE_SOURCE];

/**
 * Một tấm ảnh đã nén, sẵn sàng tải lên.
 *
 * KHÔNG có `fileSize`. Số byte thật chỉ đọc được bằng cách mở file ra, và bước tải lên phải mở
 * nó ra rồi — nên nó đo ở đó, một lần, ngay cạnh chỗ dùng. Mang theo một con số đoán trước từ
 * đây là mở lại đúng cái bẫy đã làm hỏng luồng ảnh bàn giao: xem `uploadImageToR2`.
 */
export interface PickedImage {
  uri: string;
  fileName: string;
  contentType: string;
}

/**
 * Người dùng KHÔNG cho quyền máy ảnh / thư viện ảnh.
 *
 * Là lớp lỗi riêng chứ không phải mảng rỗng: "huỷ" và "bị từ chối quyền" trông giống hệt nhau ở
 * chỗ gọi, mà hai thứ đó cần hai phản hồi khác hẳn — huỷ thì im lặng, từ chối quyền thì phải nói
 * ra, nếu không người dùng chạm mãi vào một nút không bao giờ mở gì và tưởng app hỏng.
 *
 * Mang theo `source` để nơi gọi chọn đúng câu: bật quyền Máy ảnh hay quyền Ảnh là hai mục khác
 * nhau trong Cài đặt.
 */
export class ImagePermissionDeniedError extends Error {
  constructor(readonly source: ImageSource) {
    super(`Image permission denied: ${source}`);
    this.name = 'ImagePermissionDeniedError';
  }
}

/**
 * Chụp hoặc chọn ảnh, rồi nén ngay tại máy.
 *
 * Trả mảng rỗng khi người dùng HUỶ — huỷ không phải lỗi, và ném ở đây buộc mọi nơi gọi phải bọc
 * try/catch cho một thao tác bình thường. Từ chối QUYỀN thì ném `ImagePermissionDeniedError`.
 *
 * `limit` chỉ có nghĩa với thư viện ảnh: máy ảnh mỗi lần một tấm.
 */
export async function pickImages(source: ImageSource, limit = 1): Promise<PickedImage[]> {
  const permission =
    source === IMAGE_SOURCE.CAMERA
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) throw new ImagePermissionDeniedError(source);

  const result =
    source === IMAGE_SOURCE.CAMERA
      ? await ImagePicker.launchCameraAsync({ quality: 1, exif: false })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 1,
          exif: false,
          allowsMultipleSelection: limit > 1,
          selectionLimit: limit,
        });

  if (result.canceled) return [];

  return Promise.all(result.assets.map((asset) => compress(asset)));
}

async function compress(asset: ImagePicker.ImagePickerAsset): Promise<PickedImage> {
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
    fileName: asset.fileName ?? `vehicle-${Date.now()}.jpg`,
    contentType: 'image/jpeg',
  };
}

/** Bước nào của luồng tải ảnh đã ngã — đi kèm mọi lỗi ném ra từ đây. */
export type ImageUploadStage = 'presign' | 'upload';

export class ImageUploadError extends Error {
  constructor(
    readonly stage: ImageUploadStage,
    cause: unknown,
  ) {
    super(`Image upload failed at ${stage}`, { cause });
    this.name = 'ImageUploadError';
  }
}

/**
 * Tải MỘT ảnh lên R2 — hai bước, đúng thứ tự.
 *
 * ```
 * POST /uploads/.../presign  → { uploadUrl, publicUrl }
 * PUT  <uploadUrl>             ảnh lên R2, KHÔNG qua API
 * ```
 *
 * Bước PUT đi THẲNG tới bucket: đẩy ảnh qua API nghĩa là mỗi tấm chiếm một tiến trình Node
 * trong vài giây. `fetch` trần chứ không phải client của app — `uploadUrl` là URL của R2, gửi
 * kèm `Authorization` của XePrime tới đó là rò token sang một host khác.
 *
 * ⚠️ **Mở file RA TRƯỚC, rồi mới xin URL** — theo đúng số byte vừa đọc được. Server ký
 * `Content-Length` VÀO URL (`content-length` nằm trong `X-Amz-SignedHeaders`), nên số khai lúc
 * presign và số thật lúc PUT phải khớp TUYỆT ĐỐI; lệch là R2 trả **403** — chữ ký không khớp,
 * không phải CORS, không phải hết hạn phiên. Native nén ảnh giữa lúc chọn và lúc gửi, nên lấy
 * `fileSize` mà trình chọn ảnh báo (kích thước ảnh GỐC) là sai chắc chắn. Đọc trước cũng đóng
 * luôn đường tái phát: số được ký CHÍNH LÀ `body` sẽ gửi.
 */
export async function uploadImageToR2(
  image: PickedImage,
  presign: (meta: UploadMeta) => Promise<UploadPresign>,
): Promise<string> {
  const body = await (await fetch(image.uri)).blob();

  const meta: UploadMeta = {
    fileName: image.fileName,
    contentType: image.contentType,
    fileSize: body.size,
  };

  let ticket: UploadPresign;
  try {
    ticket = await presign(meta);
  } catch (error) {
    throw new ImageUploadError('presign', error);
  }

  try {
    const response = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': image.contentType },
      body,
    });
    if (!response.ok) {
      throw new Error(`R2 PUT ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    throw new ImageUploadError('upload', error);
  }

  return ticket.publicUrl;
}

/**
 * Tải MỘT ảnh lên kho RIÊNG TƯ — trả `fileId`, không có URL công khai nào.
 *
 * Cùng hai bước và cùng cái bẫy `Content-Length` của `uploadImageToR2` (đọc file ra TRƯỚC,
 * presign theo đúng số byte sắp gửi), chỉ khác ở thứ nhận về: file riêng tư không có
 * `publicUrl`, nó được nhắc tới bằng id và chỉ mở được qua signed URL xin lúc cần.
 *
 * Bước "hoàn tất/đính vào hồ sơ" nằm ở nơi gọi vì mỗi hồ sơ đính một kiểu (bản giấy tờ, chứng từ
 * bảo dưỡng, hợp đồng nguồn xe) — nhưng nó là BẮT BUỘC: file chưa hoàn tất thì server chưa xác
 * minh và chưa cho dùng.
 */
export async function uploadPrivateImageToR2(
  image: PickedImage,
  presign: (meta: UploadMeta) => Promise<{ uploadUrl: string; fileId: string }>,
): Promise<string> {
  const body = await (await fetch(image.uri)).blob();

  const meta: UploadMeta = {
    fileName: image.fileName,
    contentType: image.contentType,
    fileSize: body.size,
  };

  let ticket: { uploadUrl: string; fileId: string };
  try {
    ticket = await presign(meta);
  } catch (error) {
    throw new ImageUploadError('presign', error);
  }

  try {
    const response = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': image.contentType },
      body,
    });
    if (!response.ok) {
      throw new Error(`R2 PUT ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    throw new ImageUploadError('upload', error);
  }

  return ticket.fileId;
}
