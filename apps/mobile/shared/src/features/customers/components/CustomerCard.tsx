import { memo, useCallback } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { customerStatusOf, isZeroMoney } from '@xeprime/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FactRow } from '@/components/ui/FactRow';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, space, typeScale } from '@/theme/tokens';
import type { TenantCustomer } from '../api';

/** Cùng đường kính với `RosterCard` — hai màn nhân sự/khách hàng phải cùng một đường chân. */
const AVATAR_SIZE = 40;
const body = { fos: typeScale.body.fontSize, lh: typeScale.body.lineHeight } as const;

/**
 * MỘT KHÁCH trong sổ — bản native của thẻ mobile `renderCard` trong `CustomerTable` web (Figma
 * Partner-XePrime "Users List" `23777:53057`, sổ redesign §3.4).
 *
 * Đúng khuôn web: đầu thẻ là danh tính (ảnh + tên + SĐT) và MỘT nhãn trạng thái suy bằng
 * `customerStatusOf` (cùng hàm với web, cùng từ vựng với bộ lọc "Nhóm khách"); giữa là lưới ba chỉ
 * số có vạch trên/dưới (số lần thuê · lần thuê cuối · công nợ khi được xem tiền); chân là nút
 * "Xem hồ sơ" tràn ngang. Không vạch màu mép trái, không dải nhãn phụ — đó là khuôn cũ.
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
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const open = useCallback(() => onPress(customer), [onPress, customer]);
  const status = customerStatusOf(customer, canViewFinance);
  const statusLabel =
    status.key === 'unclassified'
      ? t('unclassified')
      : domainLabel('tenantCustomerRelationship', status.key);

  // `null` = KHÔNG được xem tiền (server quyết) — gạch, không phải 0 đồng.
  const debt = customer.debtAmount;
  const debtValue = debt == null ? '-' : fmt.money(debt);
  const inDebt = debt != null && !isZeroMoney(debt);

  return (
    // Cùng khuôn thẻ Lịch sử đơn thuê (người dùng 16/11/2026): đầu thẻ danh tính + viên trạng thái,
    // các dòng nhãn/giá trị `FactRow`, chân là nút vàng dùng chung tràn ngang.
    <>
      <Card onPress={open} accessibilityLabel={customer.fullName}>
        <YStack gap={space.sm}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <XStack f={1} minWidth={0} ai="center" gap={12}>
              <Avatar name={customer.fullName} url={customer.avatarUrl ?? null} size={AVATAR_SIZE} />
              <YStack f={1} minWidth={0} gap={2}>
                <Text col={colors.text} {...body} fow={fontWeight.semibold} numberOfLines={1}>
                  {customer.fullName}
                </Text>
                <Text col={colors.textMuted} {...body} numberOfLines={1}>
                  {customer.phone}
                </Text>
              </YStack>
            </XStack>
            <Pill label={statusLabel} tone={pillToneOfStatusColor(status.color)} />
          </XStack>
          <FactRow label={t('rentals')}>{fmt.count(customer.completedRentalCount)}</FactRow>
          <FactRow label={t('lastRentalShort')}>
            {customer.lastRentalAt ? fmt.date(customer.lastRentalAt) : '-'}
          </FactRow>
          {canViewFinance ? (
            <FactRow label={t('debt')} {...(inDebt ? { tone: colors.danger } : {})}>
              {debtValue}
            </FactRow>
          ) : null}
          <YStack pt={space.xs}>
            <Button label={t('open')} variant="gradient" size="compact" onPress={open} />
          </YStack>
        </YStack>
      </Card>
    </>
  );
}

export const CustomerCard = memo(CustomerCardImpl);
