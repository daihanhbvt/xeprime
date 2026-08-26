import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { newId } from '@xeprime/prisma';
import { API_ERROR_CODE, type AuthProvider } from '@xeprime/types';
import { PrismaService } from '../../../prisma/prisma.service';
import { SocialAuthFailure } from './social-auth.error';

/**
 * Bao lâu người dùng còn có thể hoàn tất một lần đăng nhập đã bắt đầu.
 *
 * 10 phút là khoảng đủ cho người phải gõ mật khẩu Google và làm 2FA, và đủ ngắn để một `state`
 * bị nhặt được ở log proxy hay lịch sử trình duyệt sớm trở thành vô dụng.
 */
const STATE_TTL_MS = 10 * 60 * 1000;

/** Bản ghi đã tiêu thụ, trả về cho chặng callback. */
export interface ConsumedOauthState {
  provider: AuthProvider;
  codeVerifier: string;
  nonce: string;
  redirectNext: string | null;
  client: string;
}

export interface IssuedOauthState {
  state: string;
  codeChallenge: string;
  nonce: string;
}

function base64Url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

/**
 * Vòng đời của một lần bấm "Đăng nhập với …" — ADR 0019.
 *
 * Chủ sở hữu DUY NHẤT của bảng `oauth_states`: không service nào khác được ghi vào đó. Đó là
 * thứ làm cho tính "dùng một lần" kiểm toán được — chỉ có một hàm có thể tiêu thụ một `state`,
 * nên chỉ có một chỗ để đọc khi cần chứng minh nó không thể bị dùng hai lần.
 */
@Injectable()
export class OauthStateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Phát `state` + PKCE cho một lần bấm nút, và lưu nửa bí mật lại phía server.
   *
   * `codeVerifier` đi vào DB; chỉ `codeChallenge` (bản băm) đi ra ngoài internet. Nhờ vậy kẻ
   * chặn được toàn bộ URL trên đường đi vẫn không đổi được `code` thành token: họ có bản băm,
   * còn Google đòi bản gốc.
   */
  async issue(params: {
    provider: AuthProvider;
    redirectNext: string | null;
    client: string;
  }): Promise<IssuedOauthState> {
    const state = base64Url(randomBytes(32));
    const codeVerifier = base64Url(randomBytes(32));
    const nonce = base64Url(randomBytes(16));

    await this.prisma.oauthState.create({
      data: {
        id: newId(),
        provider: params.provider,
        state,
        codeVerifier,
        nonce,
        redirectNext: params.redirectNext,
        client: params.client,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });

    return {
      state,
      nonce,
      codeChallenge: base64Url(createHash('sha256').update(codeVerifier).digest()),
    };
  }

  /**
   * Đánh dấu đã dùng và trả về nội dung — hoặc ném `SOCIAL_STATE_INVALID`.
   *
   * `updateMany` rồi kiểm `count === 1` chứ KHÔNG phải đọc-rồi-ghi: hai callback gửi song song
   * cùng một `state` (người dùng bấm F5 ở trang callback, hoặc kẻ tấn công phát lại URL) đều sẽ
   * thấy `consumed_at IS NULL` nếu ta đọc trước. Một câu UPDATE có điều kiện là chỗ Postgres tự
   * phân xử: đúng một trong hai đổi được hàng, người kia nhận `count = 0`.
   *
   * Điều kiện `expiresAt` nằm trong CÙNG câu update, không tách ra kiểm sau — tách ra là mở lại
   * đúng khe thời gian vừa đóng.
   */
  async consume(state: string): Promise<ConsumedOauthState> {
    const { count } = await this.prisma.oauthState.updateMany({
      where: { state, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });

    if (count !== 1) {
      throw new SocialAuthFailure(
        API_ERROR_CODE.SOCIAL_STATE_INVALID,
        'state không tồn tại, đã hết hạn, hoặc đã dùng',
      );
    }

    const row = await this.prisma.oauthState.findUnique({
      where: { state },
      select: {
        provider: true,
        codeVerifier: true,
        nonce: true,
        redirectNext: true,
        client: true,
      },
    });

    // Không xảy ra được (vừa update thành công đúng hàng đó), nhưng `findUnique` trả nullable và
    // ép non-null bằng `!` ở một đường xác thực là thói quen tồi.
    if (!row) {
      throw new SocialAuthFailure(API_ERROR_CODE.SOCIAL_STATE_INVALID, 'state biến mất sau khi consume');
    }

    return { ...row, provider: row.provider as AuthProvider };
  }
}
