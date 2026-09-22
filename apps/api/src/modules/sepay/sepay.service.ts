import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BANK_MATCH_STATUS,
  BANK_MATCH_TARGET_TYPE,
  REFERENCE_CODE_ALPHABET,
  REFERENCE_CODE_BODY_LENGTH,
  REFERENCE_CODE_PREFIX,
  referenceCodeTarget,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { BookingHoldsService } from '../holds/booking-holds.service';
import type { SepayWebhookResultDto } from './dto/sepay.dto';

/**
 * Nhà cung cấp đối soát của mọi dòng do service này ghi — nằm trong khoá unique
 * `(provider, provider_tx_id)`, nên ghi và đọc lại phải dùng CÙNG một chuỗi. Gõ tay ở ba chỗ là
 * ba chỗ để chốt chống ghi đôi lệch khỏi nhau.
 */
const SEPAY_PROVIDER = 'sepay';

/**
 * Đối soát tiền VÀO qua SePay — writer DUY NHẤT của `bank_transactions` (ADR 0022).
 *
 * Nguyên tắc xuyên suốt, xếp theo thứ tự sống còn:
 *
 *  1. **Ghi thô trước, khớp sau — HAI transaction tách rời.** Dòng `bank_transactions` được
 *     chèn và COMMIT trước khi biết nội dung khớp vào đâu. Một lượt khớp hỏng vì thế không cuốn
 *     theo bằng chứng rằng tiền đã tới: giao dịch nằm lại hàng đợi admin, đúng chỗ của nó.
 *  2. **Idempotent bằng unique DB**, không bằng check tầng app: `(provider, provider_tx_id)`.
 *     Bắt P2002 = "đã nhận rồi" → 200, và chỉ khớp tiếp nếu dòng cũ còn `unmatched` (xem bất
 *     biến ở `ingest`). KHÔNG BAO GIỜ trả 5xx cho một giao dịch đã nhận — SePay retry vĩnh viễn.
 *  3. **Không tin payload lấy tenant.** Mọi hiệu ứng ghi đều suy từ ĐÍCH đã khớp qua mã đối
 *     soát; webhook không có ngữ cảnh tenant nào.
 *  4. **Không khớp tự động theo số tiền** (ADR 0022 điều 4) — không rút được mã thì nằm ở
 *     hàng đợi `unmatched` cho admin, kể cả khi số tiền trùng khớp một hoá đơn duy nhất.
 *  5. **Log không mang tiền nhạy cảm**: chỉ id giao dịch + kết quả khớp. Nội dung chuyển khoản
 *     và payload nguyên trạng nằm ở DB làm bằng chứng, không nằm ở log.
 */
