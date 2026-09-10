import { memo, useCallback } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  STATUS_COLOR,
  TENANT_CUSTOMER_RETURNING_MIN_RENTALS,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_CUSTOMER_RISK_LEVEL_META,
  type StatusColor,
  type TenantCustomerRiskLevel,
} from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { Avatar } from '@/components/ui/Avatar';
import { BadgeRows, type BadgeRowItem } from '@/components/ui/BadgeRows';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { TenantCustomer } from '../api';

/** Cùng đường kính với `MemberCard` — hai màn nhân sự/khách hàng phải cùng một đường chân. */
const AVATAR_SIZE = 36;

/**
 * MỘT KHÁCH trong sổ — bản native của thẻ mobile trong `CustomerTable` bên web.
 *
 * Mang ĐÚNG bộ dữ kiện web hiện trên thẻ, không hơn: danh tính (tên + SĐT), nhãn quan hệ/rủi ro,
 * số lần thuê, lần thuê cuối, và công nợ khi có quyền. "Số đơn đang chạy" và "Tổng giá trị" là
 * cột của BẢNG desktop — nhét chúng vào thẻ làm mỗi dòng cao thêm hai hàng cho hai con số không
 * ai quét khi lướt danh sách.
 *
 * **Cùng khuôn với thẻ Chi nhánh · Tài xế · Nhân sự**: vạch màu ở mép trái, danh tính bên trái,
 * nhãn dẫn đầu ở góc trên phải, dải nhãn phụ bên dưới. Ba màn đó nằm cùng một menu với màn này,
 * và ba nhịp khác nhau thì đọc ra như ba sản phẩm.
 *
 * Bản trước chia cứng 6:4 giữa danh tính và cột nhãn để viên nhãn không bị bóp. Không cần nữa:
 * viên nhãn KHÔNG khai `flexShrink`, nên nó giữ bề rộng tự nhiên và phần co là của cái tên —
 * đúng cơ chế ba thẻ kia đang chạy, và bớt được một cặp hằng số phải chỉnh tay theo bề ngang máy.
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
  /* Nợ chỉ được nhắc tới khi người xem có quyền tài chính — xem `accent` bên dưới. */
  const showsDebt = canViewFinance && inDebt;

  /**
   * MỌI tín hiệu về khách này, xếp theo thứ tự đáng chú ý — MỘT danh sách, không ba nhánh rời.
   *
   * Viên đầu là nhãn DẪN ĐẦU ở góc trên phải **và** là màu của vạch mép trái; phần còn lại xuống
   * dải nhãn. Gộp làm một là thứ giữ cho vạch không bao giờ nói khác chip: bản trước tính màu
   * vạch bằng một chuỗi điều kiện riêng, nên một khách quen còn nợ hiện chip XANH mà vạch CAM —
   * hai kênh cùng mô tả một người mà chỏi nhau thì người đọc tin kênh nào?
   *
   * Thứ tự là thứ tự của VIỆC PHẢI LÀM, không phải của mức độ xấu:
   *  1. rủi ro ⇒ cảnh báo phải thắng mọi thứ khác;
   *  2. đã lưu trữ ⇒ bản ghi không còn hoạt động, y như chi nhánh đã ngừng;
   *  3. khách quen ⇒ quan hệ tốt, đáng thấy khi lướt;
   *  4. còn nợ ⇒ việc còn phải đi thu.
   *
   * Nợ CHỈ vào danh sách khi người xem có `canViewFinance`. Vạch màu là một kênh thông tin thật:
   * để nó chuyển vàng vì công nợ trước mặt một nhân viên không được xem tiền là rò đúng thứ mà
   * cột tiền `null` của server đang giấu đi.
   */
  const signals: { key: string; label: string; color: StatusColor }[] = [
    ...(isNormal
      ? []
      : [
          {
            key: 'risk',
            label: domainLabel('tenantCustomerRiskLevel', riskLevel),
            color: TENANT_CUSTOMER_RISK_LEVEL_META[riskLevel].color,
          },
        ]),
    ...(customer.archivedAt
      ? [{ key: 'archived', label: t('archived'), color: STATUS_COLOR.NEUTRAL }]
      : []),
    ...(returning
      ? [{ key: 'returning', label: t('returning'), color: STATUS_COLOR.SUCCESS }]
      : []),
    ...(showsDebt ? [{ key: 'debt', label: t('debt'), color: STATUS_COLOR.WARNING }] : []),
  ];

  const headline = signals[0] ?? null;
  const accent: StatusColor = headline?.color ?? STATUS_COLOR.NEUTRAL;

  /* Dải nhãn chỉ chở phần CÒN LẠI; khách bình thường không có viên nào và thẻ ngắn đi một hàng. */
  const badges: BadgeRowItem[] = signals.slice(1).map((signal) => ({
    key: signal.key,
    label: signal.label,
    node: <StatusBadge label={signal.label} color={signal.color} size="sm" />,
  }));

  return (
    <Card padded={false} onPress={open} accessibilityLabel={customer.fullName}>
      <XStack>
        <CardAccent color={accent} />

        <YStack f={1} minWidth={0}>
          <YStack p={space.sm} gap={space.xs}>
            <XStack ai="center" gap={space.sm}>
              <Avatar name={customer.fullName} size={AVATAR_SIZE} />

              <YStack f={1} minWidth={0} gap={2}>
                <Text
                  col={colors.text}
                  fos={fontSize.body}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                >
                  {customer.fullName}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.meta} numberOfLines={1}>
                  {customer.phone}
                </Text>
              </YStack>

              {headline ? (
                <StatusBadge label={headline.label} color={headline.color} size="sm" />
              ) : null}
            </XStack>

            {badges.length > 0 ? <BadgeRows items={badges} /> : null}

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
        </YStack>
      </XStack>
    </Card>
  );
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
