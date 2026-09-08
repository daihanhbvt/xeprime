import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { validateDocumentUpload, type UploadRejection } from '@xeprime/types';
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

/**
 * Tệp bị TỪ CHỐI ngay tại máy, trước khi presign.
 *
 * Mang theo MÃ lý do chứ không mang câu: hàm ném ra không biết người dùng đang đọc ngôn ngữ nào.
 * Nơi gọi đổi mã thành chữ qua `Errors.upload.*` — xem `useUploadRejectionMessage`.
 */
export class UploadRejectedError extends Error {
  constructor(readonly rejection: UploadRejection) {
    super(`Upload rejected: ${rejection.reason}`);
    this.name = 'UploadRejectedError';
  }
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
  const ticket = await uploadPrivateFileToR2(image, presign);
  return ticket.fileId;
}

/**
 * Một TỆP đã chọn, sẵn sàng tải lên. `PickedImage` là trường hợp riêng của nó.
 *
 * KHÔNG có `fileSize`, cùng lý do với `PickedImage`: số byte thật chỉ đọc được bằng cách mở file
 * ra, và bước tải lên phải mở nó ra rồi.
 */
export interface PickedFile {
  uri: string;
  fileName: string;
  contentType: string;
}

/** Chỉ nhận PDF ở đường này — ảnh đã có `pickImages` (nén tại máy trước khi gửi). */
const PDF_MIME = 'application/pdf';

/**
 * Chọn một tệp PDF từ kho tài liệu của máy.
 *
 * Trả `null` khi người dùng HUỶ — huỷ không phải lỗi, và ném ở đây buộc mọi nơi gọi phải bọc
 * try/catch cho một thao tác bình thường (cùng quy ước với `pickImages`).
 *
 * Không có lớp lỗi "từ chối quyền" như ảnh: trình chọn tài liệu của cả hai nền tảng chạy ngoài
 * tiến trình app và không đòi quyền runtime nào.
 */
export async function pickPdfFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: PDF_MIME,
    multiple: false,
    // Bắt buộc: `uri` của provider ngoài (Drive, Files) không đọc lại được bằng `fetch` nếu
    // không được sao vào cache của app trước.
    copyToCacheDirectory: true,
  });

  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;

  return {
    uri: asset.uri,
    // Tên file chỉ để người vận hành nhận ra tài liệu trong kho — server không tin nó.
    fileName: asset.name || `document-${Date.now()}.pdf`,
    contentType: asset.mimeType || PDF_MIME,
  };
}

/**
 * Tải MỘT tệp lên kho RIÊNG TƯ và trả về NGUYÊN VẸN vé presign.
 *
 * Khác `uploadPrivateImageToR2` đúng ở chỗ đó: mỗi hồ sơ đặt tên cho thứ nó nhận về khác nhau —
 * giấy tờ xe gọi là `fileId`, giấy tờ khách gọi là `documentId` — nên hàm này không đoán, nó
 * trả cả vé và nơi gọi tự đọc trường của mình.
 *
 * Cùng cái bẫy `Content-Length` của `uploadImageToR2`: server ký số byte VÀO URL, nên phải mở
 * file ra TRƯỚC rồi mới presign theo đúng số byte sắp gửi. Lệch là R2 trả **403** — chữ ký không
 * khớp, không phải CORS, không phải hết hạn phiên.
 *
 * Bước "hoàn tất" nằm ở nơi gọi nhưng là BẮT BUỘC: file chưa hoàn tất thì server chưa xác minh
 * nội dung và chưa cho dùng.
 */
export async function uploadPrivateFileToR2<TTicket extends { uploadUrl: string }>(
  file: PickedFile,
  presign: (meta: UploadMeta) => Promise<TTicket>,
): Promise<TTicket> {
  const body = await (await fetch(file.uri)).blob();

  /*
   * Kiểm MIME + dung lượng NGAY sau khi đọc số byte thật, TRƯỚC khi presign — cùng lớp chặn sớm
   * web có ở `validateDocumentFile`. Ảnh đi qua đây đã được `compress()` bó lại, nhưng PDF thì
   * không: một bản scan 30MB mà không chặn ở đây sẽ đi trọn vòng presign rồi mới bị DTO từ chối,
   * và người dùng chỉ nhận được một lỗi chung chung sau vài giây chờ.
   */
  const rejection = validateDocumentUpload({ type: file.contentType, size: body.size });
  if (rejection) throw new UploadRejectedError(rejection);

  const meta: UploadMeta = {
    fileName: file.fileName,
    contentType: file.contentType,
    fileSize: body.size,
  };

  let ticket: TTicket;
  try {
    ticket = await presign(meta);
  } catch (error) {
    throw new ImageUploadError('presign', error);
  }

  try {
    const response = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.contentType },
      body,
    });
    if (!response.ok) {
      throw new Error(`R2 PUT ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    throw new ImageUploadError('upload', error);
  }

  return ticket;
}

/**
 * Tải MỘT tệp lên kho CÔNG KHAI và trả URL công khai của nó.
 *
 * Song sinh của {@link uploadPrivateFileToR2}, khác đúng ở kho đích và thứ nhận về: chứng từ
 * phiếu thu/chi (hoá đơn xăng, rửa xe, biên lai chuyển khoản) không mang giấy tờ tuỳ thân, nên
 * nó nằm cùng mức phơi bày với ảnh xe và được nhắc tới bằng URL chứ không bằng id.
 *
 * `uploadImageToR2` đã lo phần ẢNH (nó nén trước khi gửi). Hàm này là đường cho những tệp KHÔNG
 * nén được — PDF — nên nó phải kiểm MIME + dung lượng ngay sau khi đo số byte thật: một bản scan
 * 30MB mà không chặn ở đây sẽ đi trọn vòng presign rồi mới bị DTO từ chối.
 *
 * Cùng cái bẫy `Content-Length`: server ký số byte VÀO URL, nên mở file ra TRƯỚC rồi mới presign
 * theo đúng số byte sắp gửi. Lệch là R2 trả **403**.
 */
export async function uploadPublicFileToR2(
  file: PickedFile,
  presign: (meta: UploadMeta) => Promise<UploadPresign>,
): Promise<string> {
  const body = await (await fetch(file.uri)).blob();

  const rejection = validateDocumentUpload({ type: file.contentType, size: body.size });
  if (rejection) throw new UploadRejectedError(rejection);

  const meta: UploadMeta = {
    fileName: file.fileName,
    contentType: file.contentType,
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
      headers: { 'Content-Type': file.contentType },
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
