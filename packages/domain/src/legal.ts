/**
 * Bộ văn bản pháp lý công khai của sàn.
 *
 * Chín văn bản, ánh xạ 1-1 với mã văn bản ở checklist tham vấn pháp lý (27/11/2026):
 * ĐKSD `terms` · QC `marketplace-rules` · RIÊNG TƯ `privacy` · khiếu nại `complaints` ·
 * HỦY `cancellation` · thanh toán + Ví điểm `payment` · HĐ THUÊ `rental-contract` ·
 * THUẾ `owner-tax` (ADR 0068 điều 6) · GÓI `subscription`. Hợp đồng với MIC, phụ lục xử lý dữ liệu
 * (DPA) và mẫu SHTT/NDA là hợp đồng ký riêng với đối tác, KHÔNG phải trang công khai.
 *
 * Ở `@xeprime/domain` chứ không ở `apps/web/src/constants/` vì CẢ HAI client viện dẫn cùng bộ
 * văn bản này: web render chúng tại `/legal/<slug>`, app native mở đúng địa chỉ đó trong trình
 * duyệt trong-app. Hai bản danh sách slug là hai cơ hội để một liên kết trong app trỏ tới một
 * văn bản mà web đã đổi tên — và không có gì báo.
 *
 * Framework-free có chủ đích (điều kiện vào package này): không `next/*`, không React, không
 * `process.env` — chỉ dữ liệu và hàm thuần.
 *
 * Vì sao là CODE chứ không phải dữ liệu trong database: một điều khoản đã công bố phải nói
 * được "bản nào có hiệu lực từ ngày nào, ai sửa, sửa gì". Git đã trả lời cả bốn câu đó và
 * không sửa được lén; một bảng `legal_documents` thì phải dựng thêm versioning + audit để
 * đạt đúng chừng đó. Khi nào nội dung cần sửa mà không được deploy thì mới chuyển.
 *
 * Luật TMĐT 122/2025/QH15 và Nghị định 248/2026/NĐ-CP (hiệu lực 01/07/2026) buộc sàn công khai
 * quy chế hoạt động, chính sách và cơ chế tiếp nhận phản ánh — xem [ADR 0028 điều 9].
 */

/**
 * Slug đi thẳng vào URL `/legal/<slug>`; đổi là gãy link đã phát ra ngoài.
 *
 * THỨ TỰ KHOÁ là thứ tự đọc (trang mục lục, cặp trước/sau): văn bản chung trước, rồi những văn
 * bản người thuê cần khi đặt xe, cuối cùng là văn bản riêng của chủ xe.
 */
export const LEGAL_DOC = {
  TERMS: 'terms',
  MARKETPLACE_RULES: 'marketplace-rules',
  PRIVACY: 'privacy',
  /** Quy trình tiếp nhận, giải quyết khiếu nại (Luật BVQLNTD 2023, Luật TMĐT 2025). */
  COMPLAINTS: 'complaints',
  CANCELLATION: 'cancellation',
  /** Phương thức thanh toán, đối soát, Ví điểm và rút tiền (checklist 2.01, 2.03, 2.05). */
  PAYMENT: 'payment',
  /**
   * Điều kiện chung của hợp đồng thuê giữa chủ xe và khách thuê trên mỗi đơn qua sàn — kèm biên
   * bản bàn giao số (checklist VB.05). Tờ hợp đồng của từng đơn (`ContractDocument`) viện dẫn nó.
   */
  RENTAL_CONTRACT: 'rental-contract',
  /**
   * Chính sách khấu trừ, nộp thay thuế cho chủ xe (NĐ 117/2025, NĐ 68/2026 — ADR 0068 điều 6).
   * Đọc chủ yếu từ site đối tác (dấu "i" của dòng thuế ở bảng cộng ví), nhưng `/legal/*` là đường
   * dùng chung mọi site nên CÙNG một địa chỉ ở cả ba.
   */
  OWNER_TAX: 'owner-tax',
  /**
   * Điều kiện gói dịch vụ gian hàng (checklist VB.08). CHỈ WEB — xem `LEGAL_WEB_ONLY_DOCS`.
   */
  SUBSCRIPTION: 'subscription',
} as const;

