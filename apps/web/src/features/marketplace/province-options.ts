import type { PublicDestination } from './types';

export interface ProvinceOption {
  /** Giá trị đi vào URL: MÃ tỉnh. Chuỗi rỗng = "Toàn quốc". */
  value: string;
  label: string;
  /** Lựa chọn cũ không còn khả dụng — hiển thị khác đi để người dùng biết mà bỏ. */
  unavailable?: boolean;
}

/** Giá trị URL của "toàn quốc" là CHUỖI RỖNG. Nhãn nằm ở `HomeSearch.location.nationwide`. */
export const NATIONWIDE_VALUE = '';

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
  /** Nhãn đã dịch — hàm này KHÔNG sở hữu chữ, nếu không sẽ có hai nguồn cho cùng một từ. */
  labels: { nationwide: string; unavailable: string },
): ProvinceOption[] {
  const fromApi: ProvinceOption[] = (destinations ?? []).map((d) => ({
    value: d.provinceCode,
    label: d.provinceName,
  }));

  const stale: ProvinceOption[] =
    selectedCode && !fromApi.some((o) => o.value === selectedCode)
      ? [{ value: selectedCode, label: labels.unavailable, unavailable: true }]
      : [];

  return [{ value: NATIONWIDE_VALUE, label: labels.nationwide }, ...stale, ...fromApi];
}

/** Tên tỉnh để hiển thị tóm tắt; `null` khi chưa chọn hoặc lựa chọn đã cũ. */
export function provinceLabelOf(
  destinations: readonly PublicDestination[] | undefined,
  selectedCode: string | undefined,
): string | null {
  if (!selectedCode) return null;
  return (destinations ?? []).find((d) => d.provinceCode === selectedCode)?.provinceName ?? null;
}
