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
import type { SepayWebhookResultDto } from './dto/sepay.dto';

/**
 * Đối soát tiền VÀO qua SePay — writer DUY NHẤT của `bank_transactions` (ADR 0022).
 *
 * Nguyên tắc xuyên suốt, xếp theo thứ tự sống còn:
 *
 *  1. **Ghi thô trước, khớp sau.** Dòng `bank_transactions` được chèn TRƯỚC khi biết nội dung
 *     khớp vào đâu — giao dịch không khớp được vẫn có chỗ nằm chờ admin, không bị bỏ rơi để
 *     lần retry sau chèn lại.
 *  2. **Idempotent bằng unique DB**, không bằng check tầng app: `(provider, provider_tx_id)`.
 *     Bắt P2002 = "đã xử lý rồi" → trả 200. KHÔNG BAO GIỜ trả 5xx cho một giao dịch đã nhận —
 *     SePay sẽ retry vĩnh viễn.
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
    const target = referenceCodeTarget(referenceCode);

    try {
      const result = await this.prisma.$transaction(async (db) => {
        await db.bankTransaction.create({
          data: {
            id: newId(),
            provider: 'sepay',
            providerTxId: tx.providerTxId,
            amountIn: tx.amount,
            content: tx.content,
            referenceCode,
            bankTime: tx.bankTime,
            rawJson: tx.raw as Prisma.InputJsonValue,
          },
        });

        // Chỉ hoá đơn gói đi tự động ở R2. `XPH…` (giữ chỗ — R3) và mã không nhận ra đều nằm
        // lại `unmatched` cho admin; KHÔNG đoán (nguyên tắc 4).
        if (target !== BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE || !referenceCode) {
          return { matched: false as const, note: null };
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
            return { matched: false as const, note: 'invoice_not_found' };
          case 'invoice_closed':
            return { matched: false as const, note: `invoice_${applied.status}` };
          case 'partial':
          case 'already_paid':
          case 'activated': {
            await db.bankTransaction.updateMany({
              where: { provider: 'sepay', providerTxId: tx.providerTxId },
              data: {
                matchStatus: BANK_MATCH_STATUS.MATCHED,
                matchedType: BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE,
                matchedRefId: applied.invoiceId,
                matchedAt: new Date(),
                // `already_paid` là tiền THỪA — ghi chú để màn đối soát không phải suy.
                matchNote: applied.outcome === 'already_paid' ? 'overpaid' : null,
              },
            });
            return { matched: true as const, note: applied.outcome };
          }
        }
      });

      this.logger.log(
        `SePay ${tx.providerTxId}: ${result.matched ? 'khớp' : 'chưa khớp'}${result.note ? ` (${result.note})` : ''}`,
      );
      return { received: true, duplicate: false, matched: result.matched, note: result.note };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Đã nhận giao dịch này rồi — unique DB là người gác (nguyên tắc 2). 200 để SePay thôi.
        return { received: true, duplicate: true, matched: false, note: null };
      }
      throw error;
    }
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

type ParsedWebhook =
  | { ok: false; reason: string }
  | {
      ok: true;
      value: {
        providerTxId: string;
        amount: Prisma.Decimal;
        content: string;
        bankTime: Date | null;
        raw: Record<string, unknown>;
      };
    };

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
