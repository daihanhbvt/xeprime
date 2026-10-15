import type { AppLocale } from '@xeprime/types';
import { escapeHtml, formatPercent, type RenderedEmail } from './plan-guide-email';

/**
 * Thư CHÀO MỪNG chủ xe tuyến hoa hồng vừa đăng ký (`email_outbox` loại `partner_welcome`).
 *
 * Hàm thuần — không DB, không Nest. Nội dung dựng bằng mã (vi/en), không qua mẫu admin. Thư cũng
 * GIỚI THIỆU GÓI gian hàng (bảng giá dựng bằng `buildPlanTableHtml`, chung với thư gói) nên đi sau cờ
 * `isPlanPromotionEnabled` ở bước xếp hàng.
 */
export interface PartnerWelcomeRenderInput {
  locale: AppLocale;
  displayName: string | null;
  shopName: string | null;
  /** Số chuyến đầu không tính phí dịch vụ (`FREE_TRIP_ALLOWANCE`). */
  freeTrips: number;
  /** Phí dịch vụ tuyến hoa hồng mỗi chuyến; `null` ⇒ không in số. */
  commissionPercent: number | null;
  listVehicleUrl: string;
  contactUrl: string;
  hotline: string | null;
  /** Hoa hồng XePrime mỗi chuyến của tuyến gói (luật tuyến — thường 0). */
  packageCommissionPercent: number | null;
  /** Khối bảng giá gói đã dựng sẵn (`buildPlanTableHtml`) — HTML do server dựng, không chứa dữ liệu thô. */
  planTableHtml: string;
  purchaseUrl: string;
}

interface Copy {
  subject: string;
  greeting: (name: string) => string;
  lead: (shop: string) => string;
  stepsTitle: string;
  steps: string[];
  fee: (freeTrips: number, percent: string) => string;
  cta: string;
  planTitle: string;
  planBody: (packagePercent: string) => string;
  planCta: string;
  help: (hotline: string | null) => string;
  friend: string;
  intlLocale: string;
}

const COPY: Readonly<Record<AppLocale, Copy>> = {
  vi: {
    subject: 'Chào mừng bạn đến với XePrime — đăng chiếc xe đầu tiên',
    greeting: (name) => `Chào ${name},`,
    lead: (shop) =>
      `Cảm ơn bạn đã đăng ký chủ xe <strong>${shop}</strong> trên XePrime. Tài khoản đã sẵn sàng — bạn có thể đăng xe và nhận khách ngay.`,
    stepsTitle: 'Bắt đầu trong ba bước',
    steps: [
      'Đăng chiếc xe đầu tiên: ảnh, giá thuê, khu vực giao xe.',
      'XePrime duyệt tin, xe lên chợ để khách tìm thấy.',
      'Nhận yêu cầu đặt xe, duyệt và giao xe cho khách.',
    ],
    fee: (freeTrips, percent) =>
      `${freeTrips} chuyến đầu tiên không tính phí dịch vụ. Từ chuyến tiếp theo, XePrime thu phí dịch vụ${percent ? ` ${percent}` : ''} trên mỗi chuyến hoàn thành — không có phí thuê bao.`,
    cta: 'Đăng xe ngay',
    planTitle: 'Có nhiều xe? Nâng lên gói gian hàng',
    planBody: (p) =>
      `Gói gian hàng tính hoa hồng XePrime${p ? ` ${p}` : ''} mỗi chuyến thay cho phí dịch vụ theo chuyến, kèm bộ quản lý đầy đủ: lịch xe, đơn thuê, thu chi, nhân viên. Chọn gói và thanh toán trên website đối tác — gói tự kích hoạt khi tiền về.`,
    planCta: 'Xem các gói',
    help: (hotline) =>
      `Cần hỗ trợ? Gửi yêu cầu ở trang hỗ trợ${hotline ? ` hoặc gọi ${hotline}` : ''}.`,
    friend: 'bạn',
    intlLocale: 'vi-VN',
  },
  en: {
    subject: 'Welcome to XePrime — list your first vehicle',
    greeting: (name) => `Hi ${name},`,
    lead: (shop) =>
      `Thank you for registering <strong>${shop}</strong> as a vehicle owner on XePrime. Your account is ready — you can list vehicles and take bookings right away.`,
    stepsTitle: 'Get started in three steps',
    steps: [
      'List your first vehicle: photos, rental price, delivery area.',
      'XePrime reviews the listing and puts it on the marketplace.',
      'Receive booking requests, approve them and hand over the vehicle.',
    ],
    fee: (freeTrips, percent) =>
      `Your first ${freeTrips} trips carry no service fee. After that, XePrime charges a${percent ? ` ${percent}` : ''} service fee on each completed trip — no subscription fee.`,
    cta: 'List a vehicle',
    planTitle: 'Have more vehicles? Upgrade to a shop plan',
    planBody: (p) =>
      `A shop plan charges${p ? ` ${p}` : ''} XePrime commission per trip instead of the per-trip service fee, with the full management suite: vehicle calendar, bookings, finances, staff. Pick and pay for a plan on the partner website — it activates as soon as the payment arrives.`,
    planCta: 'See plans',
    help: (hotline) => `Need help? Send a request on the support page${hotline ? ` or call ${hotline}` : ''}.`,
    friend: 'there',
    intlLocale: 'en-US',
  },
};

