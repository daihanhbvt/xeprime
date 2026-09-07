import { memo, useCallback, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  STATUS_COLOR,
  TENANT_CUSTOMER_RETURNING_MIN_RENTALS,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_CUSTOMER_RISK_LEVEL_META,
  type TenantCustomerRiskLevel,
} from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { TenantCustomer } from '../api';

/**
 * Tỉ lệ DANH TÍNH : NHÃN trên hàng đầu.
 *
 * Chia phần CỨNG chứ không để nhãn tự co: `StatusBadge` không có bề rộng nội tại, nên cạnh một
 * tên khách dài nó bị bóp còn vài ký tự.
 *
 * 6:4 chứ không 7:3. Ở 390dp, cột nhãn của 7:3 chỉ còn ~95dp — chưa đủ cho một viên nhãn ba chữ.
 * 6:4 cho nó ~125dp, và tên khách ở 6 phần vẫn đủ cho họ tên Việt Nam đầy đủ.
 *
 * Nhãn dài hơn cột thì cắt bằng "…" trên MỘT dòng, không xuống dòng: viên nhãn hai dòng làm mỗi
 * thẻ cao một kiểu, hàng chỉ số bên dưới so le nhau và cả danh sách mất nhịp. Nghĩa đầy đủ của
 * nhãn nằm ở màn chi tiết — nơi nó có nguyên bề ngang.
 */
const IDENTITY_FLEX = 6;
const BADGE_FLEX = 4;

/**
 * MỘT KHÁCH trong sổ — bản native của thẻ mobile trong `CustomerTable` bên web.
 *
 * Mang ĐÚNG bộ dữ kiện web hiện trên thẻ, không hơn: danh tính (tên + SĐT), nhãn quan hệ/rủi ro,
 * số lần thuê, lần thuê cuối, và công nợ khi có quyền. "Số đơn đang chạy" và "Tổng giá trị" là
 * cột của BẢNG desktop — nhét chúng vào thẻ làm mỗi dòng cao thêm hai hàng cho hai con số không
 * ai quét khi lướt danh sách.
 *
 * Cả thẻ là đích chạm; mũi tên `>` cuối hàng chỉ số là DẤU HIỆU mở được, không phải nút thứ hai
 * (cùng khuôn `BookingCard`).
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
  const t = useTranslations('Customers.card');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const open = useCallback(() => onPress(customer), [onPress, customer]);

  const riskLevel = customer.riskLevel as TenantCustomerRiskLevel;
  const isNormal = riskLevel === TENANT_CUSTOMER_RISK_LEVEL.NORMAL;
  const returning = customer.completedRentalCount >= TENANT_CUSTOMER_RETURNING_MIN_RENTALS;
  const inDebt = customer.debtAmount != null && !isZeroMoney(customer.debtAmount);

  return (
    <Card onPress={open} accessibilityLabel={customer.fullName}>
      <YStack gap={space.sm}>
        {/* ── Danh tính bên trái · nhãn bên phải, chia cứng 7:3 ─────────────── */}
        <XStack ai="flex-start" gap={space.sm}>
          <Avatar name={customer.fullName} size={40} />

          <YStack f={IDENTITY_FLEX} minWidth={0} gap={2}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold} numberOfLines={1}>
              {customer.fullName}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
              {customer.phone}
            </Text>
          </YStack>

          {/*
            Mức rủi ro THAY CHỖ nhãn "khách quen" khi khác `normal` — đúng như web. Hai nhãn cùng
            lúc là hai thông điệp tranh nhau, mà cảnh báo phải thắng.
          */}
          <YStack f={BADGE_FLEX} minWidth={0} gap={space.xs}>
            {isNormal ? (
              returning ? (
                <BadgeRow>
                  <StatusBadge label={t('returning')} color={STATUS_COLOR.SUCCESS} />
                </BadgeRow>
              ) : null
            ) : (
              <BadgeRow>
                <StatusBadge
                  label={domainLabel('tenantCustomerRiskLevel', riskLevel)}
                  color={TENANT_CUSTOMER_RISK_LEVEL_META[riskLevel].color}
                />
              </BadgeRow>
            )}
            {customer.archivedAt ? (
              <BadgeRow>
                <StatusBadge label={t('archived')} color={STATUS_COLOR.NEUTRAL} size="sm" />
              </BadgeRow>
            ) : null}
          </YStack>
        </XStack>

        <YStack height={1} bg={colors.borderSubtle} />

        {/* ── Ba chỉ số của thẻ web, một hàng, mũi tên khép lại ─────────────── */}
        <XStack ai="center" gap={space.sm}>
          <Metric label={t('rentals')} value={fmt.count(customer.completedRentalCount)} />
          <Metric
            label={t('lastRentalShort')}
            value={customer.lastRentalAt ? fmt.date(customer.lastRentalAt) : t('neverRented')}
          />
          {canViewFinance ? (
            <Metric
              label={t('debt')}
              value={fmt.money(customer.debtAmount)}
              {...(inDebt ? { tone: colors.danger } : {})}
            />
          ) : null}
          <DetailChevron />
        </XStack>
      </YStack>
    </Card>
  );
}

/** Viên nhãn nằm sát mép phải của cột — xem chú thích ở chỗ gọi. */
function BadgeRow({ children }: { children: ReactNode }) {
  return <XStack jc="flex-end">{children}</XStack>;
}

/**
 * Một chỉ số: nhãn nhỏ ở trên, giá trị ở dưới. `minWidth={0}` để giá trị dài cắt bằng "…".
 *
 * KHÔNG có icon dẫn dòng. Ba icon mỗi thẻ là ba `<Text>` glyph nữa — với một trang 10 thẻ đó là
 * 30 node native cho thứ mà nhãn ngay bên cạnh đã nói rõ, và danh sách này cuộn.
 */
function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <YStack f={1} minWidth={0} gap={1}>
      <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
        {label}
      </Text>
      <Text
        col={tone ?? colors.text}
        fos={fontSize.bodySm}
        fow={fontWeight.semibold}
        numberOfLines={1}
      >
        {value}
      </Text>
    </YStack>
  );
}

export const CustomerCard = memo(CustomerCardImpl);
