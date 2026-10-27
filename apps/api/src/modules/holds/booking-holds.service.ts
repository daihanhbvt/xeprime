import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { freezeInsuranceProducts, newId, Prisma, redeemPromoRedemption } from '@xeprime/prisma';
import {
  ALLOCATION_TARGET,
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BANK_DIRECTION,
  BOOKING_HOLD_OUTCOME,
  BANK_MATCH_STATUS,
  BANK_MATCH_TARGET_TYPE,
  BOOKING_HOLD_PURPOSE,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_DECISION_SOURCE,
  BOOKING_REQUEST_STATUS,
  DEPOSIT_COLLECTION_MODE,
  FEE_BEARER,
  FEE_BENEFICIARY,
  FEE_LINE,
  HOLD_PAYMENT_CHANNEL,
  HOLD_REFUND_REASON,
  HOLD_REFUND_STATUS,
  INSURANCE_POLICY_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  OCCUPANCY_SOURCE_TYPE,
  PAYMENT_ORDER_CREDITED_OUTCOMES,
  PRICE_ROW,
  TAX_WITHHOLDING_STATUS_UNPAID,
  WITHDRAWAL_STATUS_DISBURSED,
  BOOKING_HOLD_STATUS_AWAITING,
  HOLD_MAX_OPEN_PER_CUSTOMER,
  HOLD_MIN_USABLE_WINDOW_MINUTES,
  allocationTotals,
  customerHoldAllocation,
  freeCancelWindowFromPayment,
  hasFreeCancelWindow,
  holdWindowsFor,
  isHoldPastDue,
  maskAccountNumber,
  type AuditActorScope,
  type BookingPriceSnapshot,
  type FeeLineKey,
  type HoldPaymentChannel,
  type RentalTermsSnapshot,
  type PaginationMeta,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { newReferenceCode } from '../../common/reference-code';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { BookingsService } from '../bookings/bookings.service';
import { OccupancyService } from '../calendar/occupancy.service';
import { VehicleSettingsService } from '../vehicle-settings/vehicle-settings.service';
import { NotificationService } from '../notification/notification.service';
import { InsuranceReadService } from '../insurance/insurance-read.service';
import { TaxReadService } from '../tax/tax-read.service';
import {
  HoldSettlementService,
  allocationForHold,
  taxFromSnapshot,
} from './hold-settlement.service';
import {
  CustomerHoldDto,
  DailyReconciliationDto,
  HOLD_DEFAULT_LIMIT,
  HOLD_MAX_LIMIT,
  PlatformHoldDto,
  PlatformHoldListQueryDto,
  PlatformHoldRefundDto,
  PlatformHoldRefundListQueryDto,
  SaveBankBalanceDto,
} from './dto/hold.dto';
import { formatMoneyVndVi } from '@xeprime/domain';

/** Lịch đã chốt lúc duyệt — snapshot lên hold để lúc tiền về tạo đơn bằng đúng con số này. */
export interface HoldSchedule {
  pickupAt: Date;
  returnAt: Date;
  packageMonths: number | null;
}

export type HoldPaymentOutcome =
  | { outcome: 'hold_not_found' }
  | { outcome: 'hold_closed'; holdId: string; tenantId: string; status: string }
  | { outcome: 'partial'; holdId: string; tenantId: string; paid: string; amount: string }
  /**
   * Tiền về cho hold đã đủ (trả trùng). `refundRecorded`: phần thừa ĐÃ vào hàng đợi hoàn của hold
   * (`hold_refunds`). `false` khi hold đã có khoản hoàn đóng từ trước — khoản này không nằm ở hàng
   * đợi nào, người gọi phải đưa nó tới người xử lý.
   */
  | { outcome: 'already_paid'; holdId: string; tenantId: string; refundRecorded: boolean }
  /**
   * Tiền đã ĐỦ ⇒ có đơn ngay trong cùng transaction (ADR 0044): hold chỉ tồn tại sau khi chuyến
   * đã được nhận, nên không còn chặng "đã trả, chờ người nhận" nào (ADR 0055).
   */
  | { outcome: 'activated'; holdId: string; tenantId: string; bookingId: string };

const CUSTOMER_SELECT = {
  id: true,
  code: true,
  status: true,
  outcome: true,
  amount: true,
  paidAmount: true,
  expiresAt: true,
  freeCancelUntil: true,
  paidAt: true,
  allocationJson: true,
  /*
   * Mốc BẮT ĐẦU của cửa sổ huỷ miễn phí là `paid_at` (ADR 0072). `decided_at`/`createdAt` chỉ còn là
   * dự phòng cho hàng trả trước ADR 0072 mà thiếu `paid_at` — không có đường nào sinh ra hàng đó nữa.
   */
  createdAt: true,
  bookingRequest: { select: { decidedAt: true } },
  // Giờ nhận xe đã chốt — nuôi bản XEM TRƯỚC mốc huỷ miễn phí khi khách chưa trả đủ.
  scheduleJson: true,
  // Năm dòng tiền + tài trợ — nuôi `lateCancelRefundAmount` bằng ĐÚNG phép chia lượt huỷ thật dùng.
  depositAmount: true,
  serviceFeeAmount: true,
  ownerCommissionAmount: true,
  vehicleInsuranceAmount: true,
  personalInsuranceAmount: true,
  promoDiscountAmount: true,
  priceSnapshotJson: true,
  refund: {
    select: {
      id: true,
      status: true,
      reason: true,
      amount: true,
      bankAccountNumber: true,
      paidAt: true,
      bankReference: true,
    },
  },
} satisfies Prisma.BookingHoldSelect;

/**
 * Đầu vào của mốc huỷ miễn phí — giờ nhận xe đã chốt (`schedule_json`) và TRẦN của chính sách phí
 * đã đóng băng (`price_snapshot_json.fees.policy.freeCancelHours`). Đọc từ hold chứ không từ chính
 * sách HÔM NAY: admin đổi chính sách sau lúc duyệt không viết lại lời hứa của chuyến này (ADR 0024).
 */
function freeCancelInputsOf(hold: {
  priceSnapshotJson: Prisma.JsonValue;
  scheduleJson: Prisma.JsonValue;
}): { pickupAt: Date; freeCancelHours: number } {
  const snapshot = hold.priceSnapshotJson as unknown as BookingPriceSnapshot;
  const schedule = hold.scheduleJson as unknown as { pickupAt: string };
  return {
    pickupAt: new Date(schedule.pickupAt),
    freeCancelHours: snapshot.fees?.policy.freeCancelHours ?? 0,
  };
}

/**
 * Mốc huỷ miễn phí nhìn từ phía KHÁCH (ADR 0072).
 *
 *  - ĐÃ trả đủ (`paid_at`): mốc ĐÃ LƯU lúc tiền về — đồng hồ đang chạy.
 *  - CHƯA trả đủ: chưa có mốc nào được lưu. Trả bản XEM TRƯỚC "trả ngay bây giờ thì được huỷ miễn phí
 *    tới …" — server tính bằng đúng hàm lượt tiền về dùng, client không tự tính. `freeCancelUntil`
 *    vẫn mang một mốc (bản xem trước) để app đã phát hành — vốn đọc nó như mốc đã lưu — không vỡ.
 */
function customerFreeCancelView(row: {
  paidAt: Date | null;
  freeCancelUntil: Date | null;
  createdAt: Date;
  bookingRequest: { decidedAt: Date | null };
  priceSnapshotJson: Prisma.JsonValue;
  scheduleJson: Prisma.JsonValue;
}): {
  freeCancelUntil: string;
  freeCancelStarted: boolean;
  freeCancelMinutes: number;
  freeCancelAvailable: boolean;
} {
  if (row.paidAt && row.freeCancelUntil) {
    const startedAt = row.paidAt;
    return {
      freeCancelUntil: row.freeCancelUntil.toISOString(),
      freeCancelStarted: true,
      freeCancelMinutes: Math.max(
        0,
        Math.round((row.freeCancelUntil.getTime() - startedAt.getTime()) / 60_000),
      ),
      freeCancelAvailable: hasFreeCancelWindow(row.freeCancelUntil, startedAt),
    };
  }
  const now = new Date();
  const inputs = freeCancelInputsOf(row);
  if (Number.isNaN(inputs.pickupAt.getTime())) {
    // Hold thiếu giờ nhận đã chốt (dữ liệu tay) — không có gì để xem trước, nói "không có".
    return {
      freeCancelUntil: (row.freeCancelUntil ?? row.createdAt).toISOString(),
      freeCancelStarted: false,
      freeCancelMinutes: 0,
      freeCancelAvailable: false,
    };
  }
  const preview = freeCancelWindowFromPayment({ paidAt: now, ...inputs });
  return {
    freeCancelUntil: preview.freeCancelUntil.toISOString(),
    freeCancelStarted: false,
    freeCancelMinutes: Math.max(
      0,
      Math.round((preview.freeCancelUntil.getTime() - now.getTime()) / 60_000),
    ),
    freeCancelAvailable: hasFreeCancelWindow(preview.freeCancelUntil, now),
  };
}

const PLATFORM_SELECT = {
  id: true,
  code: true,
  tenantId: true,
  bookingRequestId: true,
  bookingId: true,
  status: true,
  outcome: true,
  amount: true,
  paidAmount: true,
  expiresAt: true,
  freeCancelUntil: true,
  paidAt: true,
  releasedAt: true,
  createdAt: true,
  purpose: true,
  depositAmount: true,
  serviceFeeAmount: true,
  ownerCommissionAmount: true,
  vehicleInsuranceAmount: true,
  personalInsuranceAmount: true,
  promoDiscountAmount: true,
  priceSnapshotJson: true,
  tenant: { select: { name: true } },
  vehicle: { select: { name: true } },
  bookingRequest: { select: { customerName: true } },
  booking: { select: { code: true } },
  refund: { select: { status: true } },
} satisfies Prisma.BookingHoldSelect;

/**
 * Khoản GIỮ CHỖ của tuyến hoa hồng — writer DUY NHẤT của `booking_holds` (R3, ADR 0028 điều 6–7).
 *
 * Vòng đời, và ai ghi bước nào:
 *
 *   chuyến ĐƯỢC NHẬN ─► `createForApprovedRequestWithinTx` (BookingRequestsService gọi)
 *        │               tạo hold `pending`, CHIẾM LỊCH (occupancy `booking_request`), báo khách
 *        ├─ tiền về ──► `applyBankPaymentWithinTx`         (SepayService / khớp tay gọi)
 *        │               thiếu → `underpaid` giữ mã; đủ → `paid` + TẠO ĐƠN cùng transaction
 *        ├─ khách huỷ ► `cancelForRequestWithinTx`         (CustomerTripsService gọi)
 *        └─ quá hạn ──► worker `booking-hold-expiry`        (SQL trần, cùng luật `isHoldPastDue`)
 *   đơn đổi trạng thái ──► `HoldSettlementService`          (kết cục + hoàn)
 *
 * Ba điều đóng đinh:
 *  1. **Không thu % trên báo giá tạm tính.** Hold chỉ sinh khi `snapshot.fees.holdAmount` khác
 *     null — `computeCustomerFees` đã trả null cho `estimateNote`. Không có đường vòng.
 *  2. **Đơn tạo lúc TIỀN VỀ, không phải lúc duyệt** — và tạo từ snapshot đã đóng băng trên hold,
 *     không tính lại theo policy mới (ADR 0024). Nhả lịch của yêu cầu rồi mới đặt lịch của đơn
 *     trong CÙNG transaction: `EXCLUDE USING gist` không cho hai khoảng của cùng xe chồng nhau.
 *  3. **Idempotent bằng điều kiện trong WHERE**, không bằng check đọc-rồi-ghi — đúng khuôn
 *     `BillingService.applyBankPaymentWithinTx` mà webhook đã kiểm chứng.
 */
@Injectable()
export class BookingHoldsService {
  private readonly logger = new Logger(BookingHoldsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly occupancy: OccupancyService,
    /** Thời gian chết của xe cộng vào lịch giữ chỗ (08/09/2026 — ADR 0006). */
    private readonly settings: VehicleSettingsService,
    private readonly settlement: HoldSettlementService,
    /** Chỉ để đọc tài khoản nhận tiền của nền tảng — một nguồn với màn mua gói. */
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    /** Phase 7: phần phí bảo hiểm đang giữ hộ, cho vế `custodied` của đối soát ba vế. */
    private readonly insurance: InsuranceReadService,
    /** Phase 8: phần thuế đã khấu trừ chưa nộp — cùng vế `custodied`. */
    private readonly tax: TaxReadService,
  ) {}

  // ── Tạo ──────────────────────────────────────────────────────────────────

  async createForApprovedRequestWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      requestId: string;
      vehicleId: string;
      vehicleName: string;
      customerUserId: string | null;
      schedule: HoldSchedule;
      snapshot: BookingPriceSnapshot;
      /**
       * Mốc "đặt xe thành công" — lúc chủ xe duyệt, hoặc lúc hệ thống tự nhận (ADR 0032 điều 2).
       *
       * CẢ HAI cửa sổ ĐỘNG (`holdWindowsFor` — hạn trả tiền và hạn huỷ miễn phí, co theo khoảng
       * cách tới giờ nhận xe, sàn 15′ trừ khi chính sách đặt trần 0 hoặc giờ nhận xe kẹp về 0 —
       * ADR 0066) đếm xuôi từ đây, nên
       * caller phải truyền ĐÚNG mốc đã ghi vào `booking_requests.decided_at` — hai mốc lệch nhau
       * là hai đồng hồ khác nhau cho cùng một chuyến.
       */
      acceptedAt: Date;
      /** `null` khi hệ thống tự động nhận chuyến — audit ghi `actorScope: system`. */
      actorUserId: string | null;
      /**
       * Chuyến này có thu CỌC qua XePrime không — ĐÚNG giá trị `DepositPolicyResolution.required`
       * đã dùng để tính khoản online của `snapshot.fees` (ADR 0064 điều 5).
       *
       * Có hold KHÔNG có nghĩa là có cọc: tuyến gói tắt công tắc vẫn có hold cho phần không phải
       * tiền chủ xe (`S + H + IV + IP + T`). Đóng băng ở đây để lượt tiền về ghi đúng
       * `bookings.deposit_collection_mode` — công tắc đổi sau lúc duyệt không viết lại câu trả
       * lời (ADR 0025 ràng buộc 4). Bắt buộc, không mặc định: mặc định `true` là nói thay caller
       * rằng XePrime đã giữ cọc của khách.
       */
      depositRequired: boolean;
    },
  ): Promise<{ id: string; code: string; amount: string; expiresAt: Date }> {
    const fees = input.snapshot.fees;
    if (!fees?.holdAmount) {
      // Bảo vệ lập trình: caller phải quyết định nhánh hold/không-hold TRƯỚC khi gọi vào đây.
      throw new Error('createForApprovedRequestWithinTx: snapshot không có holdAmount');
    }

    await this.assertHoldQuotaWithinTx(tx, input.customerUserId);

    /*
     * HẠN THANH TOÁN động theo `ΔT = pickupAt − acceptedAt` (ADR 0066 — `holdWindowsFor`):
     * `clamp(ΔT × 30%, 15′, holdPaymentWindowMinutes)`, đếm XUÔI từ `acceptedAt`, kẹp bởi giờ nhận,
     * được LƯU vào cột và không bao giờ tính lại lúc đọc.
     *
     * Mốc HUỶ MIỄN PHÍ KHÔNG được ghi ở đây (ADR 0072): trước khi khách trả đủ chưa có đơn nào để
     * huỷ và khách chưa mất đồng nào — không trả thì hết hạn là tự huỷ. Mốc đó tính từ `paidAt`
     * trong lượt tiền về đủ (`applyBankPaymentWithinTx`). `windows.freeCancelMinutes` chỉ còn đi
     * vào audit như mức "nếu trả ngay lúc được nhận".
     *
     * Hạn chuyển KHÔNG vượt quá giờ nhận xe: một hold còn "chờ tiền" sau khi xe đáng lẽ đã giao là
     * một chỗ bị khoá vô nghĩa. Phần còn lại quá ngắn để ai kịp mở app ngân hàng thì không phát QR
     * nữa — chuyến sát giờ phải đi đường thoả thuận trực tiếp, và người vừa bấm duyệt được nói đúng
     * câu đó qua `HOLD_WINDOW_TOO_SHORT`.
     *
     * ⚠️ Ngưỡng đọc từ `HOLD_MIN_USABLE_WINDOW_MINUTES`, KHÔNG gõ tay — cùng hằng làm sàn cho cửa sổ
     * động, nên không có chuyến nào được hứa một cửa sổ mà chính bước này từ chối.
     */
    const windows = holdWindowsFor({
      acceptedAt: input.acceptedAt,
      pickupAt: input.schedule.pickupAt,
      freeCancelHours: fees.policy.freeCancelHours,
      paymentWindowMinutes: fees.policy.holdPaymentWindowMinutes,
    });
    const { expiresAt } = windows;
    /*
     * Đo cửa sổ từ `acceptedAt` (mốc lượt duyệt vừa ghi, cùng transaction), KHÔNG từ `now`: sàn của
     * cửa sổ động ĐÚNG BẰNG ngưỡng này (15′ — ADR 0066), nên đo từ `now` (vài mili-giây sau
     * `acceptedAt`) sẽ từ chối mọi chuyến có ΔT ≤ 50′ dù cửa sổ đủ 15′ — và lệch với
     * `holdWindowsPreview.tooShort` mà màn duyệt đã cho người bấm xem.
     */
    if (
      expiresAt.getTime() - input.acceptedAt.getTime() <
      HOLD_MIN_USABLE_WINDOW_MINUTES * 60_000
    ) {
      throw new BadRequestException({
        code: API_ERROR_CODE.HOLD_WINDOW_TOO_SHORT,
        message:
          'Giờ nhận xe quá gần để kịp thu tiền giữ chỗ — liên hệ trực tiếp với khách để thoả thuận',
        details: {
          pickupAt: input.schedule.pickupAt.toISOString(),
          minWindowMinutes: HOLD_MIN_USABLE_WINDOW_MINUTES,
        },
      });
    }
    /*
     * NĂM DÒNG TIỀN của khoản giữ chỗ — `D + S + H + IV + IP` (luồng tiền v2 thêm `H`).
     *
     * Một hold chứa tiền của NHIỀU người, nên mỗi dòng phải mang tên người hưởng của nó:
     * `S` và `H` của XePrime (phí sàn phía khách, hoa hồng phía chủ xe), `D` của chủ xe, `IV`/`IP`
     * giữ hộ hãng bảo hiểm. Phần chênh do SÀN (`holdMinAmount` nâng tổng lên) nằm trong dòng CỌC,
     * không trong phí: sàn tồn tại để một lần chuyển khoản đáng công đối soát, và phần chênh đó vẫn
     * là tiền thuê của chủ xe chứ không phải doanh thu XePrime (ADR 0033 điều 4).
     */
    const lineAmount = (key: FeeLineKey): string =>
      fees.lines.find((l) => l.key === key)?.amount ?? '0';
    const serviceFeeAmount = lineAmount(FEE_LINE.SERVICE_FEE);
    const ownerCommissionAmount = lineAmount(FEE_LINE.OWNER_COMMISSION);
    const vehicleInsuranceAmount = lineAmount(FEE_LINE.VEHICLE_PROTECTION);
    const personalInsuranceAmount = lineAmount(FEE_LINE.TRIP_INSURANCE);
    /*
     * TÀI TRỢ mã khuyến mãi (ADR 0046 điều 4) — hiệu giữa QUYỀN LỢI và TIỀN MẶT.
     *
     * `holdAmount` là số khách chuyển (đã trừ tài trợ), còn năm dòng tiền vẫn phải mang quyền lợi
     * ĐẦY ĐỦ: chủ xe nhận đủ `D`, hãng bảo hiểm nhận đủ `IV + IP`. Nên cọc suy ra từ
     * `grossOnlineAmount` chứ không từ `holdAmount` — trừ tài trợ vào dòng cọc là bắt chủ xe
     * gánh khoản giảm giá của nền tảng.
     *
     * `CHECK booking_holds_money_lines_sum_check` gác đúng bất biến này:
     * `D + S + H + IV + IP − promo = amount`.
     */
    const promoDiscountAmount = fees.promoDiscountAmount;
    const depositAmount = String(
      Number(fees.grossOnlineAmount) -
        Number(serviceFeeAmount) -
        Number(ownerCommissionAmount) -
        Number(vehicleInsuranceAmount) -
        Number(personalInsuranceAmount),
    );
    if (Number(depositAmount) < 0) {
      // CHECK ở DB cũng chặn; nói rõ ở đây để lỗi không hiện thành một P2010 khó đọc.
      throw new Error(
        `createForApprovedRequestWithinTx: năm dòng tiền vượt quá grossOnlineAmount (${fees.grossOnlineAmount})`,
      );
    }
    const sponsorable =
      Number(depositAmount) + Number(serviceFeeAmount) + Number(ownerCommissionAmount);
    if (Number(promoDiscountAmount) > sponsorable) {
      // `CHECK booking_holds_promo_within_sponsorable_check` cũng chặn — nói rõ ở đây vì đây là
      // một bất biến NGHIỆP VỤ (không lấn vào tiền giữ hộ bảo hiểm), không phải một lỗi kiểu.
      throw new Error(
        `createForApprovedRequestWithinTx: tài trợ ${promoDiscountAmount} vượt phần tài trợ được (D + S + H)`,
      );
    }

    const allocation = [
      {
        key: FEE_LINE.DEPOSIT,
        beneficiary: FEE_BENEFICIARY.OWNER,
        bearer: FEE_BEARER.CUSTOMER,
        amount: depositAmount,
      },
      /*
       * Hoa hồng: XePrime hưởng, CHỦ XE chịu — nó là phần của chủ xe trong cọc mà sàn giữ lại
       * (`Sàn chuyển ví chủ xe = cọc − phí sàn − hoa hồng − bảo hiểm`).
       */
      {
        key: FEE_LINE.OWNER_COMMISSION,
        beneficiary: FEE_BENEFICIARY.PLATFORM,
        bearer: FEE_BEARER.OWNER,
        amount: ownerCommissionAmount,
      },
      /*
       * Dòng TÀI TRỢ nằm trong `allocation_json` để bảng giải thích đọc được "nền tảng đã bù
       * bao nhiêu" mà không phải trừ hai con số. Nó KHÔNG phải một phụ phí và không có trong
       * `fees.lines` — xem docblock `FEE_LINE.PROMO`.
       */
      {
        key: FEE_LINE.PROMO,
        beneficiary: FEE_BENEFICIARY.PLATFORM,
        bearer: FEE_BEARER.CUSTOMER,
        amount: promoDiscountAmount,
      },
      {
        key: FEE_LINE.SERVICE_FEE,
        beneficiary: FEE_BENEFICIARY.PLATFORM,
        bearer: FEE_BEARER.CUSTOMER,
        amount: serviceFeeAmount,
      },
      {
        key: FEE_LINE.VEHICLE_PROTECTION,
        beneficiary: FEE_BENEFICIARY.INSURER,
        bearer: FEE_BEARER.CUSTOMER,
        amount: vehicleInsuranceAmount,
      },
      {
        key: FEE_LINE.TRIP_INSURANCE,
        beneficiary: FEE_BENEFICIARY.INSURER,
        bearer: FEE_BEARER.CUSTOMER,
        amount: personalInsuranceAmount,
      },
    ].filter((line) => Number(line.amount) > 0);

    /*
     * Sản phẩm bảo hiểm khách đã chọn ĐÓNG BĂNG cùng giá, ngay lượt duyệt này (ADR 0024 · 0064):
     * khách trả sau đó tới 120 phút, và hợp đồng sinh lúc tiền về phải mang đúng tên/quyền lợi/
     * khấu trừ khách đã thấy — kể cả khi admin sửa hay tắt sản phẩm ở giữa.
     */
    const frozenSnapshot = await freezeInsuranceProducts(tx, input.snapshot);
    const id = newId();
    const code = await this.uniqueCode(tx);
    await tx.bookingHold.create({
      data: {
        id,
        code,
        tenantId: input.tenantId,
        bookingRequestId: input.requestId,
        customerUserId: input.customerUserId,
        vehicleId: input.vehicleId,
        purpose: BOOKING_HOLD_PURPOSE.COMMISSION,
        depositRequired: input.depositRequired,
        status: BOOKING_HOLD_STATUS.PENDING,
        amount: new Prisma.Decimal(fees.holdAmount),
        depositAmount: new Prisma.Decimal(depositAmount),
        serviceFeeAmount: new Prisma.Decimal(serviceFeeAmount),
        ownerCommissionAmount: new Prisma.Decimal(ownerCommissionAmount),
        vehicleInsuranceAmount: new Prisma.Decimal(vehicleInsuranceAmount),
        personalInsuranceAmount: new Prisma.Decimal(personalInsuranceAmount),
        promoDiscountAmount: new Prisma.Decimal(promoDiscountAmount),
        feePolicyId: fees.policy.policyId,
        allocationJson: allocation as unknown as Prisma.InputJsonValue,
        priceSnapshotJson: frozenSnapshot as unknown as Prisma.InputJsonValue,
        scheduleJson: {
          pickupAt: input.schedule.pickupAt.toISOString(),
          returnAt: input.schedule.returnAt.toISOString(),
          packageMonths: input.schedule.packageMonths,
        } as Prisma.InputJsonValue,
        // `freeCancelUntil` để NULL — ghi lúc tiền về đủ (ADR 0072).
        expiresAt,
      },
    });

    // CHIẾM LỊCH ngay từ lúc duyệt — nếu không, hai khách cùng được duyệt một chỗ và nền tảng
    // phải hoàn một người. Constraint DB là người gác; trùng thì ném 409 và cả lượt duyệt hỏng.
    await this.occupancy.reserve(tx, {
      tenantId: input.tenantId,
      vehicleId: input.vehicleId,
      sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST,
      sourceId: input.requestId,
      startAt: input.schedule.pickupAt,
      endAt: input.schedule.returnAt,
      bufferMinutes: await this.settings.turnaroundBufferFor(tx, input.vehicleId),
    });

    await this.audit.record(
      {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorScope: input.actorUserId ? AUDIT_ACTOR_SCOPE.TENANT : AUDIT_ACTOR_SCOPE.SYSTEM,
        action: 'booking_hold.create',
        targetType: 'booking_hold',
        targetId: id,
        after: {
          code,
          amount: fees.holdAmount,
          ...(Number(promoDiscountAmount) > 0
            ? { promoCode: fees.promo?.code ?? null, promoDiscountAmount }
            : {}),
          policyVersion: fees.policy.version,
          expiresAt: expiresAt.toISOString(),
          // Vì sao hạn ra con số này — cửa sổ động tính từ khoảng cách tới giờ nhận xe.
          leadMinutes: Math.round(windows.leadMinutes),
          paymentWindowMinutes: windows.paymentWindowMinutes,
        },
      },
      tx,
    );

    if (input.customerUserId) {
      await this.notifications.emitToUser(
        input.customerUserId,
        {
          type: NOTIFICATION_TYPE.HOLD_REQUESTED,
          title: 'Chuyến đã được nhận — thanh toán tiền giữ chỗ để chốt',
          body: `${input.vehicleName} · tiền giữ chỗ ${formatMoneyVndVi(fees.holdAmount.toString())} · nội dung ${code}`,
          tenantId: input.tenantId,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
          targetId: input.requestId,
        },
        tx,
      );
    }

    return { id, code, amount: fees.holdAmount, expiresAt };
  }

  /**
   * TRẦN SỐ CHỖ một khách giữ cùng lúc mà chưa trả tiền — `HOLD_MAX_OPEN_PER_CUSTOMER`.
   *
   * Không có trần thì một tài khoản mở được bao nhiêu yêu cầu cũng được, và mỗi lượt gian hàng
   * bấm duyệt khoá thêm một chiếc xe trong hai giờ. Đó không phải giả thuyết: nó là cách rẻ nhất
   * để làm tê liệt một gian hàng nhỏ trong một buổi sáng.
   *
   * ## Vì sao khoá tư vấn, không phải một câu `count` trần
   *
   * `READ COMMITTED` (mặc định của Postgres) cho hai transaction song song cùng đọc "đang có 2",
   * rồi cùng ghi — và trần 3 thành 4. Không có ràng buộc DB nào diễn đạt được "≤ 3 dòng thoả một
   * vị từ", nên thứ duy nhất còn lại là **tuần tự hoá theo KHÁCH**: `pg_advisory_xact_lock` trên
   * hash của `customerUserId`, tự nhả khi transaction kết thúc.
   *
   * Khoá theo KHÁCH chứ không theo bảng: hai khách khác nhau vẫn duyệt song song được, và một
   * khách thì không có lý do gì để duyệt song song với chính mình.
   *
   * ## Vì sao chặn ở đường DUYỆT, không ở đường gửi yêu cầu
   *
   * Gửi yêu cầu không khoá xe của ai (ADR 0044 điều 1) — chặn ở đó là chặn nhầm người. Chỗ tốn
   * kém là lúc một chiếc xe thật bị giữ, và đó chính là đây.
   *
   * Yêu cầu không có `customerUserId`: bỏ qua. Không phải một lỗ hổng — `submitPublic` chỉ nhận
   * tài khoản khách đã đăng nhập (ADR 0060) và luôn ghi cột này, nên đường công khai không sinh
   * ra hold nào thiếu nó. Nhánh `null` chỉ còn cho dữ liệu cũ.
   */
  private async assertHoldQuotaWithinTx(
    tx: Prisma.TransactionClient,
    customerUserId: string | null,
  ): Promise<void> {
    if (!customerUserId) return;

    // `hashtext` trả int4; `pg_advisory_xact_lock(key bigint)` nhận nó. Không gian khoá dùng
    // chung toàn database, nên tiền tố `hold:` giữ nó không đụng advisory lock của worker.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'hold:' + customerUserId}))`;

    const openHolds = await tx.bookingHold.count({ where: openCustomerHoldWhere(customerUserId) });
    if (openHolds >= HOLD_MAX_OPEN_PER_CUSTOMER) {
      throw new ConflictException({
        code: API_ERROR_CODE.HOLD_LIMIT_REACHED,
        message:
          'Khách này đang giữ tối đa số chỗ chưa thanh toán cho phép — chờ họ thanh toán hoặc ' +
          'huỷ bớt trước khi nhận thêm chuyến',
        details: { openHolds, limit: HOLD_MAX_OPEN_PER_CUSTOMER },
      });
    }
  }

  /**
   * CỔNG Ở ĐƯỜNG GỬI YÊU CẦU (13/10/2026) — khách đã giữ đủ `HOLD_MAX_OPEN_PER_CUSTOMER` chỗ chưa
   * trả thì KHÔNG gửi thêm yêu cầu nào, cho mọi xe, mọi dịch vụ.
   *
   * Trước đây trần chỉ chặn ở đường DUYỆT: yêu cầu vẫn vào, xe "Đặt ngay" lặng lẽ không tự nhận
   * được (`tryAutoAccept` nuốt `HOLD_LIMIT_REACHED`), khách thấy "chờ xác nhận" mà không biết vì
   * sao, và chủ xe bấm duyệt tay lại dính đúng lỗi đó. Việc cần làm thuộc về KHÁCH — trả tiền hoặc
   * huỷ bớt — nên câu trả lời phải đến với khách, ngay lúc họ gửi.
   *
   * Không khoá: cổng này là lời nhắc sớm, không phải bất biến. Bất biến vẫn là
   * `assertHoldQuotaWithinTx` dưới advisory lock ở đường tạo hold — hai lượt gửi song song cùng lọt
   * qua đây thì lượt DUYỆT thứ hai vẫn bị chặn đúng chỗ.
   */
  async assertBelowHoldQuota(customerUserId: string): Promise<void> {
    const openHolds = await this.prisma.bookingHold.count({
      where: openCustomerHoldWhere(customerUserId),
    });
    if (openHolds >= HOLD_MAX_OPEN_PER_CUSTOMER) {
      throw new ConflictException({
        code: API_ERROR_CODE.HOLD_LIMIT_REACHED,
        message:
          'Bạn đang có tối đa số chuyến chờ thanh toán cho phép — thanh toán hoặc huỷ bớt một chuyến ' +
          'trước khi đặt thêm xe',
        details: { openHolds, limit: HOLD_MAX_OPEN_PER_CUSTOMER },
      });
    }
  }

  /**
   * Những chuyến khách đang GIỮ mà chưa trả — nguồn của lời nhắc thanh toán (trang "Chuyến của tôi",
   * màn chặn đặt xe). CÙNG vị từ với trần, nên danh sách khách thấy luôn khớp con số đang chặn họ.
   * Gấp nhất trước; số dòng bị trần giữ nhỏ, `take` chỉ là lưới an toàn cho dữ liệu cũ vượt trần.
   */
  async listOpenForCustomer(customerUserId: string) {
    return this.prisma.bookingHold.findMany({
      where: openCustomerHoldWhere(customerUserId),
      orderBy: { expiresAt: 'asc' },
      take: OPEN_HOLD_LIST_MAX,
      select: {
        code: true,
        amount: true,
        paidAmount: true,
        expiresAt: true,
        bookingRequest: {
          select: {
            id: true,
            pickupAt: true,
            returnAt: true,
            vehicle: { select: { name: true, mainImageUrl: true } },
          },
        },
      },
    });
  }

  // ── Tiền về ──────────────────────────────────────────────────────────────

  /**
   * Áp một khoản tiền ngân hàng vào hold theo mã `XPH…` — TRONG cùng transaction với dòng
   * `bank_transactions` (ADR 0022 điều 2). Cùng khuôn với `BillingService.applyBankPaymentWithinTx`.
   *
   * Hold đã QUÁ HẠN (theo mốc, không theo cột status — worker có thể chưa kịp lật) không nhận
   * tiền: trả `hold_closed` để giao dịch nằm lại hàng đợi admin. Kích hoạt một hold đã chết là
   * đặt xe vào một chỗ khách khác có thể đã lấy.
   */
  async applyBankPaymentWithinTx(
    tx: Prisma.TransactionClient,
    args: { code: string; amount: Prisma.Decimal; providerTxId: string },
  ): Promise<HoldPaymentOutcome> {
    const hold = await tx.bookingHold.findUnique({
      where: { code: args.code.toUpperCase() },
      select: {
        id: true,
        tenantId: true,
        status: true,
        amount: true,
        expiresAt: true,
        customerUserId: true,
        priceSnapshotJson: true,
        scheduleJson: true,
      },
    });
    if (!hold) return { outcome: 'hold_not_found' };

    const awaiting: string[] = [BOOKING_HOLD_STATUS.PENDING, BOOKING_HOLD_STATUS.UNDERPAID];

    if (hold.status === BOOKING_HOLD_STATUS.PAID || hold.status === BOOKING_HOLD_STATUS.RELEASED) {
      // Tiền về lần nữa cho hold đã đủ: ghi làm bằng chứng + ghi yêu cầu hoàn phần thừa
      // (ADR 0022 điều 5 — giữ chỗ không có "kỳ sau").
      await tx.bookingHold.update({
        where: { id: hold.id },
        data: { paidAmount: { increment: args.amount } },
      });
      const refund = await this.settlement.upsertRefundWithinTx(tx, {
        holdId: hold.id,
        tenantId: hold.tenantId,
        customerUserId: hold.customerUserId,
        amount: args.amount,
        reason: HOLD_REFUND_REASON.OVERPAID,
        note: `Chuyển thừa (giao dịch ${args.providerTxId})`,
      });
      return {
        outcome: 'already_paid',
        holdId: hold.id,
        tenantId: hold.tenantId,
        refundRecorded: refund.recorded,
      };
    }
    if (!awaiting.includes(hold.status) || isHoldPastDue(hold.expiresAt)) {
      return {
        outcome: 'hold_closed',
        holdId: hold.id,
        tenantId: hold.tenantId,
        status: hold.status,
      };
    }

    const credited = await tx.bookingHold.updateMany({
      where: { id: hold.id, status: { in: awaiting } },
      data: { paidAmount: { increment: args.amount } },
    });
    if (credited.count === 0) {
      /*
       * Trạng thái vừa lật GIỮA `findUnique` và `increment` — hai giao dịch đủ tiền chạy song
       * song, hoặc worker vừa expire. `count = 0` nghĩa là tiền CHƯA được cộng vào đâu.
       *
       * Nhánh này từng trả thẳng `hold_closed`, và đó là một lỗ mất tiền: giao dịch vẫn nằm
       * trong `bank_transactions` (webhook đã ghi) nhưng hold không ghi nhận và không có yêu
       * cầu hoàn nào — đúng loại "bút toán mồ côi" mà gate R3 cấm. Hold đã trả đủ thì khoản này
       * là tiền THỪA, phải đi cùng đường với nhánh `PAID` ở trên.
       */
      const current = await tx.bookingHold.findUniqueOrThrow({
        where: { id: hold.id },
        select: { status: true },
      });
      if (
        current.status === BOOKING_HOLD_STATUS.PAID ||
        current.status === BOOKING_HOLD_STATUS.RELEASED
      ) {
        await tx.bookingHold.update({
          where: { id: hold.id },
          data: { paidAmount: { increment: args.amount } },
        });
        const refund = await this.settlement.upsertRefundWithinTx(tx, {
          holdId: hold.id,
          tenantId: hold.tenantId,
          customerUserId: hold.customerUserId,
          amount: args.amount,
          reason: HOLD_REFUND_REASON.OVERPAID,
          note: `Chuyển thừa (giao dịch ${args.providerTxId})`,
        });
        return {
          outcome: 'already_paid',
          holdId: hold.id,
          tenantId: hold.tenantId,
          refundRecorded: refund.recorded,
        };
      }
      return {
        outcome: 'hold_closed',
        holdId: hold.id,
        tenantId: hold.tenantId,
        status: current.status,
      };
    }
    const updated = await tx.bookingHold.findUniqueOrThrow({
      where: { id: hold.id },
      select: { paidAmount: true, amount: true },
    });

    if (updated.paidAmount.lt(updated.amount)) {
      await tx.bookingHold.updateMany({
        where: { id: hold.id, status: BOOKING_HOLD_STATUS.PENDING },
        data: { status: BOOKING_HOLD_STATUS.UNDERPAID },
      });
      return {
        outcome: 'partial',
        holdId: hold.id,
        tenantId: hold.tenantId,
        paid: updated.paidAmount.toString(),
        amount: updated.amount.toString(),
      };
    }

    /*
     * Tiền ĐỦ ⇒ đồng hồ HUỶ MIỄN PHÍ bắt đầu chạy từ đây (ADR 0072): `ΔT = pickupAt − paidAt`,
     * `clamp(ΔT × 20%, 15′, freeCancelHours)`, kẹp bởi giờ nhận xe. Ghi trong CHÍNH câu lật `paid`
     * — CHECK `booking_holds_paid_has_free_cancel` không cho một hold có `paid_at` mà thiếu mốc.
     */
    const paidAt = new Date();
    const freeCancel = freeCancelWindowFromPayment({ paidAt, ...freeCancelInputsOf(hold) });
    const claimed = await tx.bookingHold.updateMany({
      where: { id: hold.id, status: { in: awaiting } },
      data: {
        status: BOOKING_HOLD_STATUS.PAID,
        paidAt,
        freeCancelUntil: freeCancel.freeCancelUntil,
      },
    });
    if (claimed.count === 0) {
      // Tiền đã cộng vào hold nhưng không có yêu cầu hoàn nào cho phần này — người xử lý phải thấy.
      return {
        outcome: 'already_paid',
        holdId: hold.id,
        tenantId: hold.tenantId,
        refundRecorded: false,
      };
    }

    if (updated.paidAmount.gt(updated.amount)) {
      await this.settlement.upsertRefundWithinTx(tx, {
        holdId: hold.id,
        tenantId: hold.tenantId,
        customerUserId: hold.customerUserId,
        amount: updated.paidAmount.sub(updated.amount),
        reason: HOLD_REFUND_REASON.OVERPAID,
        note: `Chuyển thừa (giao dịch ${args.providerTxId})`,
      });
    }

    const bookingId = await this.settleFullPaymentWithinTx(tx, hold.id, args.providerTxId);
    return { outcome: 'activated', holdId: hold.id, tenantId: hold.tenantId, bookingId };
  }

  /**
   * Tiền ĐỦ ⇒ **ĐƠN THUÊ** — đây là điểm duy nhất trong hệ thống biến một chuyến thành đơn
   * (ADR 0044 điều 2). Không phải một cú bấm trên giao diện, không phải một lượt quét QR.
   *
   * Hold chỉ tồn tại sau khi chuyến ĐÃ được nhận, và DB bảo đảm điều đó: CHECK
   * `booking_requests_awaiting_hold_decided` không cho một yêu cầu ở `awaiting_hold` thiếu
   * `decided_at` (ADR 0055). Nên tiền về là mở đơn ngay, không hỏi lại ai — bắt gian hàng duyệt
   * lần thứ hai cho một chuyến họ đã đồng ý và khách đã trả tiền là một bước không ai hiểu nổi.
   *
   * Yêu cầu đi THẲNG `awaiting_hold → converted_to_booking`. Trước ADR 0055 nó đi vòng qua
   * `hold_paid` — chặng của luồng thu-trước-duyệt ADR 0039 — và bước vòng đó ghi đè ba cột
   * quyết định bằng dấu của HỆ THỐNG: tên người đã duyệt bị xoá, thời gian phản hồi bị đo tới lúc
   * tiền về, và một chuyến chủ xe tự tay nhận bị kể lại thành "Đặt ngay".
   */
  private async settleFullPaymentWithinTx(
    tx: Prisma.TransactionClient,
    holdId: string,
    providerTxId: string,
  ): Promise<string> {
    const hold = await tx.bookingHold.findUniqueOrThrow({
      where: { id: holdId },
      select: {
        id: true,
        code: true,
        tenantId: true,
        bookingRequestId: true,
        customerUserId: true,
        depositRequired: true,
        priceSnapshotJson: true,
        scheduleJson: true,
        paidAmount: true,
        bookingRequest: {
          select: {
            id: true,
            vehicleId: true,
            customerName: true,
            customerPhone: true,
            serviceType: true,
            routeType: true,
            pickupAddress: true,
            destination: true,
            tenantCustomerId: true,
            decidedBy: true,
            decisionSource: true,
            rentalTerms: true,
            vehicle: { select: { name: true } },
          },
        },
      },
    });
    const req = hold.bookingRequest;
    const snapshot = hold.priceSnapshotJson as unknown as BookingPriceSnapshot;
    const schedule = hold.scheduleJson as unknown as {
      pickupAt: string;
      returnAt: string;
      packageMonths: number | null;
    };

    await this.occupancy.release(tx, OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST, req.id);

    // Người "tạo" đơn là người đã DUYỆT — quyết định của họ sinh ra đơn này; khách chỉ chuyển tiền.
    // Yêu cầu do HỆ THỐNG tự nhận ("Đặt ngay") không có ai duyệt: `decided_by` NULL ⇒ đơn cũng không
    // có người tạo.
    const booking = await this.bookings.createWithinTx(
      tx,
      hold.tenantId,
      req.decidedBy ?? null,
      {
        vehicleId: req.vehicleId,
        customerName: req.customerName,
        customerPhone: req.customerPhone,
        pickupAt: schedule.pickupAt,
        returnAt: schedule.returnAt,
        longTermPackageMonths: schedule.packageMonths ?? undefined,
        serviceType: req.serviceType,
        routeType: req.routeType ?? undefined,
        pickupAddress: req.pickupAddress ?? undefined,
        destination: req.destination ?? undefined,
        baseAmount: rowAmount(snapshot, PRICE_ROW.BASE),
        discountAmount: rowAmountAbs(snapshot, PRICE_ROW.DISCOUNT),
        deliveryFee: rowAmount(snapshot, PRICE_ROW.DELIVERY),
        depositAmount: snapshot.depositAmount,
      },
      'from_request',
      snapshot,
      req.tenantCustomerId,
      {
        // Điều kiện thuê đã đóng băng trên yêu cầu — copy nguyên sang đơn (08/09/2026).
        rentalTerms: (req.rentalTerms as unknown as RentalTermsSnapshot | null) ?? null,
        /*
         * AI GIỮ CỌC — đọc quyết định ĐÃ ĐÓNG BĂNG trên hold lúc duyệt, không hỏi lại công tắc
         * hôm nay (ADR 0025 ràng buộc 4).
         *
         * Tiền về KHÔNG có nghĩa là cọc về: tuyến gói tắt công tắc vẫn có hold cho phần không
         * phải tiền chủ xe (`S + H + IV + IP + T` — ADR 0064 điều 5), và trong khoản đó không có
         * đồng cọc nào. Ghi `platform` cho đơn ấy là nói với khách rằng XePrime đang giữ cọc của
         * họ, trong khi cọc do chủ xe thu trực tiếp ⇒ `direct` (ADR 0028 điều 9). Phân bổ tiền
         * của hold (`HoldSettlementService`) đọc năm cột số tiền, không đọc cột này — `S`/`H`/
         * `IV`/`IP`/`T` vẫn đi đúng chỗ ở cả hai chế độ.
         */
        depositCollectionMode: hold.depositRequired
          ? DEPOSIT_COLLECTION_MODE.PLATFORM
          : DEPOSIT_COLLECTION_MODE.DIRECT,
        /*
         * Hợp đồng bảo hiểm truy ngược về CHÍNH khoản giữ chỗ đã thu phí của nó (Phase 7). Khi
         * quyết toán với đối tác, câu hỏi đầu tiên là "tiền này vào bằng giao dịch nào" — không
         * có cột này thì phải đi vòng qua đơn rồi đoán.
         */
        holdId,
      },
    );

    /*
     * Chiếm quyền trên YÊU CẦU bằng điều kiện trong WHERE, không đọc-rồi-ghi. Hai đường huỷ khoá
     * hàng hold TRƯỚC (`lockForRequestWithinTx`) — cùng thứ tự với lượt cộng tiền ở trên — nên
     * một lượt huỷ chen giữa chỉ có thể thắng TRƯỚC khi ta khoá hold (khi đó hold đã đóng và ta
     * không tới được đây). `count = 0` vì thế là một lưới an toàn cho đường ghi chưa giữ luật thứ
     * tự đó: quay đầu cả transaction — đơn vừa tạo biến mất, và tiền nằm lại `bank_transactions`
     * cho admin thay vì treo một hold `paid` trên một yêu cầu đã huỷ.
     *
     * KHÔNG đụng `decided_*`: ba cột đó mang lượt NHẬN chuyến (ADR 0045 điều 3). Tiền về là việc
     * của khách, không phải một quyết định thứ hai của gian hàng.
     */
    const claimed = await tx.bookingRequest.updateMany({
      where: {
        id: req.id,
        tenantId: hold.tenantId,
        status: BOOKING_REQUEST_STATUS.AWAITING_HOLD,
      },
      data: { status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING, bookingId: booking.id },
    });
    if (claimed.count === 0) {
      throw new Error(`Yêu cầu ${req.id} không còn chờ giữ chỗ khi tiền về`);
    }
    await tx.bookingHold.update({ where: { id: holdId }, data: { bookingId: booking.id } });

    /*
     * MÃ KHUYẾN MÃI — CHỐT lượt tại đây (ADR 0046 điều 6).
     *
     * Đây là điểm DUY NHẤT của nhánh có thu tiền giữ chỗ mà một ĐƠN ra đời (ADR 0044 điều 2),
     * nên nó cũng là điểm duy nhất một lượt mã chuyển từ GIỮ sang ĐÃ DÙNG. Chốt bằng con số đã
     * đóng băng trong snapshot giá của hold, không bằng số tạm lúc khách áp mã.
     *
     * Số 0 vẫn gọi: `redeemPromoRedemption` tự bỏ qua khi yêu cầu không có lượt nào.
     */
    await redeemPromoRedemption(tx, {
      bookingRequestId: req.id,
      bookingId: booking.id,
      discountAmount: snapshot.fees?.promoDiscountAmount ?? '0',
    });

    await this.audit.record(
      {
        tenantId: hold.tenantId,
        actorScope: AUDIT_ACTOR_SCOPE.SYSTEM,
        action: 'booking_hold.paid',
        targetType: 'booking_hold',
        targetId: holdId,
        after: {
          code: hold.code,
          paidAmount: hold.paidAmount.toString(),
          providerTxId,
          bookingId: booking.id,
          bookingCode: booking.code,
        },
      },
      tx,
    );

    /*
     * Gian hàng: chuyến vừa thành đơn. Câu chữ theo người ĐÃ NHẬN chuyến, đọc từ lượt nhận thật
     * (`decision_source`), không từ actor của lượt đối soát này — vốn luôn là hệ thống:
     *
     *   · xe "Đặt ngay" (hệ thống nhận lúc khách gửi) — gian hàng chưa từng được gọi về chuyến này
     *     (ADR 0039 hệ quả 1), nên đây là lần ĐẦU họ nghe về nó: phải nói là hệ thống đã nhận hộ;
     *   · chủ xe tự tay nhận — họ đã biết chuyến, việc mới là khách đã trả tiền.
     */
    const autoAccepted = req.decisionSource === BOOKING_REQUEST_DECISION_SOURCE.SYSTEM;
    await this.notifications.emitToTenantMembers(
      hold.tenantId,
      autoAccepted
        ? {
            type: NOTIFICATION_TYPE.BOOKING_AUTO_ACCEPTED,
            title: `Đã tự động nhận chuyến: ${req.customerName}`,
            body: `${req.vehicle.name} · khách đã thanh toán giữ chỗ, đơn ${booking.code} đã tạo`,
            targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
            targetId: booking.id,
          }
        : {
            type: NOTIFICATION_TYPE.HOLD_PAID,
            title: `Khách đã thanh toán giữ chỗ: đơn ${booking.code}`,
            body: `${req.vehicle.name} · ${req.customerName}`,
            targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
            targetId: booking.id,
          },
      tx,
    );
    if (hold.customerUserId) {
      await this.notifications.emitToUser(
        hold.customerUserId,
        {
          type: NOTIFICATION_TYPE.HOLD_PAID,
          title: 'Đã giữ chỗ thành công',
          body: `${req.vehicle.name} · đơn ${booking.code}. Phần tiền thuê còn lại trả trực tiếp chủ xe khi nhận xe.`,
          tenantId: hold.tenantId,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
          targetId: booking.id,
        },
        tx,
      );
    }
    return booking.id;
  }

  // ── Khách huỷ khi đang chờ tiền ──────────────────────────────────────────

  /**
   * Khoá hàng hold của một yêu cầu — gọi ĐẦU transaction huỷ, TRƯỚC khi chiếm yêu cầu.
   *
   * Thứ tự khoá phải là MỘT trên mọi đường cùng chạm hai hàng: lượt tiền về (`applyBankPayment
   * WithinTx`) và worker hết hạn đều khoá HOLD trước rồi mới tới YÊU CẦU. Đường huỷ mà khoá
   * yêu cầu trước thì một lượt huỷ trùng đúng lúc tiền về sẽ kết thúc bằng deadlock (40P01) thay vì
   * bằng một bên thắng sạch: khách nhận 500, hoặc khoản tiền rơi vào hàng đợi đối soát không ghi
   * chú. Khoá hold trước ⇒ bên tới sau CHỜ, rồi thấy trạng thái đã đổi và lùi đúng đường.
   *
   * Không có hold (yêu cầu chưa được nhận) ⇒ không khoá gì — không có cuộc đua tiền nào để thua.
   */
  async lockForRequestWithinTx(tx: Prisma.TransactionClient, requestId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM booking_holds WHERE booking_request_id = ${requestId} FOR UPDATE`;
  }

  /** Yêu cầu `awaiting_hold` bị huỷ (khách) — hold `cancelled`, nhả lịch. Không có gì để hoàn. */
  async cancelForRequestWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      requestId: string;
      tenantId: string;
      actorUserId: string;
      actorScope: AuditActorScope;
    },
  ): Promise<void> {
    const claimed = await tx.bookingHold.updateMany({
      where: {
        bookingRequestId: input.requestId,
        tenantId: input.tenantId,
        status: { in: [BOOKING_HOLD_STATUS.PENDING, BOOKING_HOLD_STATUS.UNDERPAID] },
      },
      data: { status: BOOKING_HOLD_STATUS.CANCELLED, releasedAt: new Date() },
    });
    await this.occupancy.release(tx, OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST, input.requestId);
    if (claimed.count === 0) return;

    const hold = await tx.bookingHold.findUniqueOrThrow({
      where: { bookingRequestId: input.requestId },
      select: { id: true, code: true, paidAmount: true, customerUserId: true },
    });
    // Đã chuyển THIẾU rồi huỷ — phần đã chuyển vẫn là tiền của khách, ghi yêu cầu hoàn.
    if (hold.paidAmount.gt(0)) {
      await this.settlement.upsertRefundWithinTx(tx, {
        holdId: hold.id,
        tenantId: input.tenantId,
        customerUserId: hold.customerUserId,
        amount: hold.paidAmount,
        reason: HOLD_REFUND_REASON.EARLY_CANCEL,
        note: 'Huỷ khi đang chờ chuyển giữ chỗ (đã chuyển một phần)',
      });
    }
    await this.audit.record(
      {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorScope: input.actorScope,
        action: 'booking_hold.cancel',
        targetType: 'booking_hold',
        targetId: hold.id,
        after: { code: hold.code, paidAmount: hold.paidAmount.toString() },
      },
      tx,
    );
  }

  // ── Đọc: khách ───────────────────────────────────────────────────────────

  async findForTrip(requestId: string, customerUserId: string): Promise<CustomerHoldDto | null> {
    const row = await this.prisma.bookingHold.findFirst({
      where: { bookingRequestId: requestId, customerUserId },
      select: CUSTOMER_SELECT,
    });
    if (!row) return null;
    const remaining = Prisma.Decimal.max(0, row.amount.sub(row.paidAmount));
    return {
      id: row.id,
      code: row.code,
      status: row.status,
      outcome: row.outcome,
      amount: row.amount.toFixed(0),
      paidAmount: row.paidAmount.toFixed(0),
      remainingAmount: remaining.toFixed(0),
      expiresAt: row.expiresAt.toISOString(),
      ...customerFreeCancelView(row),
      lateCancelRefundAmount: allocationTotals(
        allocationForHold(row, BOOKING_HOLD_OUTCOME.SPLIT_LATE_CANCEL) ?? [],
      )[ALLOCATION_TARGET.CUSTOMER_BALANCE],
      paidAt: row.paidAt?.toISOString() ?? null,
      paidVia: await this.paidVia(row.id, row.paidAmount),
      /*
       * Bản PHÍA KHÁCH: `D` và `H` gộp thành một dòng "phần tiền thuê trả trước" — lọc riêng `H`
       * không đủ, vì nó suy ngược được từ `amount` và các dòng còn lại (ADR 0064 điều 11).
       */
      allocation: customerHoldAllocation(
        row.allocationJson as unknown as CustomerHoldDto['allocation'] | null,
      ),
      paymentInfo: this.billing.paymentInfo(),
      refund: row.refund
        ? {
            id: row.refund.id,
            status: row.refund.status,
            reason: row.refund.reason,
            amount: row.refund.amount.toFixed(0),
            hasAccount: Boolean(row.refund.bankAccountNumber),
            accountHint: maskAccountNumber(row.refund.bankAccountNumber),
            paidAt: row.refund.paidAt?.toISOString() ?? null,
            bankReference: row.refund.bankReference,
          }
        : null,
    };
  }

  /**
   * Kênh tiền đã vào một khoản giữ chỗ — chỉ để KỂ cho khách, không quyết định gì về tiền.
   *
   * Hai đường cộng `paid_amount` là chuyển khoản (SePay / admin khớp tay) và lượt cổng (ADR 0058),
   * và cả hai đi qua CÙNG `applyBankPaymentWithinTx`. Sổ cổng ghi rõ lượt nào ĐÃ được áp (`applied_at`
   * + kết cục có cộng tiền), nên phần còn lại của `paid_amount` là chuyển khoản. Suy theo phép trừ thay
   * vì đọc `bank_transactions`: bảng đó không có chỉ mục theo đích khớp, còn sổ cổng có
   * (`booking_hold_id, created_at`).
   *
   * Không bao giờ đoán: chưa có đồng nào ⇒ `null`; tiền đến từ hai kênh trở lên ⇒ `null`.
   */
  private async paidVia(
    holdId: string,
    paidAmount: Prisma.Decimal,
  ): Promise<HoldPaymentChannel | null> {
    if (paidAmount.lte(0)) return null;

    const orders = await this.prisma.paymentGatewayOrder.findMany({
      where: {
        bookingHoldId: holdId,
        appliedAt: { not: null },
        // Các kết cục ĐÃ cộng tiền vào hold (kể cả tiền thừa) — đích đóng/không thấy thì không.
        applyOutcome: { in: [...PAYMENT_ORDER_CREDITED_OUTCOMES] },
      },
      select: { provider: true, amount: true, paidAmount: true },
    });
    if (orders.length === 0) return HOLD_PAYMENT_CHANNEL.BANK_TRANSFER;

    const providers = new Set(orders.map((order) => order.provider));
    const viaGateway = orders.reduce(
      (sum, order) => sum.plus(order.paidAmount ?? order.amount),
      new Prisma.Decimal(0),
    );
    // Một cổng duy nhất và cổng đó gánh trọn số đã nhận — còn dư ⇒ có thêm chuyển khoản.
    if (providers.size === 1 && viaGateway.gte(paidAmount)) {
      const [provider] = providers;
      return provider === HOLD_PAYMENT_CHANNEL.MOMO || provider === HOLD_PAYMENT_CHANNEL.VNPAY
        ? provider
        : null;
    }
    return null;
  }

  // ── Đọc: admin (money operations) ────────────────────────────────────────

  async listForPlatform(
    query: PlatformHoldListQueryDto,
  ): Promise<{ data: PlatformHoldDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, HOLD_DEFAULT_LIMIT, HOLD_MAX_LIMIT);
    const where: Prisma.BookingHoldWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.unsettled === 'true' ? { status: BOOKING_HOLD_STATUS.PAID, outcome: null } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { bookingRequest: { customerName: { contains: query.q, mode: 'insensitive' } } },
              { tenant: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.bookingHold.count({ where }),
      this.prisma.bookingHold.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paging.skip,
        take: paging.take,
        select: PLATFORM_SELECT,
      }),
    ]);
    const disputes = await this.openDisputeBookingIds(
      rows.map((r) => r.bookingId).filter((v): v is string => !!v),
    );
    return {
      data: rows.map((r) => ({
        id: r.id,
        code: r.code,
        tenantId: r.tenantId,
        tenantName: r.tenant.name,
        customerName: r.bookingRequest.customerName,
        vehicleName: r.vehicle.name,
        bookingRequestId: r.bookingRequestId,
        bookingId: r.bookingId,
        bookingCode: r.booking?.code ?? null,
        status: r.status,
        outcome: r.outcome,
        amount: r.amount.toFixed(0),
        paidAmount: r.paidAmount.toFixed(0),
        expiresAt: r.expiresAt.toISOString(),
        freeCancelUntil: r.freeCancelUntil?.toISOString() ?? null,
        paidAt: r.paidAt?.toISOString() ?? null,
        releasedAt: r.releasedAt?.toISOString() ?? null,
        disputeOpen: r.bookingId ? disputes.has(r.bookingId) : false,
        refundStatus: r.refund?.status ?? null,
        createdAt: r.createdAt.toISOString(),
        purpose: r.purpose,
        depositAmount: r.depositAmount.toFixed(0),
        serviceFeeAmount: r.serviceFeeAmount.toFixed(0),
        ownerCommissionAmount: r.ownerCommissionAmount.toFixed(0),
        vehicleInsuranceAmount: r.vehicleInsuranceAmount.toFixed(0),
        personalInsuranceAmount: r.personalInsuranceAmount.toFixed(0),
        promoDiscountAmount: r.promoDiscountAmount.toFixed(0),
        taxAmount: taxFromSnapshot(r.priceSnapshotJson),
      })),
      meta: paginationMeta(paging, total),
    };
  }

  async listRefundsForPlatform(
    query: PlatformHoldRefundListQueryDto,
  ): Promise<{ data: PlatformHoldRefundDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, HOLD_DEFAULT_LIMIT, HOLD_MAX_LIMIT);
    // Không lọc = VIỆC CẦN LÀM (chờ chuyển), không phải toàn bộ lịch sử.
    const where: Prisma.HoldRefundWhereInput = {
      status: query.status ?? HOLD_REFUND_STATUS.PENDING,
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.holdRefund.count({ where }),
      this.prisma.holdRefund.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          holdId: true,
          amount: true,
          status: true,
          reason: true,
          bankCode: true,
          bankAccountNumber: true,
          bankAccountName: true,
          paidAt: true,
          bankReference: true,
          note: true,
          createdAt: true,
          hold: {
            select: {
              code: true,
              tenant: { select: { name: true } },
              bookingRequest: { select: { customerName: true } },
            },
          },
          payer: { select: { displayName: true } },
        },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        holdId: r.holdId,
        holdCode: r.hold.code,
        tenantName: r.hold.tenant.name,
        customerName: r.hold.bookingRequest.customerName,
        amount: r.amount.toFixed(0),
        status: r.status,
        reason: r.reason,
        bankCode: r.bankCode,
        bankAccountNumber: r.bankAccountNumber,
        bankAccountName: r.bankAccountName,
        paidByName: r.payer?.displayName ?? null,
        paidAt: r.paidAt?.toISOString() ?? null,
        bankReference: r.bankReference,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * ĐỐI SOÁT BA VẾ của một ngày (giờ Việt Nam) — ADR 0025 điều 6.
   *
   * ## Phương trình
   *
   * ```text
   *   Số dư ngân hàng cuối ngày D
   *     = Tiền CỦA NỀN TẢNG (lũy kế tới hết D)
   *     + Tiền GIỮ HỘ       (nghĩa vụ tại cuối D)
   *     + Chênh lệch chưa đối soát
   * ```
   *
   * ## Hai cái bẫy, và cách né
   *
   * 1. **Không trộn LƯU LƯỢNG với SỐ DƯ.** Số dư ngân hàng là con số LŨY KẾ từ ngày đầu tiên;
   *    tiền vào/ra trong ngày là lưu lượng. Vì vậy `platform` và `custodied` đều tính lũy kế tới
   *    mốc cuối ngày, còn `inflow`/`outflow` là lưu lượng trong ngày và **không** nằm trong
   *    phương trình — chúng chỉ giải thích vì sao số dư đổi so với hôm qua.
   *
   * 2. **Không cộng đôi khoản đã chuyển từ hold sang ví.** Một hold chốt xong thì tiền của nó
   *    rời `booking_holds` và xuất hiện ở `wallet_entries`. Nên `holdsUnsettled` chỉ đếm hold
   *    **chưa chốt** (`outcome IS NULL`), còn phần đã chốt nằm ở ví hoặc ở `platform`. Đếm cả
   *    hai là nhân đôi toàn bộ nghĩa vụ.
   *
   * ## Vì sao `platform` đọc `settled_platform_amount`
   *
   * Không đọc `service_fee_amount`: ở nhánh huỷ muộn, `resolveHoldAllocation` chia `D + S` đôi,
   * nên phần nền tảng khác `S` (và tuyến GÓI có `S = 0` nhưng vẫn sinh doanh thu). Cột
   * `settled_platform_amount` được đóng băng lúc chốt nên đọc nó là đọc đúng con số đã quyết,
   * không phải diễn giải lại. **Không hàm nào ở đây đọc `purpose`** — CLAUDE.md cấm, vì một hold
   * nay chứa tiền của nhiều người (ADR 0033 điều 4).
   *
   * ## Vì sao ví tính bằng `SUM(wallet_entries)` chứ không đọc `wallets.balance`
   *
   * `balance` là trạng thái HIỆN TẠI, không có lịch sử — hỏi lại ngày hôm qua sẽ ra số của hôm
   * nay. `wallet_entries` là sổ chỉ-ghi-thêm có `created_at`, nên nó dựng lại được nghĩa vụ tại
   * bất kỳ mốc nào. Hai con số phải bằng nhau ở hiện tại; chỗ chúng lệch chính là `walletDrift`.
   */
  async dailyReconciliation(date: string): Promise<DailyReconciliationDto> {
    const { start, end } = vnDayRange(date);
    const inWindow = Prisma.sql`COALESCE(bank_time, created_at) >= ${start} AND COALESCE(bank_time, created_at) < ${end}`;

    const [inflowRow] = await this.prisma.$queryRaw<
      Array<{
        total: Prisma.Decimal;
        count: bigint;
        subs: Prisma.Decimal;
        holds: Prisma.Decimal;
        unmatched: Prisma.Decimal;
        unmatchedCount: bigint;
        ignored: Prisma.Decimal;
      }>
    >`
      SELECT
        COALESCE(SUM(amount_in), 0) AS total,
        COUNT(*) AS count,
        COALESCE(SUM(amount_in) FILTER (WHERE match_status IN ('matched','manual') AND matched_type = ${BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE}), 0) AS subs,
        COALESCE(SUM(amount_in) FILTER (WHERE match_status IN ('matched','manual') AND matched_type = ${BANK_MATCH_TARGET_TYPE.BOOKING_HOLD}), 0) AS holds,
        COALESCE(SUM(amount_in) FILTER (WHERE match_status = ${BANK_MATCH_STATUS.UNMATCHED}), 0) AS unmatched,
        COUNT(*) FILTER (WHERE match_status = ${BANK_MATCH_STATUS.UNMATCHED}) AS "unmatchedCount",
        COALESCE(SUM(amount_in) FILTER (WHERE match_status = ${BANK_MATCH_STATUS.IGNORED}), 0) AS ignored
      FROM bank_transactions
      WHERE direction = ${BANK_DIRECTION.IN} AND ${inWindow}
    `;

    const [
      platformRow,
      subsRow,
      custodiedHolds,
      walletRow,
      refundsPendingRow,
      unmatchedCumRow,
      withdrawalsPaid,
      refundsPaid,
      driftRow,
      bankBalance,
    ] = await Promise.all([
      /*
       * Doanh thu nền tảng LŨY KẾ tới hết ngày D: hold đã chốt (`released_at < end`) cộng phần
       * đã đóng băng vào `settled_platform_amount`.
       */
      this.prisma.bookingHold.aggregate({
        where: { outcome: { not: null }, releasedAt: { lt: end } },
        _sum: { settledPlatformAmount: true },
      }),
      // Tiền gói đã THU (không phải đã phát hành) — chỉ phần `paid_amount` mới là tiền thật về.
      this.prisma.subscriptionInvoice.aggregate({
        where: { paidAt: { lt: end } },
        _sum: { paidAmount: true },
      }),
      /*
       * Hold CHƯA CHỐT nhưng đã có tiền. Lấy TOÀN BỘ `paid_amount`: trước khi chốt, kể cả phần
       * phí dịch vụ cũng có thể phải hoàn khách (huỷ sớm hoàn 100%), nên chưa đồng nào của hold
       * này là của nền tảng.
       */
      this.prisma.bookingHold.aggregate({
        where: { outcome: null, paidAmount: { gt: 0 }, paidAt: { lt: end } },
        _sum: { paidAmount: true },
        _count: { _all: true },
      }),
      /*
       * Nghĩa vụ ví tại cuối ngày D — dựng lại từ SỔ, không đọc `wallets.balance` (xem docblock).
       * `available`/`pending` là số HIỆN TẠI, trả kèm để màn hình nói được phần nào đang bị khoá.
       */
      this.prisma.$queryRaw<Array<{ total: Prisma.Decimal }>>`
        SELECT COALESCE(SUM(amount), 0) AS total
          FROM wallet_entries
         WHERE created_at < ${end}
      `,
      // Khách VÃNG LAI không có ví — đường chuyển khoản tay là vĩnh viễn (ADR 0033 điều 3).
      this.prisma.holdRefund.aggregate({
        where: { status: HOLD_REFUND_STATUS.PENDING, createdAt: { lt: end } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      // Tiền vào chưa khớp LŨY KẾ — vẫn trong tài khoản, vẫn là tiền của một ai đó.
      this.prisma.$queryRaw<Array<{ total: Prisma.Decimal; count: bigint }>>`
        SELECT COALESCE(SUM(amount_in), 0) AS total, COUNT(*) AS count
          FROM bank_transactions
         WHERE direction = ${BANK_DIRECTION.IN}
           AND match_status = ${BANK_MATCH_STATUS.UNMATCHED}
           AND COALESCE(bank_time, created_at) < ${end}
      `,
      // Chiều RA trong NGÀY — lưu lượng, không phải nghĩa vụ. Lệnh bị đảo SAU đó vẫn tính: hôm
      // đó tiền đã rời tài khoản thật, việc nó quay về là sự kiện của ngày khác.
      this.prisma.withdrawalRequest.aggregate({
        where: {
          status: { in: [...WITHDRAWAL_STATUS_DISBURSED] },
          paidAt: { gte: start, lt: end },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.holdRefund.aggregate({
        where: { status: HOLD_REFUND_STATUS.PAID, paidAt: { gte: start, lt: end } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      /*
       * LỆCH SỔ VÍ — ADR 0023 điều 6. So `Σ bút toán` với `balance + pending` của TỪNG ví.
       * Bằng nhau là bất biến: `creditWithinTx` và `recordWithdrawalPaidWithinTx` luôn ghi cả
       * hai vế trong cùng transaction, còn khoá/nhả tiền rút chỉ chuyển giữa hai cột. Lệch nghĩa
       * là có đường ghi thứ hai ngoài `WalletService` — thứ duy nhất phép này tồn tại để bắt.
       */
      this.prisma.$queryRaw<Array<{ wallets: bigint; amount: Prisma.Decimal }>>`
        SELECT COUNT(*) AS wallets, COALESCE(SUM(ABS(diff)), 0) AS amount
          FROM (
                SELECT w.id,
                       COALESCE(e.total, 0) - (w.balance + w.pending_withdraw_amount) AS diff
                  FROM wallets w
                  LEFT JOIN (
                        SELECT wallet_id, SUM(amount) AS total
                          FROM wallet_entries
                         GROUP BY wallet_id
                       ) e ON e.wallet_id = w.id
               ) d
         WHERE diff <> 0
      `,
      this.prisma.platformBankBalance.findUnique({
        where: { date: new Date(`${date}T00:00:00Z`) },
      }),
    ]);

    const zero = new Prisma.Decimal(0);
    const inflow = inflowRow ?? {
      total: zero,
      count: 0n,
      subs: zero,
      holds: zero,
      unmatched: zero,
      unmatchedCount: 0n,
      ignored: zero,
    };

    const walletTotal = walletRow[0]?.total ?? zero;
    const walletLive = await this.prisma.wallet.aggregate({
      _sum: { balance: true, pendingWithdrawAmount: true },
    });
    const unmatchedCum = unmatchedCumRow[0] ?? { total: zero, count: 0n };

    const serviceFeeRecognized = platformRow._sum.settledPlatformAmount ?? zero;
    const subscriptionsCollected = subsRow._sum.paidAmount ?? zero;
    const platformTotal = serviceFeeRecognized.add(subscriptionsCollected);

    const holdsUnsettled = custodiedHolds._sum.paidAmount ?? zero;
    const refundsPendingAmount = refundsPendingRow._sum.amount ?? zero;
    /*
     * BẢO HIỂM (Phase 7): phí đã thu của khách cho `IV`/`IP` là tiền GIỮ HỘ ở mọi trạng thái trừ
     * hai trạng thái cuối. Chưa phát hành ⇒ vẫn là tiền của khách; đã phát hành ⇒ thành khoản
     * phải trả hãng bảo hiểm. Cả hai đều là tiền XePrime đang cầm mà không sở hữu — chỉ khác ở
     * chỗ đang nợ AI, và phép đối soát này không hỏi câu đó.
     *
     * ⚠️ KHÔNG trừ phần này ra khỏi `holdsUnsettled`: hold CHƯA chốt được tính trọn `paid_amount`
     * (gồm cả `IV`/`IP`), còn hợp đồng bảo hiểm chỉ tồn tại sau khi ĐƠN đã được tạo — tức là sau
     * khi hold đã `paid` và có `booking_id`. Hai tập hợp rời nhau theo thời gian, nên cộng cả hai
     * KHÔNG phải cộng đôi. Ca duy nhất chồng lấn là hold đã trả nhưng chưa chốt outcome VÀ đơn đã
     * tạo — và ở đó phần `IV`/`IP` nằm trong `paid_amount` của hold lẫn trong `premium_amount`
     * của hợp đồng. Đó chính là lý do dòng dưới trừ lại phần trùng.
     */
    const insuranceGross = await this.insurance.custodiedPremiumAsOf(end);
    const insuranceInOpenHolds = await this.premiumInsideUnsettledHolds(end);
    const insuranceReserved = insuranceGross.sub(insuranceInOpenHolds);
    /*
     * THUẾ (Phase 8): phần đã khấu trừ khỏi chủ xe nhưng CHƯA nộp cơ quan thuế —
     * `accrued` + `declared`. Tiền đó đang nằm trong tài khoản XePrime và thuộc về cơ quan thuế,
     * nên nó là nghĩa vụ giữ hộ đúng nghĩa.
     *
     * ⚠️ KHÔNG trừ khỏi `holdsUnsettled`: thuế chỉ phát sinh khi chuyến ĐÃ BẮT ĐẦU, mà hold chưa
     * chốt thì chuyến chưa kết thúc — hai tập hợp giao nhau ở những chuyến đang chạy. Ở đó phần
     * `T` nằm cả trong `paid_amount` của hold lẫn trong sổ thuế, nên dòng dưới trừ lại phần trùng
     * y như cách làm với bảo hiểm.
     */
    const taxGross = await this.tax.unpaidAsOf(end);
    const taxInOpenHolds = await this.taxInsideUnsettledHolds(end);
    const taxAccrued = taxGross.sub(taxInOpenHolds);
    const custodiedTotal = holdsUnsettled
      .add(walletTotal)
      .add(refundsPendingAmount)
      .add(unmatchedCum.total)
      .add(insuranceReserved)
      .add(taxAccrued);

    /*
     * CHƯA NHẬP số dư ⇒ `null` cho cả hai, không phải 0. Số 0 là một khẳng định ("tài khoản
     * rỗng") và nó sẽ biến mọi nghĩa vụ đang có thành một khoản thất thoát trên màn hình.
     */
    const bankBalanceEod = bankBalance ? bankBalance.balance.toFixed(0) : null;
    const variance = bankBalance
      ? bankBalance.balance.sub(platformTotal).sub(custodiedTotal).toFixed(0)
      : null;

    const inflowVariance = new Prisma.Decimal(inflow.total)
      .sub(inflow.subs)
      .sub(inflow.holds)
      .sub(inflow.unmatched)
      .sub(inflow.ignored);

    const drift = driftRow[0] ?? { wallets: 0n, amount: zero };
    const withdrawalsPaidAmount = withdrawalsPaid._sum.amount ?? zero;
    const refundsPaidAmount = refundsPaid._sum.amount ?? zero;

    return {
      date,
      platform: {
        serviceFeeRecognized: serviceFeeRecognized.toFixed(0),
        subscriptionsCollected: subscriptionsCollected.toFixed(0),
        total: platformTotal.toFixed(0),
      },
      custodied: {
        holdsUnsettled: holdsUnsettled.toFixed(0),
        holdsUnsettledCount: custodiedHolds._count._all,
        walletTotal: walletTotal.toFixed(0),
        walletAvailable: (walletLive._sum.balance ?? zero).toFixed(0),
        walletPending: (walletLive._sum.pendingWithdrawAmount ?? zero).toFixed(0),
        refundsPending: refundsPendingAmount.toFixed(0),
        refundsPendingCount: refundsPendingRow._count._all,
        unmatchedIn: new Prisma.Decimal(unmatchedCum.total).toFixed(0),
        unmatchedInCount: Number(unmatchedCum.count),
        insuranceReserved: insuranceReserved.toFixed(0),
        taxAccrued: taxAccrued.toFixed(0),
        total: custodiedTotal.toFixed(0),
      },
      outflow: {
        withdrawalsPaid: withdrawalsPaidAmount.toFixed(0),
        withdrawalsPaidCount: withdrawalsPaid._count._all,
        refundsPaid: refundsPaidAmount.toFixed(0),
        refundsPaidCount: refundsPaid._count._all,
        total: withdrawalsPaidAmount.add(refundsPaidAmount).toFixed(0),
      },
      inflow: {
        bankIn: new Prisma.Decimal(inflow.total).toFixed(0),
        bankInCount: Number(inflow.count),
        matchedSubscriptions: new Prisma.Decimal(inflow.subs).toFixed(0),
        matchedHolds: new Prisma.Decimal(inflow.holds).toFixed(0),
        unmatched: new Prisma.Decimal(inflow.unmatched).toFixed(0),
        unmatchedCount: Number(inflow.unmatchedCount),
        ignored: new Prisma.Decimal(inflow.ignored).toFixed(0),
        variance: inflowVariance.toFixed(0),
      },
      bankBalanceEod,
      variance,
      walletDrift: {
        wallets: Number(drift.wallets),
        amount: new Prisma.Decimal(drift.amount).toFixed(0),
      },
    };
  }

  /**
   * Phí bảo hiểm nằm TRONG các hold chưa chốt — phần bị đếm hai lần nếu không trừ ra.
   *
   * Một hold `paid` chưa chốt outcome được tính TRỌN `paid_amount` ở vế giữ hộ, và `paid_amount`
   * đã gồm `IV + IP`. Nếu đơn của hold đó đã được tạo thì hợp đồng bảo hiểm cũng tồn tại với
   * đúng số tiền ấy. Cộng cả hai là nhân đôi phần bảo hiểm của những chuyến đang chạy — và nó sẽ
   * hiện ra thành một chênh lệch dương đúng bằng tổng phí bảo hiểm của các chuyến chưa kết thúc.
   */
  private async premiumInsideUnsettledHolds(end: Date): Promise<Prisma.Decimal> {
    const agg = await this.prisma.bookingInsurancePolicy.aggregate({
      where: {
        createdAt: { lt: end },
        status: { notIn: [INSURANCE_POLICY_STATUS.CANCELLED, INSURANCE_POLICY_STATUS.VOIDED] },
        hold: { outcome: null, paidAmount: { gt: 0 }, paidAt: { lt: end } },
      },
      _sum: { premiumAmount: true },
    });
    return agg._sum.premiumAmount ?? new Prisma.Decimal(0);
  }

  /**
   * Thuế nằm TRONG các hold chưa chốt — phần bị đếm hai lần nếu không trừ ra (cùng lý do với
   * `premiumInsideUnsettledHolds`).
   *
   * Giao nhau xảy ra ở chuyến ĐANG CHẠY: thuế đã phát sinh (`to = ACTIVE`) nhưng hold chưa chốt
   * kết cục (chuyến chưa kết thúc). Ở đó `T` nằm cả trong `paid_amount` của hold lẫn trong sổ
   * thuế, và cộng cả hai làm chênh lệch dương đúng bằng tổng thuế của các chuyến đang chạy.
   */
  private async taxInsideUnsettledHolds(end: Date): Promise<Prisma.Decimal> {
    const agg = await this.prisma.taxWithholding.aggregate({
      where: {
        accruedAt: { lt: end },
        status: { in: [...TAX_WITHHOLDING_STATUS_UNPAID] },
        booking: { hold: { outcome: null, paidAmount: { gt: 0 }, paidAt: { lt: end } } },
      },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? new Prisma.Decimal(0);
  }

  /**
   * Admin ghi số dư ngân hàng cuối ngày — vế trái của phép đối soát.
   *
   * `upsert` theo ngày: nhập lại là SỬA con số của ngày đó, không phải thêm một con số thứ hai.
   * Ghi audit vì đây là một khẳng định của con người mà mọi báo động chênh lệch sau đó dựa vào.
   */
  async saveBankBalance(
    input: SaveBankBalanceDto,
    actorUserId: string,
  ): Promise<DailyReconciliationDto> {
    // Cùng hàm kiểm định dạng với đường đọc — hai cách hiểu "ngày" là hai kết quả đối soát.
    vnDayRange(input.date);
    const date = new Date(`${input.date}T00:00:00Z`);
    const balance = new Prisma.Decimal(input.balance);

    const before = await this.prisma.platformBankBalance.findUnique({ where: { date } });
    await this.prisma.$transaction(async (tx) => {
      await tx.platformBankBalance.upsert({
        where: { date },
        create: {
          date,
          balance,
          enteredBy: actorUserId,
          ...(input.note === undefined ? {} : { note: input.note }),
        },
        update: {
          balance,
          enteredBy: actorUserId,
          ...(input.note === undefined ? {} : { note: input.note }),
        },
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'platform_bank_balance.save',
          targetType: 'platform_bank_balance',
          targetId: input.date,
          before: before ? { balance: before.balance.toFixed(0) } : null,
          after: { balance: balance.toFixed(0), ...(input.note ? { note: input.note } : {}) },
        },
        tx,
      );
    });

    return this.dailyReconciliation(input.date);
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  private async uniqueCode(tx: Prisma.TransactionClient): Promise<string> {
    // 32^8 tổ hợp — đụng gần như không xảy ra; vòng lặp chỉ là dây an toàn (cùng khuôn hoá đơn gói).
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = newReferenceCode(BANK_MATCH_TARGET_TYPE.BOOKING_HOLD);
      const [hold, invoice] = await Promise.all([
        tx.bookingHold.findUnique({ where: { code }, select: { id: true } }),
        // Cùng KHÔNG GIAN TÊN với mã hoá đơn gói (ADR 0022 điều 3) — tiền tố đã khác nhau, nhưng
        // kiểm cả hai để không ai phải nhớ điều đó.
        tx.subscriptionInvoice.findUnique({ where: { code }, select: { id: true } }),
      ]);
      if (!hold && !invoice) return code;
    }
    throw new Error('Không sinh được mã giữ chỗ duy nhất sau 5 lần');
  }

  /** Cùng định nghĩa "tiền đơn này đang bị giữ" với lượt chốt kết cục (ADR 0066). */
  private async openDisputeBookingIds(bookingIds: string[]): Promise<Set<string>> {
    return this.settlement.openDisputeBookingIds(bookingIds);
  }
}

function rowAmount(snapshot: BookingPriceSnapshot, key: string): string {
  return snapshot.rows.find((r) => r.key === key)?.amount ?? '0';
}

function rowAmountAbs(snapshot: BookingPriceSnapshot, key: string): string {
  return new Prisma.Decimal(rowAmount(snapshot, key)).abs().toString();
}

/** Ranh giới ngày theo giờ Việt Nam (UTC+7, không DST) → hai mốc UTC. */
function vnDayRange(date: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'date phải có dạng YYYY-MM-DD',
    });
  }
  const start = new Date(`${date}T00:00:00+07:00`);
  if (Number.isNaN(start.getTime())) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'date không hợp lệ',
    });
  }
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Lưới an toàn cho `listOpenForCustomer` — trần thật là `HOLD_MAX_OPEN_PER_CUSTOMER`. */
const OPEN_HOLD_LIST_MAX = 20;

/**
 * Khoản giữ chỗ khách đang MỞ — MỘT vị từ cho trần ở đường duyệt, cổng ở đường gửi và lời nhắc
 * thanh toán. Hold quá mốc nhưng worker chưa kịp lật vẫn là một chỗ CHẾT — không tính, nếu không một
 * khách xui sẽ bị chặn (và bị nhắc trả) bởi chính những chỗ họ đã mất.
 */
export function openCustomerHoldWhere(
  customerUserId: string,
  now: Date = new Date(),
): Prisma.BookingHoldWhereInput {
  return {
    customerUserId,
    status: { in: [...BOOKING_HOLD_STATUS_AWAITING] },
    expiresAt: { gt: now },
  };
}