export function renderPartnerWelcomeEmail(input: PartnerWelcomeRenderInput): RenderedEmail {
  const c = COPY[input.locale];
  const name = escapeHtml(input.displayName?.trim() || c.friend);
  const shop = escapeHtml(input.shopName?.trim() || input.displayName?.trim() || '');
  const percent = formatPercent(input.commissionPercent, c.intlLocale);
  const hotline = input.hotline ? escapeHtml(input.hotline) : null;
  const listUrl = escapeHtml(input.listVehicleUrl);
  const contactUrl = escapeHtml(input.contactUrl);
  const purchaseUrl = escapeHtml(input.purchaseUrl);
  const packagePercent = formatPercent(input.packageCommissionPercent, c.intlLocale);

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#2a2318;line-height:1.55">
      <h2 style="color:#a9761a;margin:0 0 16px">${escapeHtml(c.subject)}</h2>
      <p>${c.greeting(name)}</p>
      <p>${c.lead(shop)}</p>
      <h3 style="margin:24px 0 8px;font-size:16px">${escapeHtml(c.stepsTitle)}</h3>
      <ol style="padding-left:20px;margin:0">
        ${c.steps.map((s) => `<li style="margin-bottom:6px">${escapeHtml(s)}</li>`).join('')}
      </ol>
      <p style="background:#fbf5e8;border-radius:8px;padding:12px 14px;margin:20px 0">${escapeHtml(c.fee(input.freeTrips, percent))}</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${listUrl}" style="background:#d6a02c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(c.cta)}</a>
      </p>
      <h3 style="margin:32px 0 8px;font-size:16px">${escapeHtml(c.planTitle)}</h3>
      <p>${escapeHtml(c.planBody(packagePercent))}</p>
      <div style="margin:16px 0">${input.planTableHtml}</div>
      <p style="text-align:center;margin:20px 0 28px">
        <a href="${purchaseUrl}" style="border:1px solid #d6a02c;color:#a9761a;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(c.planCta)}</a>
      </p>
      <p style="color:#6f6450;font-size:13px"><a href="${contactUrl}" style="color:#a9761a">${escapeHtml(c.help(input.hotline))}</a></p>
    </div>`;

  const text = [
    c.subject,
    '',
    c.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    '',
    c.fee(input.freeTrips, percent),
    '',
    `${c.cta}: ${input.listVehicleUrl}`,
    '',
    c.planTitle,
    c.planBody(packagePercent),
    `${c.planCta}: ${input.purchaseUrl}`,
    '',
    c.help(hotline ? input.hotline : null),
  ].join('\n');

  return { subject: c.subject, html, text };
}
