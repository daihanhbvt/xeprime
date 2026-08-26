import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { newId } from '@xeprime/prisma';
import { API_ERROR_CODE } from '@xeprime/types';
import { PrismaService } from '../../../prisma/prisma.service';
import { SocialAuthFailure } from './social-auth.error';

/**
 * One-time code sống bao lâu.
 *
 * 60 giây, và ngắn là có chủ đích: khoảng cách giữa lúc trình duyệt hệ thống đóng lại và lúc app
 * gọi `exchange` được đo bằng mili giây. Mọi thời gian dư ra chỉ là cửa sổ cho người khác dùng
 * một mã đã bị nhặt từ log deep link của hệ điều hành.
 */
const CODE_TTL_MS = 60 * 1000;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Cầu nối giữa deep link và cặp token của app native — ADR 0019 + 0017.
 *
 * Chủ sở hữu DUY NHẤT của bảng `native_auth_codes`.
 *
 * Vì sao tồn tại: web kết thúc luồng OAuth bằng `Set-Cookie`, còn app native thì không dùng
 * cookie. Nhưng cũng KHÔNG trả thẳng cặp token ở deep link — deep link đi qua hệ điều hành và
 * nằm lại trong log của nó, nên một refresh token 60 ngày ở đó là bí mật dài hạn bị ghi ra đĩa.
 *
 * Thứ đi qua deep link vì thế là một mã sống 60 giây, dùng một lần, và **chỉ đổi được khi kèm
 * `code_verifier`** mà app giữ trong bộ nhớ tiến trình của nó.
 */
@Injectable()
export class NativeAuthCodeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Phát mã cho một user vừa xác thực xong. Trả CODE TRẦN — chỉ hash của nó được lưu. */
  async issue(params: { userId: string; codeChallenge: string }): Promise<string> {
    const code = randomBytes(32).toString('base64url');

    await this.prisma.nativeAuthCode.create({
      data: {
        id: newId(),
        userId: params.userId,
        codeHash: sha256Hex(code),
        codeChallenge: params.codeChallenge,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    return code;
  }

  /**
   * Đổi mã lấy `userId` — sau khi kiểm PKCE. Ném `SOCIAL_STATE_INVALID` nếu hỏng ở bất kỳ đâu.
   *
   * `updateMany` rồi kiểm `count === 1` chứ KHÔNG đọc-rồi-ghi: hai lời gọi song song cùng một mã
   * (app retry, hoặc kẻ tấn công chạy đua với app thật) đều thấy `consumed_at IS NULL` nếu ta đọc
   * trước. Một câu UPDATE có điều kiện là chỗ Postgres tự phân xử.
   *
   * Điều kiện hết hạn nằm TRONG cùng câu update, không tách ra kiểm sau — tách ra là mở lại đúng
   * khe thời gian vừa đóng.
   */
  async consume(code: string, codeVerifier: string): Promise<{ userId: string }> {
    const codeHash = sha256Hex(code);

    const { count } = await this.prisma.nativeAuthCode.updateMany({
      where: { codeHash, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (count !== 1) throw this.invalid('code không tồn tại, đã hết hạn, hoặc đã dùng');

    const row = await this.prisma.nativeAuthCode.findUnique({
      where: { codeHash },
      select: { userId: true, codeChallenge: true },
    });
    if (!row) throw this.invalid('code biến mất sau khi consume');

    /*
     * PKCE: `code_verifier` là thứ duy nhất chứng minh người gọi `exchange` chính là app đã mở
     * trình duyệt. Trên Android, custom scheme không độc quyền — một app khác đăng ký `xeprime://`
     * nhận được cùng deep link đó. Nó có `code`, nhưng không có `code_verifier`.
     *
     * Mã ĐÃ bị đánh dấu tiêu thụ ở trên trước khi tới đây, và đó là cố ý: một lần đoán sai
     * verifier cũng đốt luôn mã, không cho thử lần hai.
     */
    const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
    if (challenge !== row.codeChallenge) throw this.invalid('code_verifier không khớp');

    return { userId: row.userId };
  }

  /**
   * MỘT mã lỗi cho mọi nguyên nhân, cố ý: phân biệt "code sai" với "verifier sai" cho kẻ tấn công
   * biết mình đã đoán trúng nửa nào. Với app thật thì lối đi tiếp giống hệt nhau — đăng nhập lại.
   */
  private invalid(detail: string): SocialAuthFailure {
    return new SocialAuthFailure(API_ERROR_CODE.SOCIAL_STATE_INVALID, detail);
  }
}
