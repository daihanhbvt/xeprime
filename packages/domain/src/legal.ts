/**
 * Bốn văn bản pháp lý công khai của sàn.
 *
 * Ở `@xeprime/domain` chứ không ở `apps/web/src/constants/` vì CẢ HAI client viện dẫn cùng bộ
 * văn bản này: web render chúng tại `/legal/<slug>`, app native mở đúng địa chỉ đó trong trình
 * duyệt trong-app. Hai bản danh sách slug là hai cơ hội để một liên kết trong app trỏ tới một
 * văn bản mà web đã đổi tên — và không có gì báo.
 *
 * Framework-free có chủ đích (điều kiện vào package này): không `next/*`, không React, không
 * `process.env` — chỉ dữ liệu và hai hàm thuần.
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
export const LEGAL_EFFECTIVE_FROM = '2026-09-23';

/**
 * Một mục của văn bản: tên mục + (tuỳ chọn) thứ tự các GẠCH ĐẦU DÒNG bên trong nó.
 *
 * Vì sao danh sách con cũng khai ở code, không phải một mảng trong bundle: `i18n:check` từ chối
 * mảng trong message bundle (nó không đối chiếu được thứ tự giữa hai ngôn ngữ), và thứ tự các
 * khoản trong một điều là một quyết định PHÁP LÝ chứ không phải hệ quả của thứ tự khoá JSON.
 *
 * Khoá message tương ứng:
 *   - đoạn mở đầu:  `docs.<doc>.sections.<key>.body`
 *   - từng gạch:    `docs.<doc>.sections.<key>.items.<item>`
 */
export interface LegalSection {
  readonly key: string;
  readonly items?: readonly string[];
}

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
export const LEGAL_SECTIONS: Readonly<Record<LegalDoc, readonly LegalSection[]>> = {
  [LEGAL_DOC.TERMS]: [
    { key: 'scope' },
    { key: 'role', items: ['isMarketplace', 'notLessor', 'contractBetween', 'toolsProvided'] },
    { key: 'account', items: ['accurate', 'secret', 'report', 'oneAccount'] },
    {
      key: 'booking',
      items: ['request', 'decision', 'holdPayment', 'bookingCreated', 'slotLost'],
    },
    { key: 'money', items: ['online', 'atHandover', 'deposit', 'frozen'] },
    { key: 'owner', items: ['rightToRent', 'truthful', 'calendar', 'respond', 'handover'] },
    { key: 'renter', items: ['licence', 'lawfulUse', 'noSublet', 'careAndCost'] },
    { key: 'fees' },
    { key: 'tax' },
    { key: 'offPlatform' },
    { key: 'content' },
    { key: 'liability' },
    { key: 'suspension' },
    { key: 'changes' },
    { key: 'law' },
  ],
  [LEGAL_DOC.PRIVACY]: [
    { key: 'scope' },
    { key: 'collected', items: ['provided', 'generated', 'documents', 'notCollected'] },
    { key: 'purpose', items: ['account', 'booking', 'support', 'safety', 'improve', 'marketing'] },
    { key: 'sharing', items: ['betweenParties', 'processors', 'authorities', 'noSale'] },
    { key: 'masking' },
    { key: 'retention' },
    { key: 'security', items: ['transport', 'session', 'hashing', 'privateStorage'] },
    { key: 'rights', items: ['access', 'correct', 'delete', 'withdraw', 'complain'] },
    { key: 'cookies' },
    { key: 'changes' },
  ],
  [LEGAL_DOC.MARKETPLACE_RULES]: [
    { key: 'purpose' },
    { key: 'members' },
    { key: 'listing' },
    {
      key: 'prohibited',
      items: [
        'noRight',
        'stolenPhotos',
        'falsePrice',
        'duplicate',
        'unlawful',
        'harassment',
        'scraping',
      ],
    },
    { key: 'ranking' },
    {
      key: 'transaction',
      items: ['request', 'decision', 'holdPayment', 'bookingCreated', 'handover'],
    },
    { key: 'metrics' },
    { key: 'fees' },
    { key: 'violation', items: ['remind', 'hide', 'demote', 'suspend', 'terminate'] },
    { key: 'dispute' },
    { key: 'privacyRef' },
  ],
  [LEGAL_DOC.CANCELLATION]: [
    { key: 'principle' },
    { key: 'beforeDecision' },
    { key: 'paymentWindow' },
    { key: 'freeCancel' },
    { key: 'afterFreeCancel' },
    {
      key: 'ownerCancel',
      items: ['beforeDecision', 'beforePayment', 'afterBooking', 'duringTrip'],
    },
    { key: 'force' },
    { key: 'refund' },
    { key: 'dispute' },
  ],
};

/** Tên mục của một văn bản, phẳng — cho những chỗ chỉ cần danh sách khoá. */
export function legalSectionKeys(doc: LegalDoc): readonly string[] {
  return LEGAL_SECTIONS[doc].map((section) => section.key);
}

export const legalPath = {
  /** Trang chủ khu pháp lý — địa chỉ viện dẫn CẢ BỘ bốn văn bản. */
  index: '/legal',
  doc: (doc: LegalDoc): string => `/legal/${doc}`,
};

export function isLegalDoc(value: string): value is LegalDoc {
  return (LEGAL_DOC_VALUES as string[]).includes(value);
}
