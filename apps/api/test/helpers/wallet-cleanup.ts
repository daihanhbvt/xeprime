import type { PrismaClient } from '@xeprime/prisma';

/**
 * Gỡ NGHĨA VỤ TIỀN của tenant/user trước khi spec xoá cứng họ trong `afterAll`.
 *
 * ## Vì sao cần một bước riêng thay vì cứ `tenant.deleteMany`
 *
 * Từ 15/09/2026 `wallets.owner_user_id` và `wallets.owner_tenant_id` là `onDelete: Restrict`,
 * KHÔNG phải `Cascade` (ADR 0038 · CLAUDE.md mục 5). Đó là chủ đích: một cái ví là một khoản
 * **phải trả cho người thật**, nên xoá chủ ví không được phép lặng lẽ cuốn nghĩa vụ đó đi —
 * người xoá phải nói ra mình đã xử lý nó.
 *
 * Spec cũng phải nói ra. `afterAll` của ba spec đã viết trước constraint này, và chúng đỏ ngay
 * lần CI đầu tiên chạy trên database có migration mới:
 *
 *     Invalid `prisma.tenant.deleteMany()` invocation
 *     Foreign key constraint violated on the constraint: `wallets_owner_tenant_fkey`
 *
 * ## Vì sao nó là helper chứ không phải mười dòng chép vào từng spec
 *
 * Bốn spec cần đúng một thủ tục này, và thủ tục đó phụ thuộc vào `onDelete` của bốn bảng. Bốn
 * bản chép tay là bốn chỗ phải sửa lại vào ngày một trong bốn quy tắc đó đổi — và chỗ bị bỏ
 * sót sẽ chỉ lộ ra ở CI, trên một spec chẳng liên quan gì tới ví.
 *
 * ## Thứ tự
 *
 * `wallet_entries` và `withdrawal_requests` đều `Cascade` theo ví, nên về lý chỉ cần xoá ví.
 * Xoá tường minh cả ba vẫn đáng: `withdrawal_requests.requested_by_user_id` là `NoAction` tới
 * `users`, nên một spec xoá NGƯỜI trước khi đụng tới ví sẽ gãy ở đúng chỗ khó đọc nhất. Còn
 * `bank_accounts` thì `Cascade` theo chủ — để nguyên cho FK lo.
 */
export async function releaseWalletObligations(
  prisma: PrismaClient,
  owners: { tenantIds?: readonly string[]; userIds?: readonly string[] },
): Promise<void> {
  const tenantIds = [...(owners.tenantIds ?? [])];
  const userIds = [...(owners.userIds ?? [])];
  if (tenantIds.length === 0 && userIds.length === 0) return;

  const wallets = await prisma.wallet.findMany({
    where: {
      OR: [
        ...(tenantIds.length > 0 ? [{ ownerTenantId: { in: tenantIds } }] : []),
        ...(userIds.length > 0 ? [{ ownerUserId: { in: userIds } }] : []),
      ],
    },
    select: { id: true },
  });
  if (wallets.length === 0) return;

  const walletIds = wallets.map((w) => w.id);
  await prisma.withdrawalRequest.deleteMany({ where: { walletId: { in: walletIds } } });
  await prisma.walletEntry.deleteMany({ where: { walletId: { in: walletIds } } });
  await prisma.wallet.deleteMany({ where: { id: { in: walletIds } } });
}
