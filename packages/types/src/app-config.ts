/**
 * Cấu hình ứng dụng do NỀN TẢNG bật/tắt từ xa — kênh `GET /app-config/partner` (không realtime).
 *
 * `isPlanPromotionEnabled` của app Partner: khi bật, app hiện đường mua/gia hạn gói và XePrime gửi email
 * "Hướng dẫn đăng ký và gia hạn gói trên website" ở các mốc của vòng đời gói. Tắt ⇒ không một
 * email nào được xếp hàng. Bản ghi là MỘT dòng theo khoá (`platform_app_configs.key`), `version`
 * tăng mỗi lần đổi để client so sánh rẻ.
 */

export const APP_CONFIG_KEY = {
  PARTNER: 'partner',
} as const;
export type AppConfigKey = (typeof APP_CONFIG_KEY)[keyof typeof APP_CONFIG_KEY];

/**
 * Đường dẫn trang mua/gia hạn gói của site partner, KHÔNG gồm tiền tố khu — server ghép sau
 * `WEB_PARTNER_URL` cho link trong email hướng dẫn gói; web dựng `ROUTES.MANAGE.SUBSCRIPTION` từ CHÍNH
 * hằng này (trang đó chuyển tiếp về đúng mục "Gói" theo tuyến của tài khoản).
 */
export const PARTNER_PLAN_PURCHASE_PATH = '/subscription';

/** Trang hỗ trợ của site partner — đích nút "Liên hệ tư vấn" của bậc bán bằng tư vấn trong email. */
export const PARTNER_SUPPORT_PATH = '/support';

/** Thư mục icon PNG dùng trong email, phục vụ tĩnh bởi web (`apps/web/public/email`). */
export const EMAIL_ASSET_PATH = '/email';


// ── Hàng đợi email (outbox) ────────────────────────────────────────────────────────────────

export const EMAIL_OUTBOX_STATUS = {
  PENDING: 'pending',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
} as const;
export type EmailOutboxStatus = (typeof EMAIL_OUTBOX_STATUS)[keyof typeof EMAIL_OUTBOX_STATUS];
export const EMAIL_OUTBOX_STATUS_VALUES = Object.values(EMAIL_OUTBOX_STATUS) as EmailOutboxStatus[];

export const EMAIL_OUTBOX_KIND = {
  /** "Hướng dẫn đăng ký và gia hạn gói trên website". */
  PLAN_GUIDE: 'plan_guide',
  /** Thư thử của admin — tới CHÍNH email admin, dựng bằng mẫu chỉ định (`payload.templateId`). */
  PLAN_GUIDE_TEST: 'plan_guide_test',
} as const;
export type EmailOutboxKind = (typeof EMAIL_OUTBOX_KIND)[keyof typeof EMAIL_OUTBOX_KIND];
export const EMAIL_OUTBOX_KIND_VALUES = Object.values(EMAIL_OUTBOX_KIND) as EmailOutboxKind[];

/** Số lần thử tối đa trước khi một thư nằm `failed` chờ người xem. */
export const EMAIL_OUTBOX_MAX_ATTEMPTS = 5;

/** Mã `audit_logs.action` của cấu hình app. */
export const APP_CONFIG_AUDIT_ACTION = {
  UPDATE: 'app_config.update',
} as const;

/** Mã `audit_logs.action` của mẫu email hướng dẫn gói. */
export const PLAN_GUIDE_TEMPLATE_AUDIT_ACTION = {
  CREATE: 'plan_guide_template.create',
  UPDATE: 'plan_guide_template.update',
  DUPLICATE: 'plan_guide_template.duplicate',
  /** Đổi bộ mẫu đang dùng. */
  ACTIVATE: 'plan_guide_template.activate',
  DELETE: 'plan_guide_template.delete',
  SEND_TEST: 'plan_guide_template.send_test',
} as const;

