import { USER_STATUS } from '@xeprime/types';
import type { Request } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import type { SessionService } from '../modules/auth/session.service';
import { NativeSessionService } from '../modules/auth/native-session.service';

/**
 * userId nếu request kèm credential hợp lệ và user còn active; `null` với mọi trường hợp khác.
 *
 * Dùng cho endpoint `@Public()` muốn gắn hành động vào tài khoản khi khách tình cờ đang đăng
 * nhập, nhưng vẫn phục vụ khách vãng lai. Nhận cả hai đường: session cookie (web — ADR 0002) và
 * `Authorization: Bearer` (native — ADR 0017).
 *
 * Khác `AuthGuard` ở đúng một điểm, và là điểm cố ý: ở đây **mọi thất bại đều trả `null`**, kể cả
 * header sai dạng hay hai credential cùng lúc. Guard phải nói cho client biết nó gửi sai; còn đây
 * là bề mặt CÔNG KHAI — làm một khách vãng lai nhận 401 vì cookie cũ hỏng là làm hỏng đúng luồng
 * mà endpoint này tồn tại để phục vụ.
 *
 * `nativeSessions` là tham số CUỐI và tuỳ chọn: hai nơi gọi hiện có
 * (`public-booking-requests`, `phone-verification`) không phải sửa chữ ký, và nơi nào chưa truyền
 * thì chỉ mất nhánh Bearer — không đổi hành vi cookie.
 */
export async function resolveOptionalUserId(
  req: Request,
  sessions: SessionService,
  prisma: PrismaService,
  nativeSessions?: NativeSessionService,
): Promise<string | null> {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[sessions.cookieName];
  const authHeader = req.headers.authorization;

  // Hai credential cùng lúc: không đoán bên nào (cùng lý do với AuthGuard), coi như khách vãng lai.
  if (cookieToken && authHeader) return null;

  const claim = authHeader
    ? bearerClaim(authHeader, nativeSessions)
    : cookieClaim(cookieToken, sessions);
  if (!claim) return null;

  const user = await prisma.user.findFirst({
    where: { id: claim.userId, status: USER_STATUS.ACTIVE, deletedAt: null },
    select: { id: true },
  });
  if (!user) return null;

  /*
   * Với Bearer còn phải hỏi phiên có bị thu hồi chưa.
   *
   * Không có bước này thì một access token của thiết bị đã đăng xuất vẫn gắn được hành động vào
   * tài khoản đó ở các endpoint công khai — đúng thứ `revoked_at` tồn tại để chặn.
   */
  if (claim.sessionId !== null && nativeSessions) {
    if (!(await nativeSessions.isSessionUsable(claim.sessionId, user.id))) return null;
  }

  return user.id;
}

interface OptionalClaim {
  userId: string;
  /** `null` với cookie: phiên web không có bảng để tra (ADR 0002). */
  sessionId: string | null;
}

function cookieClaim(token: string | undefined, sessions: SessionService): OptionalClaim | null {
  if (!token) return null;
  try {
    return { userId: sessions.verify(token).sub, sessionId: null };
  } catch {
    return null;
  }
}

function bearerClaim(
  authHeader: string,
  nativeSessions: NativeSessionService | undefined,
): OptionalClaim | null {
  if (!nativeSessions) return null;
  try {
    const token = NativeSessionService.parseBearer(authHeader);
    if (!token) return null;
    const payload = nativeSessions.verifyAccessToken(token);
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}