@Injectable()
export class SepayService {
  private readonly logger = new Logger(SepayService.name);
  private readonly apiKeyHash: Buffer | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly holds: BookingHoldsService,
    config: ConfigService,
  ) {
    const key = config.get<string>('SEPAY_API_KEY');
    /*
     * So sánh time-safe cần hai buffer CÙNG ĐỘ DÀI — `timingSafeEqual` ném khi khác length, và
     * bắt exception đó lại chính là một kênh đo độ dài khoá. Hash cả hai vế về 32 byte trước
     * khi so: độ dài luôn bằng nhau, và phép so không rò gì ngoài đúng/sai.
     */
    this.apiKeyHash = key ? sha256(key) : null;
  }

  /** Webhook đã cấu hình chưa — controller trả 503 fail-closed khi chưa. */
  get configured(): boolean {
    return this.apiKeyHash !== null;
  }

  /**
   * Kiểm khoá webhook — header `Authorization: Apikey <key>` (định dạng của SePay).
   *
   * 401 KHÔNG kèm chi tiết nào: đây là endpoint công khai duy nhất có quyền ghi tiền
   * (ADR 0022 — mã lỗi `SEPAY_SIGNATURE_INVALID` cũng chỉ nói "sai khoá", không nói sai chỗ nào).
   */
  assertApiKey(authorization: string | undefined): void {
    if (!this.apiKeyHash) {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODE.SEPAY_NOT_CONFIGURED,
        message: 'Đối soát SePay chưa được cấu hình',
      });
    }
    const presented = authorization?.match(/^Apikey\s+(.+)$/i)?.[1]?.trim();
    if (!presented || !timingSafeEqual(sha256(presented), this.apiKeyHash)) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.SEPAY_SIGNATURE_INVALID,
        message: 'Sai khoá webhook',
      });
    }
  }

  /**
   * Nhận MỘT giao dịch từ webhook. Payload là `unknown` có chủ đích: pipe toàn cục
   * `forbidNonWhitelisted` sẽ 400 mọi trường lạ mà SePay thêm vào sau này (cùng bẫy đã ghi ở
   * `bootstrap.ts` cho OAuth callback), nên bóc tay đúng các trường cần và giữ nguyên phần còn
   * lại trong `raw_json`.
   *
   * HAI BƯỚC COMMIT RIÊNG, và đó là điều quan trọng nhất ở đây (16/09/2026).
   *
   * Trước đợt này, dòng `bank_transactions` được chèn trong CÙNG transaction với lượt khớp. Đọc
   * thì giống nguyên tắc 1, nhưng hiệu ứng thì ngược hẳn: bất kỳ lỗi nào trong lúc khớp —
   * deadlock với một lượt khách huỷ cùng lúc, `EXCLUDE` của lịch nổ khi mở đơn, một bug ở tầng
   * tạo đơn — đều cuốn LUÔN dòng tiền đó theo, rồi trả 5xx. Kết quả: SePay retry, lỗi lặp lại y
   * hệt, và khoản tiền thật của khách không có một dòng nào trong sổ để admin nhìn thấy. Đúng
   * loại "giao dịch mồ côi" mà gate R3 cấm.
   *
   * Nên: BƯỚC 1 ghi thô và COMMIT; BƯỚC 2 khớp trong transaction của riêng nó. Lỗi ở bước 2 chỉ
   * làm giao dịch nằm lại hàng đợi `unmatched` — nơi nó vốn phải nằm khi không khớp được.
   *
   * Bất biến giữ cho việc đó an toàn: **`match_status` luôn được ghi trong CÙNG transaction với
   * lượt cộng tiền.** Vì vậy `unmatched` chứng minh chưa có gì được áp, và một lần gửi lại có
   * thể khớp tiếp mà không sợ cộng đôi; ngược lại `matched`/`manual`/`ignored` thì không bao giờ
   * áp lại.
   */
  async ingest(payload: unknown): Promise<SepayWebhookResultDto> {
    const parsed = parseWebhookPayload(payload);
    if (!parsed.ok) {
      // Payload không đọc nổi các trường tối thiểu — 200 kèm cờ bỏ qua, KHÔNG 4xx/5xx:
      // SePay retry một payload hỏng sẽ hỏng y hệt, và retry bão là thứ mình tự chuốc.
      this.logger.warn(`Webhook SePay bị bỏ qua: ${parsed.reason}`);
      return { received: true, duplicate: false, matched: false, note: parsed.reason };
    }
    const tx = parsed.value;

    const referenceCode = extractReferenceCode(tx.content);

    // ── BƯỚC 1: ghi thô, commit ngay ───────────────────────────────────────
    const record = await this.recordTransaction(tx, referenceCode);

    /*
     * Đã nhận trước đó VÀ đã có kết luận (`matched` tự động, `manual` do admin, `ignored` do
     * admin bỏ qua) ⇒ không đụng gì nữa. Chỉ dòng còn `unmatched` mới được khớp tiếp, và theo
     * bất biến ở docblock thì dòng đó chắc chắn chưa cộng tiền vào đâu.
     */
    if (record.duplicate && record.matchStatus !== BANK_MATCH_STATUS.UNMATCHED) {
      return { received: true, duplicate: true, matched: false, note: null };
    }

    // Mã không rút được ⇒ nằm lại `unmatched` cho admin; KHÔNG đoán theo số tiền (nguyên tắc 4).
    if (!referenceCode) {
      return { received: true, duplicate: record.duplicate, matched: false, note: null };
    }

    // ── BƯỚC 2: khớp, trong transaction RIÊNG ──────────────────────────────
    let result: { matched: boolean; note: string | null };
    try {
      result = await this.prisma.$transaction((db) => this.matchWithinTx(db, tx, referenceCode));
    } catch (error) {
      /*
       * Dòng tiền ĐÃ an toàn ở bước 1, nên chỗ này chỉ còn là một lượt khớp hỏng: trả 200 để
       * SePay thôi retry (một lỗi tất định sẽ lặp lại y hệt), và để giao dịch nằm ở hàng đợi
       * admin. `error` vào log ở mức `error` vì đây là thứ cần người nhìn, không phải một kết
       * cục nghiệp vụ bình thường.
       */
      this.logger.error(
        `SePay ${tx.providerTxId}: khớp thất bại — giao dịch nằm lại hàng đợi đối soát`,
        error instanceof Error ? error.stack : String(error),
      );
      return { received: true, duplicate: record.duplicate, matched: false, note: 'match_failed' };
    }

    this.logger.log(
      `SePay ${tx.providerTxId}: ${result.matched ? 'khớp' : 'chưa khớp'}${result.note ? ` (${result.note})` : ''}`,
    );
    return {
      received: true,
      duplicate: record.duplicate,
      matched: result.matched,
      note: result.note,
    };
  }

  /**
   * Chèn dòng `bank_transactions` và COMMIT — bằng chứng rằng tiền đã tới, độc lập với việc nó
   * khớp được vào đâu.
   *
   * Idempotent bằng unique DB `(provider, provider_tx_id)`, không bằng check tầng app (nguyên
   * tắc 2): bắt P2002 rồi đọc lại dòng đã có để biết nó đã có kết luận hay chưa.
   */
  private async recordTransaction(
    tx: ParsedTransaction,
    referenceCode: string | null,
  ): Promise<{ duplicate: boolean; matchStatus: string }> {
    try {
      await this.prisma.bankTransaction.create({
        data: {
          id: newId(),
          provider: SEPAY_PROVIDER,
          providerTxId: tx.providerTxId,
          amountIn: tx.amount,
          content: tx.content,
          referenceCode,
          bankTime: tx.bankTime,
          rawJson: tx.raw as Prisma.InputJsonValue,
        },
      });
      return { duplicate: false, matchStatus: BANK_MATCH_STATUS.UNMATCHED };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const existing = await this.prisma.bankTransaction.findUnique({
        where: {
          provider_providerTxId: { provider: SEPAY_PROVIDER, providerTxId: tx.providerTxId },
        },
        select: { matchStatus: true },
      });
      /*
       * Không đọc lại được dòng vừa đụng unique (bị admin xoá ngay giữa chừng là trường hợp duy
       * nhất) ⇒ coi như ĐÃ CÓ KẾT LUẬN: chọn hướng an toàn về phía không cộng tiền lần nữa.
       */
      return { duplicate: true, matchStatus: existing?.matchStatus ?? BANK_MATCH_STATUS.MATCHED };
    }
  }

  /**
   * Ghi LÝ DO một giao dịch không khớp được — ADR 0045 điều 4.
   *
   * Trạng thái vẫn là `unmatched` (nó CHƯA được áp vào đâu, và đó là sự thật cần giữ), nhưng
   * `match_note` nay nói vì sao. Trước đợt này một khoản đến muộn nằm trong hàng đợi đối soát
   * không phân biệt được với một khoản webhook vừa mới nhận — và người trực phải tự đi tra từng
   * mã để biết mình đang nhìn cái gì.
   *
   * KHÔNG ghi đè ghi chú của admin: điều kiện `match_status = unmatched` trong `updateMany` giữ
   * cho một dòng đã được con người xử lý không bị máy viết lại.
   */
  private async noteUnmatched(
    db: Prisma.TransactionClient,
    providerTxId: string,
    note: string,
  ): Promise<void> {
    await db.bankTransaction.updateMany({
      where: {
        provider: SEPAY_PROVIDER,
        providerTxId,
        matchStatus: BANK_MATCH_STATUS.UNMATCHED,
      },
      data: { matchNote: note },
    });
  }

  /**
   * Áp một giao dịch đã ghi vào đích của nó — hold (`XPH…`) hoặc hoá đơn gói (`XPG…`).
   *
   * Lượt cập nhật `match_status` nằm TRONG chính transaction này, cùng với lượt cộng tiền: đó là
   * thứ làm cho `unmatched` có nghĩa "chưa áp gì" ở lần webhook sau.
   */
  private async matchWithinTx(
    db: Prisma.TransactionClient,
    tx: ParsedTransaction,
    referenceCode: string,
  ): Promise<{ matched: boolean; note: string | null }> {
    const target = referenceCodeTarget(referenceCode);

    // `XPH…` — khoản giữ chỗ của khách (R3, ADR 0022 điều 3). Đủ tiền thì ĐƠN THUÊ được tạo
    // ngay trong transaction này, cùng kỷ luật với kích hoạt gói: tiền về là hiệu lực, không
    // phụ thuộc trình duyệt khách có quay lại hay không.
    if (target === BANK_MATCH_TARGET_TYPE.BOOKING_HOLD) {
      const applied = await this.holds.applyBankPaymentWithinTx(db, {
        code: referenceCode,
        amount: tx.amount,
        providerTxId: tx.providerTxId,
      });
      switch (applied.outcome) {
        case 'hold_not_found':
          /*
           * Mã đúng dạng nhưng không có hold nào — gõ nhầm, hoặc một mã từ môi trường khác.
           * Ghi LÝ DO lên chính giao dịch: hàng đợi đối soát của admin phải nói được vì sao một
           * dòng nằm đó, nếu không nó chỉ là một danh sách tiền không ai biết phải làm gì.
           */
          await this.noteUnmatched(
            db,
            tx.providerTxId,
            `Không tìm thấy khoản giữ chỗ mang mã ${referenceCode}`,
          );
          return { matched: false, note: 'hold_not_found' };
        case 'hold_closed':
          /*
           * TIỀN VỀ MUỘN — hold đã hết hạn/đã huỷ/đã chốt (ADR 0044 điều 7, ADR 0045 điều 4).
           *
           * Tuyệt đối KHÔNG tạo đơn: chỗ đó có thể đã thuộc về khách khác. Khoản tiền ở lại
           * `bank_transactions` với `match_status = unmatched` và một ghi chú nói rõ nó là
           * khoản đến muộn — đó là đầu vào của hàng đợi đối soát, nơi admin khớp tay vào đúng
           * hold (nếu còn nhận được) hoặc mở đường hoàn cho khách.
           */
          await this.noteUnmatched(
            db,
            tx.providerTxId,
            `Tiền về sau khi khoản giữ chỗ ${referenceCode} đã đóng (${applied.status}) — cần đối soát tay: khớp lại hoặc hoàn khách`,
          );
          return { matched: false, note: `hold_${applied.status}` };
        case 'partial':
        case 'already_paid':
        case 'activated':
          await this.markMatched(db, tx.providerTxId, {
            type: BANK_MATCH_TARGET_TYPE.BOOKING_HOLD,
            refId: applied.holdId,
            overpaid: applied.outcome === 'already_paid',
          });
          return { matched: true, note: applied.outcome };
      }
    }

    if (target !== BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE) {
      return { matched: false, note: null };
    }

    const applied = await this.billing.applyBankPaymentWithinTx(db, {
      code: referenceCode,
      amount: tx.amount,
      providerTxId: tx.providerTxId,
    });

    switch (applied.outcome) {
      case 'invoice_not_found':
        // Mã đúng định dạng nhưng không có hoá đơn — gõ tay sai một ký tự, hoặc mã của môi
        // trường khác. Nằm lại hàng đợi.
        return { matched: false, note: 'invoice_not_found' };
      case 'invoice_closed':
        return { matched: false, note: `invoice_${applied.status}` };
      case 'partial':
      case 'already_paid':
      case 'activated':
        await this.markMatched(db, tx.providerTxId, {
          type: BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE,
          refId: applied.invoiceId,
          overpaid: applied.outcome === 'already_paid',
        });
        return { matched: true, note: applied.outcome };
    }
  }

  /** Đóng dấu đã khớp — `updateMany` theo khoá unique để không phải cầm `id` của dòng vừa ghi. */
  private async markMatched(
    db: Prisma.TransactionClient,
    providerTxId: string,
    target: { type: string; refId: string; overpaid: boolean },
  ): Promise<void> {
    await db.bankTransaction.updateMany({
      where: { provider: SEPAY_PROVIDER, providerTxId },
      data: {
        matchStatus: BANK_MATCH_STATUS.MATCHED,
        matchedType: target.type,
        matchedRefId: target.refId,
        matchedAt: new Date(),
        // `already_paid` là tiền THỪA — ghi chú để màn đối soát không phải suy.
        matchNote: target.overpaid ? 'overpaid' : null,
      },
    });
  }
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Rút mã đối soát từ nội dung chuyển khoản.
 *
 * Ngân hàng chèn đủ thứ quanh nội dung người gửi (mã tham chiếu, dấu chấm, viết liền), nên tìm
 * theo MẪU `tiền tố + đúng N ký tự thuộc bảng chữ sinh mã` thay vì tách từ. Bảng chữ đã bỏ
 * `0/O/1/I` nên mẫu này gần như không khớp nhầm chữ thường ngẫu nhiên.
 */