/** Lý do gửi email hướng dẫn gói — cũng là phần cuối của khoá chống trùng. */
export const PLAN_GUIDE_REASON = {
  /** Vừa đăng ký gian hàng tuyến gói (`onboarding_state = package_pending`). */
  REGISTERED: 'registered',
  /** Gửi yêu cầu tư vấn gói từ app. */
  CONSULTATION: 'consultation',
  /** Gói còn ≤ 7 ngày. */
  EXPIRING: 'expiring',
  /** Đúng ngày hết hạn. */
  EXPIRED: 'expired',
  /** Đang trong ân hạn. */
  GRACE: 'grace',
} as const;
export type PlanGuideReason = (typeof PLAN_GUIDE_REASON)[keyof typeof PLAN_GUIDE_REASON];
export const PLAN_GUIDE_REASON_VALUES = Object.values(PLAN_GUIDE_REASON) as PlanGuideReason[];

/**
 * Nội dung trong MỘT bộ mẫu email hướng dẫn gói. Bộ mẫu đang dùng áp cho mọi thư; hệ thống chọn
 * nội dung theo lý do gửi qua `PLAN_GUIDE_REASON_VARIANT` — admin không gán tay.
 */
export const PLAN_GUIDE_VARIANT = {
  /** Đăng ký gian hàng tuyến gói + liên hệ tư vấn: giới thiệu gói và cách mua trên web. */
  WELCOME: 'welcome',
  /** Gói còn ≤ 7 ngày. */
  EXPIRING: 'expiring',
  /** Đúng ngày hết hạn. */
  EXPIRED: 'expired',
  /** Đang trong ân hạn. */
  GRACE: 'grace',
} as const;
export type PlanGuideVariant = (typeof PLAN_GUIDE_VARIANT)[keyof typeof PLAN_GUIDE_VARIANT];
export const PLAN_GUIDE_VARIANT_VALUES = Object.values(PLAN_GUIDE_VARIANT) as PlanGuideVariant[];

/** Lý do gửi → nội dung trong bộ mẫu. Bảng thuần, dùng chung API/worker/web. */
export const PLAN_GUIDE_REASON_VARIANT: Readonly<Record<PlanGuideReason, PlanGuideVariant>> = {
  [PLAN_GUIDE_REASON.REGISTERED]: PLAN_GUIDE_VARIANT.WELCOME,
  [PLAN_GUIDE_REASON.CONSULTATION]: PLAN_GUIDE_VARIANT.WELCOME,
  [PLAN_GUIDE_REASON.EXPIRING]: PLAN_GUIDE_VARIANT.EXPIRING,
  [PLAN_GUIDE_REASON.EXPIRED]: PLAN_GUIDE_VARIANT.EXPIRED,
  [PLAN_GUIDE_REASON.GRACE]: PLAN_GUIDE_VARIANT.GRACE,
};

/** Lý do mẫu cho `{{reason}}` khi xem trước / gửi thử MỘT nội dung (lý do đầu tiên ánh xạ tới nó). */
export function planGuideSampleReason(variant: PlanGuideVariant): PlanGuideReason {
  return PLAN_GUIDE_REASON_VALUES.find((r) => PLAN_GUIDE_REASON_VARIANT[r] === variant) ?? PLAN_GUIDE_REASON.REGISTERED;
}

/**
 * Khoá chống trùng của email hướng dẫn gói — UNIQUE ở `email_outbox.dedupe_key`. Dùng CHUNG cho
 * API và worker: một mốc của một thuê bao chỉ xếp hàng MỘT lần, do DB gác chứ không do app.
 */
export function planGuideDedupeKey(
  reason: PlanGuideReason,
  ref: {
    tenantId?: string | undefined;
    subscriptionId?: string | undefined;
    userId?: string | undefined;
    vnDayKey?: string | undefined;
  },
): string {
  switch (reason) {
    case PLAN_GUIDE_REASON.REGISTERED:
      return `plan_guide:tenant:${ref.tenantId ?? ''}:${reason}`;
    case PLAN_GUIDE_REASON.CONSULTATION:
      // MỘT thư mỗi TÀI KHOẢN mỗi ngày (giờ VN) — DB chặn spam bằng chính UNIQUE này.
      return `plan_guide:consultation:${ref.userId ?? ''}:${ref.vnDayKey ?? ''}`;
    default:
      return `plan_guide:sub:${ref.subscriptionId ?? ''}:${reason}`;
  }
}

