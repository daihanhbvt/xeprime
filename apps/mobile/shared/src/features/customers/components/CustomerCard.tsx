import { memo, useCallback } from 'react';
import { Linking, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { customerStatusOf, isZeroMoney } from '@xeprime/domain';
import { LineIcon } from '@/components/icons/LineIcon';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/DataRow';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, space, typeScale } from '@/theme/tokens';
import type { TenantCustomer } from '../api';

/** Figma "Users List" `24486:58758`: ảnh tròn 40; nút gọi tròn 34 chứa icon 16. */
const AVATAR_SIZE = 40;
const CALL_BUTTON_SIZE = 34;
const CALL_ICON_SIZE = 16;
const CHEVRON_SIZE = 14;
const body = { fos: typeScale.body.fontSize, lh: typeScale.body.lineHeight } as const;
const label = { fos: typeScale.label.fontSize, lh: typeScale.label.lineHeight } as const;

/**
 * MỘT KHÁCH trong sổ — Figma Partner-XePrime "Users List" `24486:59053` (thẻ `24486:58968`).
 *
 * Đầu thẻ: ảnh + tên + SĐT, bên phải nút gọi tròn. Dải nhãn: MỘT nhãn trạng thái suy bằng
 * `customerStatusOf` (cùng hàm với web) + viên "N đơn đang chạy". Chân thẻ sau vạch kẻ: "N hoàn tất ·
 * ngày thuê cuối" bên trái, công nợ + mũi tên bên phải. Cả thẻ bấm được để mở hồ sơ (không còn nút
 * "Xem hồ sơ" — người dùng 25/11/2026).
 */
function CustomerCardImpl({
  customer,
  canViewFinance,
  onPress,
}: {
  customer: TenantCustomer;
  /**
   * Quyền đọc ở MÀN, không ở thẻ: thẻ nằm trong danh sách dài và không nên gọi `usePermissions()`
   * một lần cho mỗi dòng. Ẩn số tiền chỉ là trang trí — chặn thật là guard backend + `null` mà
   * server trả về cho ba trường tiền.
   */
  canViewFinance: boolean;
  onPress: (customer: TenantCustomer) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Customers.card');
  const tApp = useTranslations('Customers.app.card');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const open = useCallback(() => onPress(customer), [onPress, customer]);
  const call = useCallback(() => {
    void Linking.openURL(`tel:${customer.phone}`);
  }, [customer.phone]);

  const status = customerStatusOf(customer, canViewFinance);
  const statusLabel =
    status.key === 'unclassified'
      ? t('unclassified')
      : domainLabel('tenantCustomerRelationship', status.key);

  // `null` = KHÔNG được xem tiền (server quyết) - ẩn hẳn, không phải 0 đồng.
  const debt = customer.debtAmount;
  const showDebt = canViewFinance && debt != null;
  const inDebt = debt != null && !isZeroMoney(debt);

  const completed = fmt.count(customer.completedRentalCount);
  const completedLine = customer.lastRentalAt
    ? tApp('completedWithDate', { count: completed, date: fmt.date(customer.lastRentalAt) })
    : tApp('completedOnly', { count: completed });

  return (
    <Card onPress={open} accessibilityLabel={customer.fullName}>
      <YStack gap={space.sm}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <XStack f={1} minWidth={0} ai="center" gap={10}>
            <Avatar name={customer.fullName} url={customer.avatarUrl ?? null} size={AVATAR_SIZE} />
            <YStack f={1} minWidth={0} gap={2}>
              <Text col={colors.text} {...body} fow={fontWeight.semibold} numberOfLines={1}>
                {customer.fullName}
              </Text>
              <Text col={colors.placeholder} {...label} numberOfLines={1}>
                {customer.phone}
              </Text>
            </YStack>
          </XStack>
          <Pressable
            onPress={call}
            accessibilityRole="button"
            accessibilityLabel={tApp('call', { name: customer.fullName })}
            hitSlop={6}
          >
            <YStack
              w={CALL_BUTTON_SIZE}
              h={CALL_BUTTON_SIZE}
              br={CALL_BUTTON_SIZE / 2}
              bw={1}
              bc={colors.border}
              bg={colors.background}
              ai="center"
              jc="center"
            >
              <LineIcon name="calling" size={CALL_ICON_SIZE} color={colors.textMuted} />
            </YStack>
          </Pressable>
        </XStack>

        <XStack ai="center" gap={6}>
          <Pill label={statusLabel} tone={pillToneOfStatusColor(status.color)} />
          <Pill
            label={t('activeBookings', { count: customer.activeBookingCount })}
            tone="info"
            borderless
          />
        </XStack>

        <Divider />

        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text f={1} minWidth={0} col={colors.placeholder} {...label} numberOfLines={1}>
            {completedLine}
          </Text>
          <XStack ai="center" gap={4} flexShrink={0}>
            {showDebt ? (
              <Text col={colors.danger} {...label} fow={fontWeight.semibold} numberOfLines={1}>
                {inDebt ? tApp('debt', { amount: fmt.money(debt) }) : tApp('noDebt')}
              </Text>
            ) : null}
            <LineIcon name="chevron-right-sm" size={CHEVRON_SIZE} color={colors.placeholder} />
          </XStack>
        </XStack>
      </YStack>
    </Card>
  );
}

export const CustomerCard = memo(CustomerCardImpl);
