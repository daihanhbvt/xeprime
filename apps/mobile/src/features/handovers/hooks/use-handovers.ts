import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HandoverPhotoSlot, HandoverType } from '@xeprime/types';
import { queryKeys } from '@/queries/query-keys';
import {
  handoversApi,
  type ConfirmHandoverInput,
  type HandoverContext,
  type ResolveOdometerInput,
  type SaveHandoverInput,
} from '../api';
import { uploadHandoverPhoto, type PickedPhoto } from '../photo-upload';

/**
 * Ngữ cảnh bàn giao của một đơn — nguồn của CTA chính trên màn chi tiết đơn.
 *
 * `canStartPickup` / `canStartReturn` do SERVER quyết (`HANDOVER_ELIGIBLE_BOOKING_STATUS`),
 * client KHÔNG tự suy từ `booking.status`: hai bên nói hai luật khác nhau là chỗ nút "Xác nhận
 * đã giao xe" hiện ra rồi nhận 409.
 *
 * Nằm dưới nhánh `bookings` ở `queryKeys` vì xác nhận bàn giao đổi luôn trạng thái đơn —
 * invalidate một chỗ là đủ cho cả hai.
 */
export function useHandoverContext(bookingId: string, enabled = true) {
  return useQuery<HandoverContext>({
    queryKey: queryKeys.bookings.handovers(bookingId),
    queryFn: () => handoversApi.context(bookingId),
    enabled: enabled && Boolean(bookingId),
  });
}

/**
 * Lưu bản nháp. Bản nháp KHÔNG có hệ quả nghiệp vụ nào — không đổi KM, không đổi trạng thái
 * đơn, không đụng lịch xe. Toàn bộ hệ quả xảy ra đúng một lần, lúc xác nhận.
 *
 * `expectedRowVersion` bắt buộc khi sửa bản đã có: hai nhân viên cùng mở một biên bản ở quầy là
 * chuyện thường, và không có nó thì người lưu sau âm thầm đè mất số KM người trước vừa nhập.
 */
export function useSaveHandoverDraft(bookingId: string, type: HandoverType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: SaveHandoverInput) => handoversApi.saveDraft(bookingId, type, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.handovers(bookingId) });
    },
  });
}

/**
 * Xác nhận bàn giao — ĐIỂM KHÔNG QUAY LẠI.
 *
 * Trong CÙNG một transaction ở server: ghi KM có thẩm quyền, đổi trạng thái đơn
 * (`pickup → active`, `return → completed`), và đụng lịch xe. Vì thế invalidate cả bốn nhánh —
 * đơn, lịch, quyết toán và chính biên bản.
 */
export function useConfirmHandover(bookingId: string, type: HandoverType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ConfirmHandoverInput) => handoversApi.confirm(bookingId, type, body),
    onSuccess: (context) => {
      queryClient.setQueryData(queryKeys.bookings.handovers(bookingId), context);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
  });
}

/**
 * Gắn một ảnh hiện trạng.
 *
 * Ảnh gắn được cả SAU khi đã xác nhận — trạng thái gắn/gỡ ảnh rộng hơn trạng thái sửa đúng một
 * bậc, vì luồng nhanh khuyến khích xác nhận trong hai chạm và quên chụp là chuyện thường.
 */
export function useAttachHandoverPhoto(bookingId: string, type: HandoverType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { slot: HandoverPhotoSlot; photo: PickedPhoto }) =>
      uploadHandoverPhoto({ bookingId, type, slot: input.slot, photo: input.photo }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.handovers(bookingId) });
    },
  });
}

export function useRemoveHandoverPhoto(bookingId: string, type: HandoverType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slot: HandoverPhotoSlot) => handoversApi.removePhoto(bookingId, type, slot),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.handovers(bookingId) });
    },
  });
}

/**
 * Vé xem MỘT ảnh, xin ngay lúc bấm — dùng cho khung xem ảnh phóng to.
 *
 * Gác bằng quyền RIÊNG `handovers.view_files`: người lập biên bản không đương nhiên đọc lại
 * được kho bằng chứng.
 */
export function requestHandoverPhotoUrl(
  bookingId: string,
  type: HandoverType,
  fileId: string,
): Promise<{ downloadUrl: string }> {
  return handoversApi.photoUrl(bookingId, type, fileId);
}

/**
 * URL ký của ảnh hiện trạng sống bao lâu — gương `expiresIn = 120` của `presignPrivateDownload`.
 *
 * Giữ URL lâu hơn thời gian này là chuẩn bị sẵn một tấm ảnh hỏng.
 */
