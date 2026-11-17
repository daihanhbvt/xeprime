import {
  INSURANCE_ISSUE_ERROR,
  INSURANCE_PRODUCT_KIND,
  INSURANCE_PROVIDER,
  INSURANCE_TEST_CERTIFICATE_PREFIX,
} from '@xeprime/types';
import type {
  InsuranceLogger,
  InsurancePartner,
  IssuePolicyRequest,
  IssuePolicyResult,
} from './insurance-issue';
import {
  MIC_PATH,
  MIC_SUCCESS_CODE,
  MicClient,
  MicUnavailableError,
  type MicConfig,
  type MicIssued,
  type MicLookup,
} from './mic-client';

/**
 * Adapter THẬT của MIC — bảo hiểm vật chất xe theo chuyến, bộ API `xel_chuyen` (ADR 0088).
 *
 * Luồng chuẩn MIC xác nhận ngày 11/11/2026 và đã chạy trọn trên sandbox:
 *
 * ```text
 *   tra cứu id_tras ──(đã có)──► trả hợp đồng cũ (chống cấp đôi khi thử lại)
 *        │ chưa có
 *        ▼
 *   gửi 5 ảnh xe (open-api/upload-file, refer = id_tras) ─► gcn_vcx_validate ─► gcn_vcx
 *        ─► tra cứu lại lấy tình trạng (ttrang 4 = thành công vì ảnh đã gửi TRƯỚC khi cấp)
 * ```
 *
 * Ảnh là bộ 5 ảnh bắt buộc chủ xe đã tải lúc tạo xe — gửi lại cho MỖI hợp đồng, chủ xe không chụp
 * lại (MIC xác nhận một bộ ảnh dùng được cho nhiều hợp đồng của cùng một xe).
 *
 * Chỉ bán `vehicle_trip` (VCX). `IP` không bán qua MIC ở đợt này ⇒ `supportsKind` trả `false` và
 * cổng chào bán không hiện nó.
 */
export const MIC_VEHICLE_TYPE_SELF_DRIVE = 'M1.11';
export const MIC_USAGE_PURPOSE_COMMERCIAL = 'C';
/** Hiệu lực bắt đầu sau mốc giao xe 5 phút — MIC đòi giờ bắt đầu > hiện tại nếu cùng ngày. */
export const MIC_COVERAGE_START_DELAY_MS = 5 * 60 * 1000;
/** MIC giới hạn `id_tras` tối đa 20 ký tự. */
export const MIC_PARTNER_REF_MAX = 20;

const VN_TZ = 'Asia/Ho_Chi_Minh';
const MINUTE_MS = 60_000;

export class MicInsurancePartner implements InsurancePartner {
  readonly partnerName = 'Bảo hiểm Quân đội MIC';
  readonly configured = true;

  private readonly client: MicClient;

  constructor(
    config: MicConfig | MicClient,
    private readonly logger: InsuranceLogger,
  ) {
    this.client = config instanceof MicClient ? config : new MicClient(config);
  }

  supportsKind(kind: string): boolean {
    return kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP;
  }

  /** Tình trạng hợp đồng phía MIC (`ttrang`) theo mã giao dịch — ADR 0091 điều 7. */
  async lookupStatus(partnerRef: string): Promise<string | null> {
    const found = await this.client.lookup(partnerRef);
    return found?.ttrang ?? null;
  }

