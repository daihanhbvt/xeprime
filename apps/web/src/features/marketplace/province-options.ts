import type { PublicDestination } from './types';

export interface ProvinceOption {
  /** Giá trị đi vào URL: MÃ tỉnh. Chuỗi rỗng = "Toàn quốc". */
  value: string;
  label: string;
  /** Lựa chọn cũ không còn khả dụng — hiển thị khác đi để người dùng biết mà bỏ. */
  unavailable?: boolean;
}

export const NATIONWIDE_OPTION: ProvinceOption = { value: '', label: 'Toàn quốc' };

/** Nhãn hiển thị cho một lựa chọn địa điểm đã cũ (tỉnh bị ẩn, hoặc không còn xe nào). */
export const UNAVAILABLE_PROVINCE_LABEL = 'Địa điểm không còn khả dụng';

/**
 * Dựng options cho MỌI bộ chọn địa điểm ở marketplace từ CÙNG một nguồn (`/public/destinations`).
 *
 * Vì sao là hàm dùng chung: hero desktop, dialog mobile và ô sửa ở `/search` từng chép ba bản
 * cùng logic — và mỗi bản có một cách xử lý "giá trị đang chọn không có trong danh sách" khác
 * nhau. Một hàm nghĩa là desktop và mobile không thể hiện hai danh sách khác nhau.
 *
 * Lựa chọn cũ KHÔNG bị âm thầm bỏ (bỏ nghĩa là tìm toàn quốc — trả về xe ở tỉnh khác), mà được
 * giữ lại như một option ghi rõ là không còn khả dụng để người dùng chủ động đổi.
 */
export function buildProvinceOptions(
  destinations: readonly PublicDestination[] | undefined,
  selectedCode: string | undefined,
): ProvinceOption[] {
  const fromApi: ProvinceOption[] = (destinations ?? []).map((d) => ({
    value: d.provinceCode,
    label: d.provinceName,
  }));

  const stale: ProvinceOption[] =
    selectedCode && !fromApi.some((o) => o.value === selectedCode)
      ? [{ value: selectedCode, label: UNAVAILABLE_PROVINCE_LABEL, unavailable: true }]
      : [];

  return [NATIONWIDE_OPTION, ...stale, ...fromApi];
}

/** Tên tỉnh để hiển thị tóm tắt; `null` khi chưa chọn hoặc lựa chọn đã cũ. */
export function provinceLabelOf(
  destinations: readonly PublicDestination[] | undefined,
  selectedCode: string | undefined,
): string | null {
  if (!selectedCode) return null;
  return (destinations ?? []).find((d) => d.provinceCode === selectedCode)?.provinceName ?? null;
}