/** Payload lưu trong `email_outbox.payload_json` cho thư hướng dẫn gói. */
export interface PlanGuideEmailPayload {
  reason: PlanGuideReason;
  displayName: string | null;
  tenantId: string | null;
  subscriptionId: string | null;
  /** ISO — chỉ có ở các mốc của thuê bao. */
  endsAt: string | null;
  /** Tên gian hàng (nếu đã có). */
  shopName?: string | null;
  /** Chỉ thư thử: bộ mẫu cần dựng; thư thật dùng bộ mẫu ĐANG DÙNG đọc lúc gửi. */
  templateId?: string | null;
  /** Chỉ thư thử: nội dung cần dựng; thư thật suy từ `reason` (PLAN_GUIDE_REASON_VARIANT). */
  variant?: PlanGuideVariant | null;
}

// ── Mẫu email hướng dẫn gói do ADMIN quản lý (`plan_guide_email_templates`) ────────────────


/**
 * Biến thay thế trong tiêu đề/thân mẫu, dạng `{{name}}`. Server dựng giá trị và ESCAPE mọi giá trị
 * do người dùng nhập; `planTable` là khối HTML do server dựng (không chứa dữ liệu thô).
 */
export const PLAN_GUIDE_PLACEHOLDER = {
  RECIPIENT_NAME: 'recipientName',
  SHOP_NAME: 'shopName',
  PLAN_TABLE: 'planTable',
  PURCHASE_URL: 'purchaseUrl',
  HOTLINE: 'hotline',
  ZALO: 'zalo',
  /**
   * Link "Liên hệ tư vấn": `https://zalo.me/<số>` dựng từ Zalo admin khai (`zaloHref`); chưa khai
   * hoặc số không hợp lệ ⇒ trang hỗ trợ của site partner. Luôn có giá trị.
   */
  ZALO_URL: 'zaloUrl',
  EXPIRES_AT: 'expiresAt',
  /** Số ngày nhắc trước hạn — `SUBSCRIPTION_RENEWAL_REMINDER_DAYS` (cùng hằng worker dùng để quyết định gửi). */
  REMINDER_DAYS: 'reminderDays',
  /** Số ngày ân hạn của gói (`limits_json.graceDays`); thư không có thuê bao: bậc đề xuất. Trống khi 0/không có. */
  GRACE_DAYS: 'graceDays',
  /** Ngày hết ân hạn = `ends_at` + `graceDays` — chỉ khi thư gắn với một thuê bao. */
  GRACE_ENDS_AT: 'graceEndsAt',
  /** Phí dịch vụ mỗi chuyến của tuyến HOA HỒNG — `fee_policies` bản đang hiệu lực. Trống khi chưa có bản nào. */
  COMMISSION_PERCENT: 'commissionPercent',
  /** Phí dịch vụ mỗi chuyến của tuyến GÓI — cùng luật `tripServiceFeePercent` (ADR 0029 điều 2). */
  PACKAGE_COMMISSION_PERCENT: 'packageCommissionPercent',
  REASON: 'reason',
  /** Gốc tuyệt đối của icon PNG email (`<web>/email`) — vd `{{assetBase}}/phone.png`. */
  ASSET_BASE: 'assetBase',
} as const;
export type PlanGuidePlaceholder =
  (typeof PLAN_GUIDE_PLACEHOLDER)[keyof typeof PLAN_GUIDE_PLACEHOLDER];
export const PLAN_GUIDE_PLACEHOLDER_VALUES = Object.values(
  PLAN_GUIDE_PLACEHOLDER,
) as PlanGuidePlaceholder[];

/** Mã mẫu: chữ thường, số, gạch dưới/ngang — unique trong các mẫu chưa xoá. */
export const PLAN_GUIDE_TEMPLATE_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,59}$/;
export const PLAN_GUIDE_TEMPLATE_SUBJECT_MAX = 200;
/** Trần thân HTML — email > 100KB bị Gmail cắt. */
export const PLAN_GUIDE_TEMPLATE_BODY_MAX = 100_000;

/**
 * Hotline/Zalo tư vấn: 6–20 ký tự, bắt đầu bằng `+` hoặc chữ số, phần sau chỉ chữ số/cách/chấm/
 * gạch ngang. Dùng CHUNG cho DTO API và form admin để hai bên không lệch luật.
 */
export const APP_CONFIG_CONTACT_PHONE_PATTERN = /^[+0-9][0-9 .-]{5,19}$/;
export const APP_CONFIG_CONTACT_PHONE_MAX = 20;