const PHOTO_URL_TTL_MS = 120_000;

/**
 * Vé xem NHIỀU ảnh cùng lúc — để lưới vẽ được ảnh thật thay vì một ô màu.
 *
 * Cache được (khác vé bấm-từng-cái ở trên) vì thứ cần sống sót là BYTE của tấm ảnh, không phải
 * cái URL: `<Image>` tải xong là giữ ảnh trong bộ nhớ. Rủi ro duy nhất là một `<Image>` MỚI mount
 * với URL quá hạn, nên `staleTime` để ở NỬA vòng đời — mọi URL phát ra từ cache còn ít nhất 60
 * giây để tải xong.
 *
 * `useQueries` chứ không phải một request gộp: backend cấp vé theo từng tệp.
 */
export function useHandoverPhotoUrls(
  bookingId: string,
  type: HandoverType,
  fileIds: readonly string[],
  enabled: boolean,
): Record<string, string> {
  const results = useQueries({
    queries: fileIds.map((fileId) => ({
      queryKey: queryKeys.bookings.handoverPhotoUrl(bookingId, type, fileId),
      queryFn: () => handoversApi.photoUrl(bookingId, type, fileId),
      enabled,
      staleTime: PHOTO_URL_TTL_MS / 2,
      gcTime: PHOTO_URL_TTL_MS / 2,
      // Thiếu quyền hay tệp đã gỡ thì thử lại cũng vẫn thế, và lưới có sẵn đường lùi.
      retry: false,
    })),
  });

  // KHÔNG `useMemo`: object này chỉ được TRA CỨU lúc vẽ, không phải dependency của hook nào.
  const urls: Record<string, string> = {};
  fileIds.forEach((fileId, index) => {
    const url = results[index]?.data?.downloadUrl;
    if (url) urls[fileId] = url;
  });
  return urls;
}

/**
 * Huỷ bản nháp.
 *
 * Không có nó thì biên bản vào `draft` là **không có đường ra** trên app: không sửa được cho
 * đúng, không bỏ đi được, và nhân viên phải mở web. Bản nháp không có hệ quả nghiệp vụ nào nên
 * huỷ nó rẻ — cái đắt là để nó nằm đó chắn mất chiều bàn giao.
 */
export function useCancelHandover(bookingId: string, type: HandoverType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (expectedRowVersion: number) =>
      handoversApi.cancel(bookingId, type, expectedRowVersion),
    onSuccess: (context) => {
      queryClient.setQueryData(queryKeys.bookings.handovers(bookingId), context);
    },
  });
}

/**
 * Sửa số KM SAU khi đã xác nhận — đường riêng, không phải `saveDraft`.
 *
 * `confirmed` là điểm không quay lại, nên số KM chỉ đổi được qua đây: bắt buộc `reasonCode` +
 * lý do chi tiết (vào `audit_logs`), và GIẢM số KM cần quyền cao hơn hẳn
 * (`vehicles.odometer.decrease`) vì hạ nó xuống có thể che giấu quãng đường đã chạy.
 *
 * Server trả `ODOMETER_DECREASE_FORBIDDEN` khi thiếu quyền giảm — nơi gọi hiện đúng câu đó chứ
 * không phải một lỗi chung.
 */
export function useResolveHandoverOdometer(bookingId: string, type: HandoverType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ResolveOdometerInput) => handoversApi.resolveOdometer(bookingId, type, body),
    onSuccess: (context) => {
      queryClient.setQueryData(queryKeys.bookings.handovers(bookingId), context);
      // KM có thẩm quyền của XE vừa đổi — hồ sơ xe và trung tâm bảo dưỡng đọc chung con số đó.
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.maintenance.all });
    },
  });
}

const MISSING_ODOMETER_LIMIT = 20;

/**
 * Hàng đợi "Thiếu KM trả" toàn gian hàng.
 *
 * Biên bản trả đã xác nhận nhưng không có số KM là một lỗ trong hồ sơ xe: mọi phép tính bảo dưỡng
 * theo KM sau đó đều dựa trên một mốc cũ.
 */
export function useMissingOdometerQueue(page: number, limit = MISSING_ODOMETER_LIMIT) {
  return useQuery({
    queryKey: queryKeys.maintenance.missingReturnKm({ page, limit }),
    queryFn: () => handoversApi.missingOdometer({ page, limit }),
  });
}
