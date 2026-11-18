import type { VehicleFormValues } from '@xeprime/validators';
import type { RegistrationCaptureState } from './registration-capture';

/**
 * Nháp của wizard THÊM XE (`/vehicles/new`, cả hai tuyến) trong `sessionStorage` - 18/11/2026.
 *
 * Vì sao cần: wizard là thuần client (một form RHF, gọi API một lần lúc lưu). Bất cứ lần rời trang nào
 * - bấm "Xem gói" ở dải hết suất rồi quay lại, nút lùi của trình duyệt, F5 - đều unmount form và mất
 * sạch thứ chủ xe đã gõ qua ba bước. Nháp giữ trọn giá trị form, bước đang mở, công tắc "tự động đồng
 * ý" và phần cà vẹt đã nhập, rồi bị xoá khi xe tạo xong hoặc khi người dùng huỷ wizard.
 *
 * KHÔNG phải nguồn dữ liệu: server vẫn là nơi duy nhất giữ xe. `sessionStorage` chỉ sống trong một
 * tab, khoá theo người + gian hàng nên tài khoản khác cùng máy không thấy. Ảnh xem trước cà vẹt là
 * data URL (ảnh đã nén) nên giữ được cùng mã lượt tải + kết quả đọc.
 */
export interface VehicleCreateDraft {
  values: Partial<VehicleFormValues>;
  step: number;
  autoAcceptEnabled: boolean;
  registration: Pick<
    RegistrationCaptureState,
    'uploadId' | 'reading' | 'readerAvailable' | 'fields' | 'editing' | 'previewUrl'
  > | null;
}

export function vehicleCreateDraftKey(userId: string, tenantId: string): string {
  return `xp.vehicle-create.draft.${userId}.${tenantId}`;
}

/**
 * Khoá đã bị bỏ (tạo xong / huỷ / F5): form unmount NGAY SAU đó sẽ gọi ghi nháp - lượt ghi đó phải
 * bị bỏ qua, không thì nháp vừa xoá sống lại. Lần mở form kế tiếp (`read`) gỡ cờ.
 */
const discarded = new Set<string>();

export function readVehicleCreateDraft(key: string): VehicleCreateDraft | null {
  discarded.delete(key);
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VehicleCreateDraft> | null;
    if (!parsed || typeof parsed !== 'object' || !parsed.values) return null;
    return {
      values: parsed.values,
      step: Number.isInteger(parsed.step) ? (parsed.step as number) : 0,
      autoAcceptEnabled: parsed.autoAcceptEnabled === true,
      registration: parsed.registration ?? null,
    };
  } catch {
    // Nháp hỏng / bộ nhớ bị chặn - mở form trống, không bao giờ chặn người dùng vì bộ nhớ tạm.
    return null;
  }
}

export function writeVehicleCreateDraft(key: string, draft: VehicleCreateDraft): void {
  if (discarded.has(key)) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Hết dung lượng (ảnh cà vẹt to) ⇒ thử lại KHÔNG kèm ảnh: mất ảnh còn hơn mất cả form.
    try {
      const registration = draft.registration ? { ...draft.registration, previewUrl: null } : null;
      sessionStorage.setItem(key, JSON.stringify({ ...draft, registration }));
    } catch {
      // Chế độ riêng tư / bị chặn - bỏ qua, nháp chỉ là tiện ích.
    }
  }
}

export function clearVehicleCreateDraft(key: string): void {
  discarded.add(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Không còn gì để làm - nháp hết hạn cùng phiên tab.
  }
}