export type LegalDoc = (typeof LEGAL_DOC)[keyof typeof LEGAL_DOC];

/**
 * Văn bản chỉ công bố trên WEB thường: không liệt kê ở hai app native, không mở trong WebView của
 * app khách. Cả hai app không được nhắc tới gói / thuê bao (né quy định mua trong ứng dụng của
 * App Store và Google Play) — một văn bản mô tả giá gói và cách mua gói là đúng thứ đó.
 */
export const LEGAL_WEB_ONLY_DOCS: ReadonlySet<LegalDoc> = new Set<LegalDoc>([
  LEGAL_DOC.SUBSCRIPTION,
]);

/**
 * Văn bản công bố ở MỌI bề mặt (web, hai app, WebView). App native liệt kê đúng danh sách này
 * và chỉ mở được những slug trong đó (`isLegalDoc`).
 */
export const LEGAL_DOC_VALUES = (Object.values(LEGAL_DOC) as LegalDoc[]).filter(
  (doc) => !LEGAL_WEB_ONLY_DOCS.has(doc),
);

/** Mọi văn bản web render được — gồm cả văn bản chỉ-web. Route `/legal/[doc]` đọc danh sách này. */
export const LEGAL_DOC_WEB_VALUES = Object.values(LEGAL_DOC) as LegalDoc[];

/**
 * Nhóm văn bản theo NGƯỜI ĐỌC — trang mục lục `/legal` chia khối theo đây (cùng cách Mioto chia
 * "chính sách chung" / "dành cho chủ xe"): người thuê không phải lội qua chính sách thuế để tìm
 * chính sách huỷ.
 */
export const LEGAL_DOC_GROUP = {
  GENERAL: 'general',
  RENTING: 'renting',
  OWNER: 'owner',
} as const;

export type LegalDocGroup = (typeof LEGAL_DOC_GROUP)[keyof typeof LEGAL_DOC_GROUP];

export const LEGAL_DOC_GROUPS: ReadonlyArray<{
  readonly group: LegalDocGroup;
  readonly docs: readonly LegalDoc[];
}> = [
  {
    group: LEGAL_DOC_GROUP.GENERAL,
    docs: [LEGAL_DOC.TERMS, LEGAL_DOC.MARKETPLACE_RULES, LEGAL_DOC.PRIVACY, LEGAL_DOC.COMPLAINTS],
  },
  {
    group: LEGAL_DOC_GROUP.RENTING,
    docs: [LEGAL_DOC.CANCELLATION, LEGAL_DOC.PAYMENT, LEGAL_DOC.RENTAL_CONTRACT],
  },
  { group: LEGAL_DOC_GROUP.OWNER, docs: [LEGAL_DOC.OWNER_TAX, LEGAL_DOC.SUBSCRIPTION] },
];

/**
 * Ngày hiệu lực của bản đang hiển thị.
 *
 * MỘT ngày cho cả bộ văn bản vì chúng được soạn cùng một đợt và tham chiếu lẫn nhau — bản
 * quy chế nói về phí mà bản điều khoản chưa nói thì người đọc không biết bản nào thắng.
 * Sửa nội dung một văn bản là phải dời ngày này và ghi lại ở phần lịch sử.
 *
 * 27/11/2026: soạn lại toàn bộ theo checklist tham vấn pháp lý, thêm bốn văn bản (khiếu nại,
 * thanh toán + Ví điểm, điều kiện chung hợp đồng thuê, điều kiện gói). Luật sư duyệt xong thì dời
 * về ngày công bố chính thức và gỡ `robots: noindex` ở hai route `/legal`.
 */
export const LEGAL_EFFECTIVE_FROM = '2026-11-27';