  async issue(request: IssuePolicyRequest): Promise<IssuePolicyResult> {
    if (!this.supportsKind(request.productKind)) {
      return reject(INSURANCE_ISSUE_ERROR.PARTNER_REJECTED, 'MIC chỉ bán bảo hiểm vật chất xe');
    }
    const ref = request.partnerRef;
    if (!ref || ref.length > MIC_PARTNER_REF_MAX) {
      return reject(INSURANCE_ISSUE_ERROR.INVALID_REQUEST, 'Thiếu mã giao dịch gửi MIC');
    }
    try {
      // 1. Thử lại sau một lần gọi mà phản hồi bị mất ⇒ MIC có thể đã cấp. Tra cứu trước.
      const existing = await this.client.lookup(ref);
      if (existing) return this.fromLookup(request, ref, existing, request.photosSent ?? false);

      const window = coverageWindow(request);
      const problem = missingFields(request) ?? window.problem;
      if (problem) return reject(INSURANCE_ISSUE_ERROR.INVALID_REQUEST, problem);

      // 2. Ảnh TRƯỚC khi cấp ⇒ hợp đồng ra tình trạng 4 ngay, không qua "chưa có ảnh".
      let photosSent = request.photosSent ?? false;
      if (!photosSent) {
        const sent = await this.uploadPhotos(ref, request.vehicle.photoUrls ?? []);
        if (sent !== true) return { ...sent, photosSent: false };
        photosSent = true;
      }

      // 3. Kiểm hồ sơ rồi cấp — cùng một thân.
      const body = contractBody(request, ref, window);
      const validated = await this.client.call('POST', MIC_PATH.VALIDATE, body);
      if (validated.status >= 500) {
        return unavailable(`MIC kiểm hồ sơ lỗi HTTP ${validated.status}`, photosSent);
      }
      if (validated.body.code !== MIC_SUCCESS_CODE) {
        return {
          ...reject(
            INSURANCE_ISSUE_ERROR.PARTNER_REJECTED,
            `MIC từ chối hồ sơ: ${validated.body.message ?? validated.body.code ?? 'không rõ'}`,
            sanitized('validate', validated.status, validated.body),
          ),
          photosSent,
        };
      }
      const issued = await this.client.call<MicIssued>('POST', MIC_PATH.ISSUE, body);
      if (issued.status >= 500) {
        // Có thể MIC đã cấp mà phản hồi hỏng — lần thử sau tra cứu trước nên không cấp đôi.
        return unavailable(`MIC cấp hợp đồng lỗi HTTP ${issued.status}`, photosSent);
      }
      if (issued.body.code !== MIC_SUCCESS_CODE || !issued.body.data?.contact_number) {
        return {
          ...reject(
            INSURANCE_ISSUE_ERROR.PARTNER_REJECTED,
            `MIC không cấp hợp đồng: ${issued.body.message ?? issued.body.code ?? 'không rõ'}`,
            sanitized('issue', issued.status, issued.body),
          ),
          photosSent,
        };
      }

      // 4. Tình trạng phía MIC — tra cứu lỗi không làm hỏng một hợp đồng đã cấp.
      let lookup: MicLookup | null = null;
      try {
        lookup = await this.client.lookup(ref);
      } catch {
        lookup = null;
      }
      const data = issued.body.data;
      return this.ok(request, {
        ref,
        contractNumber: String(data.contact_number),
        policyId: data.id_number != null ? String(data.id_number) : toId(lookup?.so_id),
        status: lookup?.ttrang ?? null,
        premium: data.total_fee ?? lookup?.ttoan ?? null,
        coverageFrom: window.from,
        coverageTo: window.to,
        photosSent,
        raw: { issue: data, lookup: lookup ? pickLookup(lookup) : null },
      });
    } catch (err) {
      if (err instanceof MicUnavailableError) return unavailable(err.message, request.photosSent);
      throw err;
    }
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  private async uploadPhotos(
    ref: string,
    urls: readonly string[],
  ): Promise<true | Extract<IssuePolicyResult, { ok: false }>> {
    for (const [index, url] of urls.entries()) {
      let file: { base64: string; extension: string };
      try {
        file = await fetchImage(url);
      } catch (err) {
        return unavailable(
          `Không tải được ảnh xe ${index + 1}: ${err instanceof Error ? err.message : String(err)}`,
          false,
        );
      }
      const res = await this.client.uploadPhoto(ref, file.extension, file.base64);
      if (res.status >= 500) {
        return unavailable(`MIC nhận ảnh ${index + 1} lỗi HTTP ${res.status}`, false);
      }
      if (res.body.code !== MIC_SUCCESS_CODE) {
        return reject(
          INSURANCE_ISSUE_ERROR.PARTNER_REJECTED,
          `MIC từ chối ảnh xe ${index + 1}: ${res.body.message ?? res.body.code ?? 'không rõ'}`,
          sanitized('upload', res.status, res.body),
        );
      }
    }
    this.logger.warn('insurance: đã gửi ảnh xe sang MIC', { partnerRef: ref, count: urls.length });
    return true;
  }

  private fromLookup(
    request: IssuePolicyRequest,
    ref: string,
    lookup: MicLookup,
    photosSent: boolean,
  ): IssuePolicyResult {
    const from = parseVnDateTime(lookup.ngay_hl, lookup.gio_hl);
    const to = parseVnDateTime(lookup.ngay_kt, lookup.gio_kt);
    return this.ok(request, {
      ref,
      contractNumber: String(lookup.so_hd),
      policyId: toId(lookup.so_id),
      status: lookup.ttrang ?? null,
      premium: lookup.ttoan ?? null,
      coverageFrom: from,
      coverageTo: to,
      photosSent,
      raw: { recoveredByLookup: true, lookup: pickLookup(lookup) },
    });
  }

  private ok(
    request: IssuePolicyRequest,
    v: {
      ref: string;
      contractNumber: string;
      policyId: string | null;
      status: string | null;
      premium: number | null;
      coverageFrom: Date | null;
      coverageTo: Date | null;
      photosSent: boolean;
      raw: unknown;
    },
  ): IssuePolicyResult {
    const isTest = this.client.sandbox;
    return {
      ok: true,
      // Sandbox: hợp đồng KHÔNG có hiệu lực ⇒ tiền tố TEST- (CHECK ở DB đi cùng cờ `is_test`).
      certificateNumber: `${isTest ? INSURANCE_TEST_CERTIFICATE_PREFIX : ''}${v.contractNumber}`,
      partnerProductCode: request.product?.partnerProductCode ?? 'MIC-VCX',
      isTest,
      partnerRef: v.ref,
      partnerContractNumber: v.contractNumber,
      ...(v.policyId ? { partnerPolicyId: v.policyId } : {}),
      ...(v.status ? { partnerStatus: v.status } : {}),
      ...(v.premium != null ? { partnerPremiumAmount: String(Math.round(v.premium)) } : {}),
      ...(v.coverageFrom ? { coverageFrom: v.coverageFrom } : {}),
      ...(v.coverageTo ? { coverageTo: v.coverageTo } : {}),
      photosSent: v.photosSent,
      raw: { partner: INSURANCE_PROVIDER.MIC, sandbox: isTest, ...(v.raw as object) },
    };
  }
}

// ── Dựng hợp đồng ───────────────────────────────────────────────────────────

interface CoverageWindow {
  from: Date;
  to: Date;
  problem: string | null;
}

/**
 * Thời hạn bảo hiểm: từ mốc giao xe + 5 phút (không sớm hơn hiện tại + 5 phút — thử lại muộn thì
 * hiệu lực cũng bắt đầu muộn theo) tới giờ trả xe. Làm tròn tới phút vì MIC nhận `HH:mm`.
 */
export function coverageWindow(
  request: IssuePolicyRequest,
  now: Date = new Date(),
): CoverageWindow {
  const handedOver = request.trip?.handedOverAt ?? now;
  const earliest = Math.max(handedOver.getTime(), now.getTime()) + MIC_COVERAGE_START_DELAY_MS;
  const from = new Date(Math.ceil(earliest / MINUTE_MS) * MINUTE_MS);
  const returnAt = request.trip?.returnAt ?? request.coverageTo;
  const to = new Date(Math.floor(returnAt.getTime() / MINUTE_MS) * MINUTE_MS);
  return {
    from,
    to,
    problem:
      to.getTime() > from.getTime() ? null : 'Đã quá giờ trả xe - không còn thời gian để bảo hiểm',
  };
}

function missingFields(request: IssuePolicyRequest): string | null {
  const v = request.vehicle;
  const missing: string[] = [];
  if (!v.registrationHolderName?.trim()) missing.push('tên chủ xe trên cà vẹt');
  if (!v.chassisNumber?.trim()) missing.push('số khung');
  if (!v.brand?.trim()) missing.push('hãng xe');
  if (!v.model?.trim()) missing.push('mẫu xe');
  if (!v.manufactureYear) missing.push('năm sản xuất');
  if (!v.seatCount) missing.push('số chỗ');
  if (!(Number(v.insuredValue) > 0)) missing.push('giá trị xe');
  if (!request.photosSent && (v.photoUrls?.length ?? 0) === 0) missing.push('ảnh xe');
  if (!request.customer.name.trim()) missing.push('tên khách thuê');
  if (!request.customer.address?.trim()) missing.push('địa chỉ khách thuê');
  return missing.length > 0 ? `Thiếu dữ liệu gửi MIC: ${missing.join(', ')}` : null;
}

function contractBody(request: IssuePolicyRequest, ref: string, window: CoverageWindow) {
  const v = request.vehicle;
  const c = request.customer;
  const insuredValue = Math.trunc(Number(v.insuredValue));
  const optional = (key: string, value: string | null | undefined) =>
    value && value.trim() ? { [key]: value.trim() } : {};
  return {
    id_tras: ref,
    contract_type: 'G',
    original_contract_number: null,
    payment_amount: Number(request.premiumAmount),
    contract_info: {
      start_date: vnDate(window.from),
      start_time: vnTime(window.from),
      end_date: vnDate(window.to),
      end_time: vnTime(window.to),
      ...optional('license_plate', v.plateNumber),
      chassis_number: v.chassisNumber?.trim(),
      ...optional('engine_number', v.engineNumber),
      manufacturer: v.brand?.trim().toUpperCase(),
      model: v.model?.trim(),
      manufacturing_year: String(v.manufactureYear),
      number_of_seats: v.seatCount,
      load_capacity: 0,
      drive_crew_count: 0,
      usage_purpose: MIC_USAGE_PURPOSE_COMMERCIAL,
      vehicle_type: MIC_VEHICLE_TYPE_SELF_DRIVE,
      coverage_scope: { tpl: 0, tpb: 0, vehicle_price: insuredValue, tv: insuredValue },
    },
    vehicle_owner_info: {
      customer_type: 'C',
      name: v.registrationHolderName?.trim(),
      ...optional('mobi', v.ownerPhone),
    },
    buyer_info: {
      buyer_type: 'C',
      name_buyer: c.name.trim(),
      address_buyer: c.address?.trim(),
      ...optional('mobi_buyer', c.phone),
      ...optional('email_buyer', c.email),
      ...optional('id_card_buyer', c.idNumber),
    },
    additional_data: [],
  };
}

// ── Tiện ích ────────────────────────────────────────────────────────────────

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: VN_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function vnParts(date: Date): Record<string, string> {
  return Object.fromEntries(PARTS.formatToParts(date).map((p) => [p.type, p.value]));
}

/** `dd/MM/yyyy` theo giờ Việt Nam. */
export function vnDate(date: Date): string {
  const p = vnParts(date);
  return `${p.day}/${p.month}/${p.year}`;
}

/** `HH:mm` theo giờ Việt Nam. */
export function vnTime(date: Date): string {
  const p = vnParts(date);
  return `${p.hour}:${p.minute}`;
}

/** `dd/MM/yyyy` + `HH:mm` (giờ Việt Nam, UTC+7 không DST) → Date. */
export function parseVnDateTime(date?: string | null, time?: string | null): Date | null {
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date ?? '');
  const t = /^(\d{2}):(\d{2})$/.exec(time ?? '00:00');
  if (!d || !t) return null;
  return new Date(Date.UTC(+d[3]!, +d[2]! - 1, +d[1]!, +t[1]! - 7, +t[2]!));
}

