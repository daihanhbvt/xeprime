/**
 * Bốn văn bản pháp lý công khai của sàn.
 *
 * Vì sao là CODE chứ không phải dữ liệu trong database: một điều khoản đã công bố phải nói
 * được "bản nào có hiệu lực từ ngày nào, ai sửa, sửa gì". Git đã trả lời cả bốn câu đó và
 * không sửa được lén; một bảng `legal_documents` thì phải dựng thêm versioning + audit để
 * đạt đúng chừng đó. Khi nào nội dung cần sửa mà không được deploy thì mới chuyển.
 *
 * Luật TMĐT 122/2025/QH15 và Nghị định 248/2026/NĐ-CP (hiệu lực 01/07/2026) buộc sàn công khai
 * quy chế hoạt động, chính sách và cơ chế tiếp nhận phản ánh — xem [ADR 0028 điều 9].
 */

/** Slug đi thẳng vào URL `/legal/<slug>`; đổi là gãy link đã phát ra ngoài. */
export const LEGAL_DOC = {
  TERMS: 'terms',
  PRIVACY: 'privacy',
  MARKETPLACE_RULES: 'marketplace-rules',
  CANCELLATION: 'cancellation',
} as const;

export type LegalDoc = (typeof LEGAL_DOC)[keyof typeof LEGAL_DOC];
export const LEGAL_DOC_VALUES = Object.values(LEGAL_DOC) as LegalDoc[];

/**
 * Ngày hiệu lực của bản đang hiển thị.
 *
 * MỘT ngày cho cả bốn văn bản vì chúng được soạn cùng một đợt và tham chiếu lẫn nhau — bản
 * quy chế nói về phí mà bản điều khoản chưa nói thì người đọc không biết bản nào thắng.
 * Sửa nội dung một văn bản là phải dời ngày này và ghi lại ở phần lịch sử.
 */
export const LEGAL_EFFECTIVE_FROM = '2026-09-03';

/**
 * Thứ tự các mục trong từng văn bản.
 *
 * Danh sách sống ở CODE chứ không suy từ message bundle, vì hai lý do: thứ tự điều khoản là
 * một quyết định pháp lý (điều 6 viện dẫn điều 2), không phải hệ quả của thứ tự khoá JSON; và
 * `i18n:check` từ chối mảng trong bundle nên bundle không diễn đạt được thứ tự.
 *
 * Thêm một mục = thêm khoá ở CẢ HAI ngôn ngữ rồi thêm tên mục vào đây. Quên bước sau thì mục
 * không hiện; quên bước trước thì `i18n:check` đỏ.
 */
export const LEGAL_SECTIONS: Readonly<Record<LegalDoc, readonly string[]>> = {
  [LEGAL_DOC.TERMS]: [
    'scope',
    'role',
    'account',
    'owner',
    'renter',
    'fees',
    'tax',
    'payment',
    'offPlatform',
    'content',
    'liability',
    'suspension',
    'changes',
    'law',
  ],
  [LEGAL_DOC.PRIVACY]: [
    'scope',
    'collected',
    'purpose',
    'sharing',
    'masking',
    'retention',
    'security',
    'rights',
    'cookies',
    'changes',
  ],
  [LEGAL_DOC.MARKETPLACE_RULES]: [
    'purpose',
    'members',
    'listing',
    'prohibited',
    'ranking',
    'transaction',
    'fees',
    'violation',
    'dispute',
    'privacyRef',
  ],
  [LEGAL_DOC.CANCELLATION]: ['principle', 'renter', 'owner', 'force', 'refund', 'dispute'],
};

export const legalPath = {
  /** Trang chủ khu pháp lý — địa chỉ viện dẫn CẢ BỘ bốn văn bản. */
  index: '/legal',
  doc: (doc: LegalDoc): string => `/legal/${doc}`,
};

export function isLegalDoc(value: string): value is LegalDoc {
  return (LEGAL_DOC_VALUES as string[]).includes(value);
}
