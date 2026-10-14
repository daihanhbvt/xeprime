import { newId } from '@xeprime/prisma';
import { ACCOUNT_REALM, USER_STATUS } from '@xeprime/types';
import { normalizePhone } from '../../src/common/phone';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Tài khoản KHÁCH có SĐT ĐÃ XÁC MINH — người gửi yêu cầu thuê từ ADR 0060.
 *
 * `submitPublic` không còn nhận khách vãng lai: danh tính (họ tên, SĐT) đọc từ tài khoản. Spec
 * đặt xe dựng người gửi bằng hàm này thay cho các stub OTP/đăng nhập cũ.
 *
 * Tìm-hoặc-tạo theo `(realm customer, SĐT chuẩn hoá)` — đúng khoá unique của bảng — nên chạy lại
 * một spec không đẻ tài khoản trùng, và cùng một số trong một spec luôn là cùng một người (chống
 * trùng yêu cầu, sổ khách, chặn khách đều khoá theo số). Tên hiển thị được ghi đè theo lượt gọi:
 * nó là `customer_name` của yêu cầu, và spec nào khẳng định tên đó phải thấy đúng tên nó truyền.
 *
 * Xoá: `booking_requests.customer_user_id` là `ON DELETE SET NULL`, nên spec dọn tài khoản bằng
 * `prisma.user.deleteMany({ where: { id: { in: [...] } } })` ở bất kỳ thứ tự nào — trừ tài khoản
 * đã có ví (RESTRICT), thứ spec tiền tự dọn trước.
 */
export async function customerAccountFor(
  prisma: PrismaService,
  phone: string,
  displayName = 'Khách thử nghiệm',
): Promise<string> {
  const normalized = normalizePhone(phone);
  const existing = await prisma.user.findFirst({
    where: { realm: ACCOUNT_REALM.CUSTOMER, phone: normalized, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { displayName, phoneVerifiedAt: new Date(), status: USER_STATUS.ACTIVE },
    });
    return existing.id;
  }
  const id = newId();
  await prisma.user.create({
    data: {
      id,
      realm: ACCOUNT_REALM.CUSTOMER,
      phone: normalized,
      phoneVerifiedAt: new Date(),
      displayName,
      status: USER_STATUS.ACTIVE,
    },
  });
  return id;
}
