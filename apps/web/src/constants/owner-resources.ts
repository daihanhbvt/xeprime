/**
 * Tài liệu PDF cho chủ xe — cẩm nang và biểu mẫu hợp đồng/chứng từ.
 *
 * Là MANIFEST tập trung: hai màn `/account/host-guide` và `/account/contracts-documents` chỉ
 * render danh sách này, không màn nào tự ghép đường dẫn PDF. Đổi tên file, thêm tài liệu hay
 * gỡ một biểu mẫu là sửa ĐÚNG MỘT chỗ.
 *
 * File thật KHÔNG nằm trong git — người vận hành chép PDF vào `apps/web/public/owner-resources/`
 * theo đúng tên ở cột `file` (README trong thư mục đó liệt kê lại). Không có file giả để "cho
 * có link": một PDF rỗng trông như tài liệu thật là cách chắc nhất để chủ xe ký nhầm.
 */

/** Gốc URL công khai — Next phục vụ thẳng từ `apps/web/public/owner-resources/`. */
export const OWNER_RESOURCE_BASE = '/owner-resources';

/**
 * Khoá của một tài liệu — cũng là khoá nhãn `Account.resources.items.<key>.{title,description}`.
 *
 * Viết tường minh (không suy từ bó message): `t()` của next-intl kiểm khoá lúc biên dịch, nên
 * một khoá ở đây mà bó message không có sẽ đỏ ngay tại `ResourceList` — union tự suy chỉ làm
 * kiểu khó đọc mà không bắt được thêm lỗi nào.
 */
export type OwnerResourceKey =
  | 'safeRentalProcess'
  | 'taxSettlementGuide'
  | 'rentalContractTemplate'
  | 'handoverRecordTemplate'
  | 'pitSettlementDocument'
  | 'taxRefundRequest';

export interface OwnerResource {
  /** Khoá ổn định — cũng là khoá nhãn `Account.resources.items.<key>.{title,description}`. */
  readonly key: OwnerResourceKey;
  /** Tên file trong `public/owner-resources/`. */
  readonly file: string;
  /** Nhóm hiển thị — cẩm nang đọc, hay biểu mẫu tải về. */
  readonly kind: 'guide' | 'contract' | 'document';
}

export const OWNER_RESOURCES: readonly OwnerResource[] = [
  { key: 'safeRentalProcess', file: 'safe-rental-process.pdf', kind: 'guide' },
  { key: 'taxSettlementGuide', file: 'tax-settlement-guide.pdf', kind: 'guide' },
  { key: 'rentalContractTemplate', file: 'rental-contract-template.pdf', kind: 'contract' },
  { key: 'handoverRecordTemplate', file: 'handover-record-template.pdf', kind: 'contract' },
  { key: 'pitSettlementDocument', file: 'pit-settlement-document.pdf', kind: 'document' },
  { key: 'taxRefundRequest', file: 'tax-refund-request.pdf', kind: 'document' },
];

export function ownerResourceHref(resource: OwnerResource): string {
  return `${OWNER_RESOURCE_BASE}/${resource.file}`;
}

export function ownerResourcesOfKind(kind: OwnerResource['kind']): OwnerResource[] {
  return OWNER_RESOURCES.filter((resource) => resource.kind === kind);
}