function toId(value: string | number | null | undefined): string | null {
  return value == null || value === '' ? null : String(value);
}

function pickLookup(l: MicLookup) {
  return {
    so_hd: l.so_hd ?? null,
    so_id: toId(l.so_id),
    ttrang: l.ttrang ?? null,
    ttoan: l.ttoan ?? null,
    ngay_hl: l.ngay_hl ?? null,
    gio_hl: l.gio_hl ?? null,
    ngay_kt: l.ngay_kt ?? null,
    gio_kt: l.gio_kt ?? null,
  };
}

/** Bằng chứng ghi DB — chỉ mã và câu báo, không bao giờ thân thô (an toàn kể cả khi MIC đổi). */
function sanitized(
  step: string,
  status: number,
  body: { code: string | null; message: string | null },
) {
  return { partner: INSURANCE_PROVIDER.MIC, step, status, code: body.code, message: body.message };
}

function reject(
  code: Extract<IssuePolicyResult, { ok: false }>['code'],
  message: string,
  raw?: unknown,
): Extract<IssuePolicyResult, { ok: false }> {
  return { ok: false, code, message, retryable: false, ...(raw === undefined ? {} : { raw }) };
}

function unavailable(
  message: string,
  photosSent?: boolean,
): Extract<IssuePolicyResult, { ok: false }> {
  return {
    ok: false,
    code: INSURANCE_ISSUE_ERROR.PARTNER_UNAVAILABLE,
    message,
    retryable: true,
    ...(photosSent ? { photosSent } : {}),
  };
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};
const IMAGE_MAX_BYTES = 15 * 1024 * 1024;

/** Tải một ảnh công khai của thư viện xe về base64. */
async function fetchImage(url: string): Promise<{ base64: string; extension: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  const fromUrl = /\.([a-z0-9]{3,4})(?:\?|$)/i.exec(url)?.[1]?.toLowerCase();
  const extension = IMAGE_EXTENSIONS[type] ?? (fromUrl === 'jpeg' ? 'jpg' : fromUrl) ?? 'jpg';
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0) throw new Error('ảnh rỗng');
  if (bytes.length > IMAGE_MAX_BYTES) throw new Error('ảnh quá lớn');
  return { base64: bytes.toString('base64'), extension };
}
