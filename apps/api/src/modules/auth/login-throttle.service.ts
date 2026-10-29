import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import { API_ERROR_CODE, LOGIN_LOCKOUT_POLICY, type AccountRealm } from '@xeprime/types';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Khoá đăng nhập theo ĐỊNH DANH — ADR 0076 điều 3. Writer DUY NHẤT của `login_throttles`.
 *
 * `@Throttle` ở controller giới hạn theo IP: một máy dò được 5 mật khẩu/phút, nhưng một mạng botnet
 * dò được 5 × số IP. Ở đây đếm lần sai của MỘT định danh trong một realm, bất kể tới từ đâu.
 *
 * Định danh không có tài khoản bị đếm và khoá Y HỆT định danh có tài khoản — `LOGIN_TEMPORARILY_LOCKED`
 * vì thế không tố cáo ai có tài khoản. Khoá theo `(realm, sha256(định danh đã chuẩn hoá))`: bảng
 * không giữ SĐT/email thô.
 *
 * Đổi chác có chủ đích: kẻ xấu biết SĐT của ai đó có thể làm người đó bị khoá đăng nhập 15 phút.
 * Đó là cái giá nhỏ hơn hẳn việc để mật khẩu của họ bị dò không giới hạn, và "Quên mật khẩu" (OTP về
 * chính máy họ) mở khoá ngay (`clear`).
 */
@Injectable()
export class LoginThrottleService {
  constructor(private readonly prisma: PrismaService) {}

  static hashIdentifier(normalizedIdentifier: string): string {
    return createHash('sha256').update(normalizedIdentifier, 'utf8').digest('hex');
  }

  /** Đang khoá ⇒ ném 429 `LOGIN_TEMPORARILY_LOCKED`. Gọi TRƯỚC khi so mật khẩu. */
  async assertNotLocked(realm: AccountRealm, normalizedIdentifier: string): Promise<void> {
    const row = await this.prisma.loginThrottle.findUnique({
      where: {
        realm_identifierHash: {
          realm,
          identifierHash: LoginThrottleService.hashIdentifier(normalizedIdentifier),
        },
      },
      select: { lockedUntil: true },
    });
    if (row?.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
      throw lockedError(row.lockedUntil);
    }
  }

  /**
   * Ghi một lần sai — MỘT câu `INSERT … ON CONFLICT` nguyên tử, không đọc-rồi-ghi: hai lượt sai song
   * song đều được đếm. Cửa sổ đã qua (hoặc lượt khoá trước đã hết) ⇒ đếm lại từ 1.
   *
   * Lượt sai CHẠM trần thì chính lượt đó trả `LOGIN_TEMPORARILY_LOCKED` thay cho
   * `INVALID_CREDENTIALS`, để người dùng biết ngay vì sao lần sau bị từ chối.
   */
  async recordFailure(realm: AccountRealm, normalizedIdentifier: string): Promise<void> {
    const max = LOGIN_LOCKOUT_POLICY.MAX_FAILURES[realm];
    const window = `${LOGIN_LOCKOUT_POLICY.WINDOW_MINUTES} minutes`;
    const lock = `${LOGIN_LOCKOUT_POLICY.LOCK_MINUTES} minutes`;
    const hash = LoginThrottleService.hashIdentifier(normalizedIdentifier);

    const [row] = await this.prisma.$queryRaw<{ locked_until: Date | null }[]>(Prisma.sql`
      INSERT INTO "login_throttles"
        ("id", "realm", "identifier_hash", "failed_count", "window_started_at", "locked_until", "updated_at")
      VALUES (${newId()}, ${realm}, ${hash}, 1, now(),
              CASE WHEN 1 >= ${max}::int THEN now() + ${lock}::interval END, now())
      ON CONFLICT ("realm", "identifier_hash") DO UPDATE SET
        "failed_count" = CASE WHEN ${staleWindow(window)} THEN 1
                              ELSE "login_throttles"."failed_count" + 1 END,
        "window_started_at" = CASE WHEN ${staleWindow(window)} THEN now()
                                   ELSE "login_throttles"."window_started_at" END,
        "locked_until" = CASE
          WHEN (CASE WHEN ${staleWindow(window)} THEN 1
                     ELSE "login_throttles"."failed_count" + 1 END) >= ${max}::int
            THEN now() + ${lock}::interval
          WHEN ${staleWindow(window)} THEN NULL
          ELSE "login_throttles"."locked_until" END,
        "updated_at" = now()
      RETURNING "locked_until"
    `);

    if (row?.locked_until && row.locked_until.getTime() > Date.now()) {
      throw lockedError(row.locked_until);
    }
  }

  /** Đăng nhập đúng, hoặc đặt lại mật khẩu xong ⇒ xoá bộ đếm của các định danh đó. */
  async clear(realm: AccountRealm, normalizedIdentifiers: readonly string[]): Promise<void> {
    if (normalizedIdentifiers.length === 0) return;
    await this.prisma.loginThrottle.deleteMany({
      where: {
        realm,
        identifierHash: { in: normalizedIdentifiers.map(LoginThrottleService.hashIdentifier) },
      },
    });
  }
}

/**
 * Cửa sổ đếm đã cũ: bắt đầu quá `window` trước, HOẶC lượt khoá trước đã hết hạn — sau khi khoá
 * xong, người dùng có lại trọn hạn mức chứ không bị khoá lại ngay ở lần sai đầu tiên.
 */
function staleWindow(window: string): Prisma.Sql {
  return Prisma.sql`("login_throttles"."window_started_at" < now() - ${window}::interval
    OR ("login_throttles"."locked_until" IS NOT NULL AND "login_throttles"."locked_until" <= now()))`;
}

function lockedError(lockedUntil: Date): HttpException {
  return new HttpException(
    {
      code: API_ERROR_CODE.LOGIN_TEMPORARILY_LOCKED,
      message: 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau',
      details: {
        retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000)),
      },
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
