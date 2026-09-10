import { useMemo, useState } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { InlineAction } from '@/components/ui/InlineAction';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { FinanceEntityPanel } from '@/features/finance/components/FinanceEntityPanel';
import { ReceiptCard } from '@/features/finance/components/ReceiptCard';
import { ReceiptDetailSheet } from '@/features/finance/components/ReceiptDetailSheet';
import { ENTITY_RECEIPTS_PREVIEW_LIMIT } from '@/features/finance/constants';
import { useReceipts } from '@/features/finance/hooks/use-finance';
import { ROUTES } from '@/navigation/routes';
import { space } from '@/theme/tokens';

/**
 * Tiền của MỘT khách (khu "Thu chi" của CUS-02).
 *
 * Hai tầng, cố ý xếp theo thứ tự này:
 *  1. **Doanh thu theo kỳ** — `FinanceEntityPanel`, ĐÚNG khối mà hồ sơ xe dùng, chỉ khác mệnh đề
 *     thu hẹp. Nhờ vậy con số ở hồ sơ khách và dòng của họ trong bảng tổng quan không thể lệch.
 *  2. **Danh sách phiếu gần nhất** — bằng chứng đằng sau con số đó, mỗi thẻ mở được CHI TIẾT.
 *
 * Con số ở đây KHÁC ba thẻ "Tổng giá trị thuê / Đã thu / Còn nợ" phía trên hồ sơ, và khác một
 * cách có chủ đích: ba thẻ đó tính trên ĐƠN (luỹ kế, để đi đòi nợ), còn khối này tính trên TIỀN
 * THẬT ĐÃ VÀO theo kỳ.
 *
 * KHÔNG có tạo/duyệt/huỷ phiếu ở đây — web cũng không có ở panel này. Thao tác đi qua chi tiết
 * phiếu hoặc sổ Thu-Chi, đúng một luồng.
 *
 * Gác quyền `finance.view` ở NƠI GỌI — tiền là quyền RIÊNG trong sổ khách (luật của S-01).
 */
export function CustomerFinancePanel({ customerId }: { customerId: string }) {
  const t = useTranslations('Customers.finance');
  const navigateOnce = useNavigateOnce();

  const [detailId, setDetailId] = useState<string | null>(null);

  const scope = useMemo(() => ({ tenantCustomerId: customerId }), [customerId]);

  const receipts = useReceipts({
    tenantCustomerId: customerId,
    limit: ENTITY_RECEIPTS_PREVIEW_LIMIT,
  });

  const receiptItems = receipts.data?.items ?? [];
  const receiptTotal = receipts.data?.meta.total ?? 0;

  return (
    <YStack gap={space.lg}>
      <FinanceEntityPanel scope={scope} kind="customer" />

      {/* ── Phiếu gần nhất, bằng chứng đằng sau con số trên ─────────────────── */}
      <YStack gap={space.md}>
        <BlockTitle>{t('list.title')}</BlockTitle>

        {receipts.isLoading && !receipts.data ? (
          <SkeletonText lines={4} />
        ) : receipts.isError && !receipts.data ? (
          <ScreenError
            error={receipts.error}
            title={t('list.error')}
            onRetry={() => void receipts.refetch()}
          />
        ) : receiptItems.length === 0 ? (
          <ScreenMessage
            icon="receipt-outline"
            title={t('list.emptyTitle')}
            description={t('list.emptyHint')}
          />
        ) : (
          <>
            {receiptItems.map((receipt) => (
              <ReceiptCard key={receipt.id} receipt={receipt} onPress={setDetailId} />
            ))}

            {receiptTotal > receiptItems.length ? (
              <InlineAction
                label={t('list.viewAll', { count: receiptTotal })}
                onPress={() =>
                  navigateOnce(ROUTES.manage.receipts({ tenantCustomerId: customerId }))
                }
              />
            ) : null}
          </>
        )}
      </YStack>

      {/* MỘT implementation chi tiết phiếu cho mọi lối vào — không dựng bản riêng cho khách. */}
      <ReceiptDetailSheet receiptId={detailId} onClose={() => setDetailId(null)} />
    </YStack>
  );
}
