import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { DRIVER_LICENCE_IMAGE_MAX_EDGE_PX, DRIVER_LICENCE_UPLOAD_MAX_BYTES } from '@xeprime/types';
import { driverLicenceApi, type DriverLicence } from '@/api/driver-licence/api';
import { CameraPermissionDeniedError, captureInAppPhoto } from '@/features/camera/in-app-camera';
import {
  IMAGE_SOURCE,
  ImagePermissionDeniedError,
  ImageUploadError,
  type ImageSource,
} from '@/lib/r2-image-upload';

/**
 * Chuẩn bị + tải ảnh bằng lái — bản native của `prepare-licence-image.ts` + `submitDriverLicence`
 * bên web, cùng ba con số (cạnh dài tối đa, cạnh dài tối thiểu, trần byte).
 *
 *  - Thu cạnh dài về `DRIVER_LICENCE_IMAGE_MAX_EDGE_PX` (2000px — bộ đọc cần đủ nét để đọc từng
 *    chữ, nên KHÔNG dùng trần 1600px của ảnh xe ở `r2-image-upload`). Chỉ thu nhỏ, không phóng to.
 *  - Mã hoá lại thành JPEG: bỏ EXIF (GPS, đời máy) và đưa HEIC về định dạng server nhận.
 *    `manipulateAsync` đã xoay ảnh đúng chiều theo EXIF trước khi ghi.
 *  - Chụp đi qua `captureInAppPhoto()` — KHÔNG `ImagePicker.launchCameraAsync` (Android giết app ở
 *    nền và ảnh mất — xem references/native-adaptations.md).
 */

/** Cạnh dài tối thiểu — nhỏ hơn thế chữ trên bằng không còn đọc được (cùng số với web). */
export const MIN_LICENCE_IMAGE_EDGE_PX = 640;

const QUALITY_STEPS = [0.88, 0.8, 0.7, 0.6] as const;

export type PrepareImageRejection = 'unsupported' | 'tooSmall' | 'tooLarge';

export class PrepareImageError extends Error {
  constructor(readonly reason: PrepareImageRejection) {
    super(reason);
    this.name = 'PrepareImageError';
  }
}

/** Ảnh vừa chụp/chọn, CHƯA nén. `null` = người dùng huỷ (không phải lỗi). */
export interface RawLicenceImage {
  uri: string;
  width: number;
  height: number;
}

/** Ảnh đã chuẩn bị, kèm đúng các byte SẼ GỬI (số khai lúc presign phải khớp tuyệt đối). */
export interface PreparedLicenceImage {
  uri: string;
  body: Blob;
}

export async function pickLicenceImage(source: ImageSource): Promise<RawLicenceImage | null> {
  if (source === IMAGE_SOURCE.CAMERA) {
    const shot = await captureInAppPhoto().catch((error: unknown) => {
      throw error instanceof CameraPermissionDeniedError
        ? new ImagePermissionDeniedError(source)
        : error;
    });
    return shot ? { uri: shot.uri, width: shot.width, height: shot.height } : null;
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new ImagePermissionDeniedError(source);

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
    allowsMultipleSelection: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
}

/** Thu nhỏ (nếu cần) + JPEG + giảm dần chất lượng tới khi vừa trần byte của server. */
export async function prepareLicenceImage(raw: RawLicenceImage): Promise<PreparedLicenceImage> {
  const longEdge = Math.max(raw.width, raw.height);
  if (!Number.isFinite(longEdge) || longEdge <= 0) throw new PrepareImageError('unsupported');
  if (longEdge < MIN_LICENCE_IMAGE_EDGE_PX) throw new PrepareImageError('tooSmall');

  const actions: ImageManipulator.Action[] =
    longEdge > DRIVER_LICENCE_IMAGE_MAX_EDGE_PX
      ? [
          {
            resize:
              raw.width >= raw.height
                ? { width: DRIVER_LICENCE_IMAGE_MAX_EDGE_PX }
                : { height: DRIVER_LICENCE_IMAGE_MAX_EDGE_PX },
          },
        ]
      : [];

  for (const quality of QUALITY_STEPS) {
    let uri: string;
    try {
      ({ uri } = await ImageManipulator.manipulateAsync(raw.uri, actions, {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }));
    } catch {
      throw new PrepareImageError('unsupported');
    }
    const body = await (await fetch(uri)).blob();
    if (body.size > 0 && body.size <= DRIVER_LICENCE_UPLOAD_MAX_BYTES) return { uri, body };
  }
  throw new PrepareImageError('tooLarge');
}

/**
 * Nộp một ảnh: presign theo ĐÚNG số byte sắp gửi → PUT thẳng lên kho riêng tư → xác nhận.
 * Trả lượt nộp ở `processing` — đọc ảnh chạy nền, màn hình hỏi lại overview tới khi có kết quả.
 *
 * PUT bằng `fetch` TRẦN: `uploadUrl` là host của R2, gửi kèm Bearer của XePrime tới đó là rò
 * token. Không log `uploadUrl` — nó là giấy phép ghi đã ký.
 */
export async function submitDriverLicence(image: PreparedLicenceImage): Promise<DriverLicence> {
  const contentType = 'image/jpeg';
  // Lỗi presign để NGUYÊN `ApiClientError`: mã như `DRIVER_LICENCE_SUBMISSION_LIMIT` phải tới được
  // `useErrorMessage` để hiện đúng câu, bọc lại là mất mã.
  const ticket = await driverLicenceApi.presign({ contentType, fileSize: image.body.size });
  try {
    const response = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: image.body,
    });
    if (!response.ok) throw new Error(`R2 PUT ${response.status}`);
  } catch (error) {
    throw new ImageUploadError('upload', error);
  }
  return driverLicenceApi.complete(ticket.licenceId);
}