/**
 * Bảng trong một mục (ma trận huỷ chuyến, ai nhận khoản nào). Chỉ khai KHOÁ cột và khoá dòng —
 * chữ của từng ô sống ở bó message:
 *   - tiêu đề cột: `docs.<doc>.sections.<key>.table.columns.<col>`
 *   - ô:           `docs.<doc>.sections.<key>.table.rows.<row>.<col>`
 * Cột đầu tiên là cột TIÊU ĐỀ DÒNG (`<th scope="row">`).
 */
export interface LegalTable {
  readonly columns: readonly string[];
  readonly rows: readonly string[];
}

/**
 * Một mục của văn bản: tên mục + (tuỳ chọn) thứ tự các GẠCH ĐẦU DÒNG và một bảng bên trong nó.
 *
 * Vì sao danh sách con cũng khai ở code, không phải một mảng trong bundle: `i18n:check` từ chối
 * mảng trong message bundle (nó không đối chiếu được thứ tự giữa hai ngôn ngữ), và thứ tự các
 * khoản trong một điều là một quyết định PHÁP LÝ chứ không phải hệ quả của thứ tự khoá JSON.
 *
 * Khoá message tương ứng:
 *   - đoạn mở đầu:  `docs.<doc>.sections.<key>.body`
 *   - từng gạch:    `docs.<doc>.sections.<key>.items.<item>`
 *   - bảng:         xem `LegalTable`
 */
export interface LegalSection {
  readonly key: string;
  readonly items?: readonly string[];
  readonly table?: LegalTable;
  /**
   * Bỏ hẳn mục này trong WebView của app khách (mục nói về gói / thuê bao). Câu chỉ cần nói KHÁC
   * đi thì dùng biến thể khoá `bodyInApp` / `itemsInApp`, không dùng cờ này.
   */
  readonly hiddenInApp?: boolean;
}

/**
 * Thứ tự các mục trong từng văn bản.
 *
 * Danh sách sống ở CODE chứ không suy từ message bundle, vì hai lý do: thứ tự điều khoản là
 * một quyết định pháp lý (điều 6 viện dẫn điều 2), không phải hệ quả của thứ tự khoá JSON; và
 * `i18n:check` từ chối mảng trong bundle nên bundle không diễn đạt được thứ tự.
 *
 * Thêm một mục = thêm khoá ở CẢ HAI ngôn ngữ rồi thêm tên mục vào đây. Quên bước sau thì mục
 * không hiện; quên bước trước thì `legal.test.ts` đỏ.
 */
