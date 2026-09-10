import { useCallback, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isNegativeMoney } from '@xeprime/domain';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatCardFooter, StatGrid, type StatCell } from '@/components/ui/StatGrid';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { ReceiptSummary } from '../api';

/**
 * Bốn con số của ĐÚNG danh sách đang xem — bản native của `ReceiptSummaryCards`.
 *
 * Điểm khác biệt so với màn Tổng quan doanh thu: thẻ ở đây cộng cùng một vị từ với danh sách bên
 * dưới (backend dùng chung `whereOf`). Một ô "Tổng thu" không khớp danh sách ngay dưới nó là cách
 * nhanh nhất khiến người dùng thôi tin cả hai con số.
 *
 * Chỉ cộng phiếu ĐÃ DUYỆT — phiếu chờ duyệt chưa phải tiền thật, và chú thích nói rõ điều đó
 * thay vì để người dùng tự đoán vì sao tổng không khớp số dòng.
 *
 * **Cùng khuôn dòng sổ với thẻ ở màn Tổng quan** (`FinanceOverviewCards`): hai vế thu/chi là hai
 * dòng, "Cân đối" là hàng TỔNG dưới vạch đậm chứ không phải chỉ số thứ ba ngang hàng với hai thứ
 * sinh ra nó, và số phiếu — thứ đếm DÒNG chứ không đếm TIỀN — xuống chân thẻ. Ba con số tiền và
 * một con số đếm đứng chung một dải là mời người đọc so chúng với nhau.
 *
 * Màu gói trong huy hiệu; con số giữ mực đen và chỉ đổi màu khi cân đối ÂM.
 */
export function ReceiptSummaryCards({
  data,
  loading,
  error,
  filtered,
}: {
  data: ReceiptSummary | undefined;
  loading: boolean;
  error: boolean;
  /** Có bộ lọc nào đang bật không — đổi câu chú thích, không đổi con số. */
  filtered: boolean;
}) {
  const t = useTranslations('Finance.receipts.summary');
  const fmt = useAppFormat();
  /*
   * Mặc định THU GỌN.
   *
   * Sổ Thu-Chi là màn người ta mở để TRA một phiếu cụ thể, không phải để đọc bốn con số tổng —
   * câu hỏi tổng quan đã có màn riêng của nó. Bày sẵn thẻ tổng thì khối đầu trang chiếm gần nửa
   * màn trước khi thấy phiếu đầu tiên, mỗi lần vào lại phải cuộn qua đúng thứ mình không đi tìm.
   * Mở nó ra chỉ tốn một cú chạm, và tiêu đề khối vẫn luôn ở đó nói rằng có gì bên trong.
   *
   * Trước mọi nhánh trả sớm: hook phải chạy ở mọi lần render, kể cả lúc lỗi hay chưa có dữ liệu.
   */
  const [collapsed, setCollapsed] = useState(true);
  const toggle = useCallback(() => setCollapsed((current) => !current), []);

  if (error && !data) return <Callout tone="warning">{t('error')}</Callout>;
  if (!data) return <SkeletonText lines={4} />;

  const cells: StatCell[] = [
    {
      key: 'income',
      icon: 'arrow-down-circle-outline',
      label: t('income'),
      value: fmt.money(data.totalIncome),
      tone: colors.success,
      surface: colors.successSurface,
      valueTone: colors.success,
      /* Hai phương thức, HAI DÒNG: nối chúng lại là hai số tiền dính thành một dòng phải dò. */
      hint: [
        t('cash', { value: fmt.money(data.incomeCash) }),
        t('transfer', { value: fmt.money(data.incomeTransfer) }),
      ],
    },
    {
      key: 'expense',
      icon: 'arrow-up-circle-outline',
      label: t('expense'),
      value: fmt.money(data.totalExpense),
      tone: colors.danger,
      surface: colors.dangerSurface,
      valueTone: colors.danger,
    },
  ];

  const total: StatCell = {
    key: 'balance',
    icon: 'swap-vertical-outline',
    label: t('balance'),
    value: fmt.money(data.balance),
    tone: colors.textMuted,
    valueTone: isNegativeMoney(data.balance) ? colors.danger : colors.success,
  };

  /* Đổi bộ lọc: GIỮ số cũ và mờ đi, thay vì nháy về skeleton rồi nhảy lại một con số khác. */
  return (
    <YStack gap={space.sm}>
      {/*
        Thu gọn được, và đó là lý do khối này có tiêu đề.

        Sổ Thu-Chi là màn để CUỘN: khối đầu trang đã chiếm gần nửa màn trước khi thấy phiếu đầu
        tiên. Người vào sổ để tra một phiếu cụ thể không cần bốn con số tổng suốt cả buổi — gấp
        chúng lại là được thêm ba thẻ phiếu trong tầm mắt, mà mở lại chỉ tốn một cú chạm.
      */}
      <BlockTitle collapsed={collapsed} onToggleCollapsed={toggle}>
        {t('title')}
      </BlockTitle>
      {collapsed ? null : (
        <Card padded={false}>
          <YStack opacity={loading ? 0.6 : 1}>
            <StatGrid variant="list" cells={cells} total={total} />
            <StatCardFooter>
              <XStack ai="center" gap={space.sm}>
                <YStack f={1} minWidth={0} gap={2}>
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('approvedCount')}
                  </Text>
                  <Text col={colors.placeholder} fos={fontSize.label}>
                    {filtered ? t('inFilter') : t('wholeBook')}
                  </Text>
                </YStack>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {fmt.count(data.approvedCount)}
                </Text>
              </XStack>
            </StatCardFooter>
          </YStack>
        </Card>
      )}
    </YStack>
  );
}