function extractReferenceCode(content: string): string | null {
  const prefixes = Object.values(REFERENCE_CODE_PREFIX).join('|');
  const pattern = new RegExp(
    `(?:${prefixes})[${REFERENCE_CODE_ALPHABET}]{${REFERENCE_CODE_BODY_LENGTH}}`,
    'i',
  );
  const match = content.toUpperCase().match(pattern);
  return match ? match[0] : null;
}

/**
 * Các trường tối thiểu đã bóc được từ một webhook — thứ mọi bước sau (ghi thô, khớp) làm việc
 * trên đó. Đặt tên riêng thay vì nội tuyến trong `ParsedWebhook` vì `recordTransaction` và
 * `matchWithinTx` đều nhận đúng hình dạng này.
 */
type ParsedTransaction = {
  providerTxId: string;
  amount: Prisma.Decimal;
  content: string;
  bankTime: Date | null;
  raw: Record<string, unknown>;
};

type ParsedWebhook = { ok: false; reason: string } | { ok: true; value: ParsedTransaction };
/**
 * Bóc các trường tối thiểu từ payload SePay. Phòng thủ từng trường: đây là dữ liệu NGOÀI,
 * đổi định dạng không báo trước, và một field lạ không được làm sập đường tiền.
 */
function parseWebhookPayload(payload: unknown): ParsedWebhook {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, reason: 'payload_not_object' };
  }
  const raw = payload as Record<string, unknown>;

  // Chỉ nhận tiền VÀO — webhook SePay có thể bật cả chiều ra; sổ này chỉ ghi chiều vào (ADR 0022).
  const transferType = typeof raw['transferType'] === 'string' ? raw['transferType'] : 'in';
  if (transferType !== 'in') return { ok: false, reason: 'transfer_out_ignored' };

  const idValue = raw['id'];
  const providerTxId =
    typeof idValue === 'number' || typeof idValue === 'string' ? String(idValue).trim() : '';
  if (!providerTxId) return { ok: false, reason: 'missing_tx_id' };

  const amountValue = raw['transferAmount'];
  const amountNumber =
    typeof amountValue === 'number'
      ? amountValue
      : typeof amountValue === 'string'
        ? Number(amountValue)
        : NaN;
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    return { ok: false, reason: 'invalid_amount' };
  }

  const content = typeof raw['content'] === 'string' ? raw['content'] : '';

  let bankTime: Date | null = null;
  if (typeof raw['transactionDate'] === 'string') {
    // SePay gửi `YYYY-MM-DD HH:mm:ss` GIỜ VIỆT NAM, không kèm múi giờ — gắn +07:00 tường minh,
    // để `new Date(...)` khỏi hiểu theo múi giờ của server.
    const candidate = new Date(`${raw['transactionDate'].replace(' ', 'T')}+07:00`);
    bankTime = Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  return {
    ok: true,
    value: {
      providerTxId,
      amount: new Prisma.Decimal(amountNumber),
      content,
      bankTime,
      raw,
    },
  };
}