export const LEGAL_SECTIONS: Readonly<Record<LegalDoc, readonly LegalSection[]>> = {
  [LEGAL_DOC.TERMS]: [
    { key: 'scope' },
    {
      key: 'definitions',
      items: [
        'platform',
        'user',
        'renter',
        'owner',
        'request',
        'booking',
        'holdPayment',
        'wallet',
        'directBooking',
      ],
    },
    {
      key: 'role',
      items: ['isMarketplace', 'notLessor', 'contractBetween', 'collectsOnBehalf', 'software'],
    },
    {
      key: 'account',
      items: ['accurate', 'phoneVerified', 'secret', 'separateAccounts', 'staff', 'report'],
    },
    {
      key: 'booking',
      items: ['request', 'decision', 'holdPayment', 'bookingCreated', 'slotLost', 'limits'],
    },
    {
      key: 'money',
      items: [
        'composition',
        'rentPrepaid',
        'atHandover',
        'officialAccount',
        'collateral',
        'frozen',
      ],
    },
    { key: 'wallet', items: ['nature', 'fiveNo', 'perAccount', 'withdraw', 'corrections'] },
    { key: 'verdict', items: ['outcomes', 'basis', 'binding', 'beyond'] },
    { key: 'evidence' },
    { key: 'licence', items: ['required', 'autoCheck', 'ownerCheck', 'foreign', 'responsibility'] },
    {
      key: 'owner',
      items: [
        'rightToRent',
        'papers',
        'truthful',
        'calendar',
        'respond',
        'handover',
        'noIdHold',
        'customerData',
        'withDriver',
      ],
    },
    { key: 'renter', items: ['lawfulUse', 'noSublet', 'care', 'fines', 'returnOnTime'] },
    { key: 'fees' },
    { key: 'tax' },
    { key: 'directBookings' },
    { key: 'content' },
    { key: 'liability' },
    { key: 'suspension' },
    { key: 'changes' },
    { key: 'law' },
  ],
  [LEGAL_DOC.MARKETPLACE_RULES]: [
    { key: 'principles' },
    {
      key: 'definitions',
      items: [
        'operator',
        'owner',
        'shop',
        'renter',
        'service',
        'marketplaceBooking',
        'directBooking',
      ],
    },
    { key: 'members', items: ['renter', 'individualOwner', 'shop', 'staff', 'refuse'] },
    { key: 'listing', items: ['documents', 'photos', 'review', 'rejection', 'update'] },
    {
      key: 'prohibited',
      items: [
        'noRight',
        'stolenPhotos',
        'falsePrice',
        'duplicate',
        'idHold',
        'circumvention',
        'fakeReviews',
        'transport',
        'unlawful',
        'harassment',
        'scraping',
      ],
    },
    { key: 'ranking' },
    {
      key: 'transaction',
      items: [
        'search',
        'request',
        'decision',
        'holdPayment',
        'bookingCreated',
        'handover',
        'completion',
      ],
    },
    { key: 'payment' },
    {
      key: 'handover',
      items: [
        'pickupOpen',
        'pickupRecord',
        'notReceived',
        'returnRecord',
        'notReturned',
        'unconfirmed',
      ],
    },
    {
      key: 'safety',
      items: ['identity', 'licence', 'vehicle', 'masking', 'officialPayment', 'insurance'],
    },
    { key: 'metrics' },
    { key: 'fees' },
    { key: 'technical' },
    {
      key: 'operator',
      items: ['refuse', 'adjust', 'verify', 'publish', 'records', 'support', 'data', 'authorities'],
    },
    { key: 'ownerRights', items: ['list', 'price', 'decide', 'payout', 'info', 'duties'] },
    { key: 'renterRights', items: ['info', 'costs', 'cancel', 'complain', 'data', 'duties'] },
    { key: 'violation', items: ['remind', 'hide', 'demote', 'suspend', 'terminate', 'report'] },
    { key: 'dispute' },
    { key: 'privacyRef' },
    { key: 'effect' },
  ],
  [LEGAL_DOC.PRIVACY]: [
    { key: 'scope' },
    {
      key: 'collected',
      items: [
        'account',
        'renter',
        'owner',
        'trip',
        'payment',
        'driver',
        'technical',
        'notCollected',
      ],
    },
    { key: 'sensitive' },
    {
      key: 'purpose',
      items: [
        'account',
        'booking',
        'payment',
        'legal',
        'safety',
        'insurance',
        'support',
        'improve',
        'marketing',
      ],
    },
    { key: 'consent', items: ['howGiven', 'marketing', 'withdraw', 'noConsentNeeded'] },
    {
      key: 'sharing',
      items: [
        'betweenParties',
        'drivers',
        'processors',
        'authorities',
        'misappropriation',
        'noSale',
      ],
    },
    { key: 'crossBorder' },
    { key: 'masking' },
    { key: 'retention', items: ['active', 'deletion', 'records', 'licence', 'marketing'] },
    { key: 'security', items: ['transport', 'session', 'hashing', 'privateStorage', 'access'] },
    {
      key: 'rights',
      items: [
        'know',
        'access',
        'correct',
        'delete',
        'restrict',
        'object',
        'portability',
        'withdraw',
        'complain',
      ],
    },
    { key: 'userDuties' },
    { key: 'risks' },
    { key: 'children' },
    { key: 'cookies' },
    { key: 'contact' },
    { key: 'changes' },
  ],
  [LEGAL_DOC.COMPLAINTS]: [
    { key: 'scope' },
    { key: 'channels', items: ['inApp', 'hotline', 'email', 'hours', 'emergency'] },
    { key: 'prepare', items: ['code', 'phone', 'evidence', 'request'] },
    { key: 'process', items: ['receive', 'verify', 'resolve', 'close'] },
    { key: 'timeline' },
    { key: 'verdict' },
    { key: 'holdMoney' },
    { key: 'outside' },
    { key: 'authorities' },
    { key: 'fraud' },
  ],
  [LEGAL_DOC.CANCELLATION]: [
    { key: 'principle' },
    /*
     * Ma trận huỷ chuyến dạng BẢNG — cùng cách Mioto đặt bảng "thời điểm huỷ / phí huỷ" lên đầu
     * chính sách: người đọc tìm đúng một dòng của mình, phần chữ bên dưới giải thích từng dòng.
     */
    {
      key: 'summary',
      table: {
        columns: ['case', 'renter', 'owner', 'platform'],
        rows: [
          'beforeDecision',
          'unpaid',
          'freeCancel',
          'late',
          'noShow',
          'ownerCancel',
          'platformCancel',
          'driver',
          'earlyReturn',
        ],
      },
    },
    { key: 'beforeDecision' },
    /*
     * Cửa sổ ĐỘNG theo khoảng cách tới giờ nhận xe (ADR 0066): thanh toán 30% tính từ lúc nhận
     * chuyến và KHÔNG kẹp bởi giờ nhận xe (ADR 0107), huỷ miễn phí 20% tính từ lúc THANH TOÁN ĐỦ
     * và kẹp bởi giờ nhận xe (ADR 0072), sàn 15′. Luật tiền và chính sách công bố đi cùng một lần
     * phát hành.
     */
    {
      key: 'paymentWindow',
      items: ['payment', 'autoAccept', 'cancel', 'afterPickup', 'expiry'],
    },
    { key: 'freeCancel' },
    { key: 'afterFreeCancel', items: ['insurance', 'split', 'nature', 'noShow', 'direct'] },
    {
      key: 'ownerCancel',
      items: ['beforeDecision', 'beforePayment', 'afterBooking', 'duringTrip', 'claims'],
    },
    { key: 'driver' },
    { key: 'notReceived' },
    { key: 'earlyReturn' },
    { key: 'insurance' },
    { key: 'force' },
    {
      key: 'refund',
      items: ['wallet', 'waiting', 'immediate', 'hold', 'withdraw', 'promo', 'direct'],
    },
    { key: 'dispute' },
  ],
  [LEGAL_DOC.PAYMENT]: [
    { key: 'scope' },
    { key: 'methods', items: ['vietqr', 'gateways', 'noCard', 'noCash'] },
    {
      key: 'tripPayment',
      table: {
        columns: ['item', 'payee', 'when'],
        rows: [
          'platformFee',
          'rentPrepaid',
          'insurance',
          'promo',
          'rentRemaining',
          'delivery',
          'collateral',
        ],
      },
    },
    {
      key: 'confirmation',
      items: ['automatic', 'underpaid', 'overpaid', 'late', 'wrongContent'],
    },
    { key: 'ownerShare', items: ['completed', 'lateCancel', 'deductions'] },
    { key: 'wallet', items: ['nature', 'fiveNo', 'perAccount', 'history'] },
    {
      key: 'withdrawal',
      items: ['destination', 'verification', 'minimum', 'timeline', 'pending'],
    },
    { key: 'subscription', hiddenInApp: true },
    { key: 'invoices' },
    { key: 'safety' },
  ],
  [LEGAL_DOC.RENTAL_CONTRACT]: [
    { key: 'scope', items: ['bookingInfo', 'ownerPolicy', 'general', 'records'] },
    { key: 'parties' },
    { key: 'vehicle' },
    { key: 'handover', items: ['moment', 'record', 'check', 'evidence'] },
    { key: 'documents', items: ['original', 'noIdHold', 'collateral', 'returnCollateral'] },
    { key: 'use', items: ['lawful', 'driver', 'noSublet', 'limits', 'care'] },
    { key: 'return', items: ['onTime', 'record', 'late', 'early'] },
    { key: 'overdue', items: ['contact', 'report', 'noSelfHelp', 'data'] },
    { key: 'incident', items: ['safety', 'notify', 'police', 'damage', 'valuation', 'theft'] },
    { key: 'insurance' },
    { key: 'fines', items: ['liable', 'cooperate', 'impound', 'before'] },
    { key: 'withDriver' },
    { key: 'money' },
    { key: 'dispute' },
    { key: 'validity' },
  ],
  /*
   * Thứ tự đi theo câu hỏi của một chủ xe: vì sao bị trừ → mình có thuộc diện không → bao nhiêu
   * → tính trên khoản nào → lúc nào → huỷ thì sao → dưới ngưỡng thì sao → mình phải làm gì →
   * chứng từ. Số % ở mục `rates` là chính sách HIỆN HÀNH; đổi mức = phát hành chính sách phí mới
   * VÀ sửa văn bản này cùng đợt (dời `LEGAL_EFFECTIVE_FROM`).
   */
  [LEGAL_DOC.OWNER_TAX]: [
    { key: 'basis', items: ['nd117', 'nd68', 'nd141', 'platform'] },
    { key: 'who', items: ['individual', 'household', 'company', 'noProfile', 'track'] },
    { key: 'rates', items: ['selfDrive', 'longTerm', 'withDriver', 'snapshot'] },
    { key: 'base', items: ['included', 'excluded', 'rounding', 'direct'] },
    { key: 'timing', items: ['recorded', 'deducted', 'adjusted'] },
    { key: 'cancellation', items: ['beforeTrip', 'lateCompensation'] },
    // Ngưỡng 01 tỷ đồng/năm: NĐ 68/2026 sửa bởi NĐ 141/2026 (29/04/2026, áp dụng từ 01/01/2026).
    // Chính phủ đổi ngưỡng bằng nghị định (Luật 09/2026/QH16), nên mức này có thể đổi giữa năm.
    { key: 'threshold', items: ['amount', 'revenue', 'withholding', 'refund', 'above'] },
    { key: 'identity' },
    { key: 'certificate' },
    { key: 'statement' },
    { key: 'changes' },
  ],
  [LEGAL_DOC.SUBSCRIPTION]: [
    { key: 'scope' },
    { key: 'packages', items: ['byType', 'combination', 'quota', 'enterprise'] },
    { key: 'benefits' },
    { key: 'purchase' },
    { key: 'term' },
    { key: 'upgrade' },
    { key: 'expiry', items: ['grace', 'track', 'existing', 'records'] },
    { key: 'refund' },
    { key: 'verification' },
    { key: 'obligations' },
    { key: 'suspension' },
    { key: 'changes' },
  ],
};

