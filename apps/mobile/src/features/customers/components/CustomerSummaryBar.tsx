import { useMemo } from 'react';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { TENANT_CUSTOMER_RETURNING_MIN_RENTALS } from '@xeprime/types';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatGrid, type StatCell } from '@/components/ui/StatGrid';
import { useAppFormat } from '@/i18n/use-app-format';
import { layout } from '@/theme/layout';
import { colors, radius, space } from '@/theme/tokens';
import { useCustomerSummary } from '../hooks/use-customers';

/**
 * Chiều cao khung chờ — xấp xỉ chiều cao thật của thẻ hai hàng, để danh sách không nhảy khi dữ
 * liệu về: mỗi hàng là đệm dọc (8×2) + dòng số (~21) + khe (2) + nhãn MỘT dòng (~16), cộng kẻ
 * chia giữa hai hàng.
 */
const SKELETON_HEIGHT = 112;

/**
 * Dải chỉ số đầu sổ khách — bốn con số của web, cùng phép đếm (backend `groupBy`), nói về CẢ sổ
 * chứ không phụ thuộc trang hay bộ lọc hiện tại.
 *
 * Bảng số do `<StatGrid>` vẽ — cùng component với dải chỉ số của hồ sơ khách, nên hai màn không
 * trôi khỏi nhau. Khối này chỉ còn lo VỎ (lề sát mép màn, khung phẳng) và việc chọn ô nào.
 *
 * Nhãn hiện ra là bản `*Short`, nhãn web đầy đủ đi vào `fullLabel`: ô rộng ~145dp nên "Cần lưu ý
 * / từ chối phục vụ" xuống hai dòng và làm lệch cả dải. Hai bản nằm cùng namespace `Customers`,
 * không phải một file message riêng cho native.
 *
 * Ô công nợ **biến mất hoàn toàn** khi thiếu `finance.view`: "không được xem" và "không có nợ" là
 * hai chuyện khác nhau, và một số 0 giả sẽ được đọc như sự thật. Backend trả `null` cho đúng lý
 * do đó — lúc đó hàng dưới chỉ còn một ô và nó chiếm trọn bề ngang.
 *
 * Hỏng thì tự ẩn — cùng cách `FleetSummaryBar` làm: dải chỉ số là phụ trợ, không được chặn danh
 * sách phía dưới, và cũng không được rơi về một hàng số 0 mà người dùng không có cách nào biết
 * là giả.
 */
export function CustomerSummaryBar({
  enabled,
  canViewFinance,
}: {
  enabled: boolean;
  canViewFinance: boolean;
}) {
  const t = useTranslations('Customers.summary');
  const fmt = useAppFormat();
  const { data, isLoading, isError } = useCustomerSummary(enabled);

  const cells = useMemo<StatCell[]>(() => {
    if (!data) return [];

    const riskCount = data.watchlistCustomers + data.blockedCustomers;
    const showDebt = canViewFinance && data.totalDebt !== null;
    const hasDebt = (data.debtCustomers ?? 0) > 0;

    return [
      {
        key: 'active',
        icon: 'people-outline',
        label: t('activeShort'),
        fullLabel: t('active'),
        value: fmt.count(data.activeCustomers),
        tone: colors.info,
      },
      {
        key: 'returning',
        icon: 'ribbon-outline',
        label: t('returningShort', { count: TENANT_CUSTOMER_RETURNING_MIN_RENTALS }),
        fullLabel: t('returning', { count: TENANT_CUSTOMER_RETURNING_MIN_RENTALS }),
        value: fmt.count(data.returningCustomers),
        tone: colors.success,
      },
      ...(showDebt
        ? [
            {
              key: 'debt',
              icon: 'wallet-outline' as const,
              label: t('debtShort', { count: data.debtCustomers ?? 0 }),
              fullLabel: t('debt', { count: data.debtCustomers ?? 0 }),
              /*
               * Số ĐẦY ĐỦ, không rút gọn: đây là tiền người ta phải đi đòi, và "12,5tr" thì
               * không đối chiếu được với bất cứ con số nào ở hồ sơ khách hay sổ Thu-Chi.
               * `adjustsFontSizeToFit` của `StatGrid` lo ca hiếm — khoản nợ mười chữ số.
               */
              value: fmt.money(data.totalDebt),
              tone: hasDebt ? colors.danger : colors.textMuted,
              ...(hasDebt ? { valueTone: colors.danger } : {}),
            },
          ]
        : []),
      {
        key: 'risk',
        icon: riskCount > 0 ? 'alert-circle-outline' : 'shield-checkmark-outline',
        label: t('riskShort'),
        fullLabel: t('risk'),
        value: fmt.count(riskCount),
        tone: riskCount > 0 ? colors.danger : colors.textMuted,
        ...(riskCount > 0 ? { valueTone: colors.danger } : {}),
      },
    ];
  }, [data, canViewFinance, t, fmt]);

  if (!enabled || isError) return null;

  if (isLoading) {
    return (
      <XStack px={layout.screenX} pb={space.sm}>
        <Skeleton width="100%" height={SKELETON_HEIGHT} />
      </XStack>
    );
  }

  if (!data) return null;

  return (
    <YStack
      mx={layout.screenX}
      mb={space.sm}
      br={radius.md}
      bw={1}
      bc={colors.borderSubtle}
      bg={colors.surface}
      ov="hidden"
      accessibilityLabel={t('ariaLabel')}
    >
      <StatGrid cells={cells} />
    </YStack>
  );
}