/** Tên mục của một văn bản, phẳng — cho những chỗ chỉ cần danh sách khoá. */
export function legalSectionKeys(doc: LegalDoc): readonly string[] {
  return LEGAL_SECTIONS[doc].map((section) => section.key);
}

export const legalPath = {
  /** Trang chủ khu pháp lý — địa chỉ viện dẫn CẢ BỘ văn bản. */
  index: '/legal',
  doc: (doc: LegalDoc): string => `/legal/${doc}`,
};

/**
 * Slug mở được ở MỌI bề mặt — app native dùng hàm này để quyết định có mở `/legal/<slug>` hay
 * không, nên văn bản chỉ-web trả `false`.
 */
export function isLegalDoc(value: string): value is LegalDoc {
  return (LEGAL_DOC_VALUES as string[]).includes(value);
}

/** Slug web render được, gồm cả văn bản chỉ-web. */
export function isWebLegalDoc(value: string): value is LegalDoc {
  return (LEGAL_DOC_WEB_VALUES as string[]).includes(value);
}

/**
 * Các văn bản liệt kê cho một bề mặt: WebView của app khách bỏ văn bản chỉ-web, trình duyệt
 * thường thấy đủ.
 */
export function legalDocsFor(surface: { inCustomerApp: boolean }): readonly LegalDoc[] {
  return surface.inCustomerApp ? LEGAL_DOC_VALUES : LEGAL_DOC_WEB_VALUES;
}
