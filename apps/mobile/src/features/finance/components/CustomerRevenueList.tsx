import { useMemo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CUSTOMER_REVENUE_SORT_VALUES,
  DEFAULT_CUSTOMER_REVENUE_SORT,
  PERMISSION,
  type PaginationMeta,
} from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { Avatar } from '@/components/ui/Avatar';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { Pagination } from '@/components/ui/Pagination';
import { SelectControl } from '@/components/ui/SelectControl';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { CustomerRevenue } from '../api';
import { METRIC_TONE, MetricStrip } from './MetricStrip';

const AVATAR_SIZE = 32;

/** Thanh tỷ trọng mảnh — nó là nét phụ của thẻ, không phải một số liệu đứng riêng. */
const TRACK_HEIGHT = 4;

/**
 * Doanh thu theo từng khách trong kỳ — bảng của web thành một dải THẺ.
 *
 * **Cơ sở là TIỀN THẬT ĐÃ THU**, không phải giá trị đơn đã chốt — cùng phép tính với ô "Doanh
 * thu" ở lớp Kết quả kinh doanh, nên tổng các dòng cộng với phần chưa gắn khách ra đúng con số
 * đó. Sổ khách có một số khác ("Tổng giá trị thuê") tính trên đơn: đó là bề mặt đi ĐÒI NỢ và nó
 * phải tính trên đơn. Hai câu hỏi khác nhau nên hai con số.
 *
 * Không có "còn nợ": công nợ là số TẠI THỜI ĐIỂM NÀY còn dải này là của một KỲ. `/manage/debts`
 * mới là chỗ trả lời "ai đang nợ tôi".
 */
export function CustomerRevenueList({
  items,
  meta,
  sort,
  unassignedRevenue,
  loading,
  error,
  onSortChange,
  onPageChange,
}: {
  items: readonly CustomerRevenue[];
  meta: PaginationMeta;
  sort: string | undefined;
  /** Doanh thu trong kỳ KHÔNG gắn khách nào — đến từ `summary`, không từ trang dữ liệu. */
  unassignedRevenue: string | undefined;
  loading: boolean;
  error: { error: unknown; onRetry: () => void } | null;
  onSortChange: (next: string) => void;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations('Finance.overview.customers');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();

  const canOpenCustomer = permissions.has(PERMISSION.CUSTOMER_VIEW);

  const sortOptions = useMemo(
    () => CUSTOMER_REVENUE_SORT_VALUES.map((value) => ({ value, label: t(`sort.${value}`) })),
    [t],
  );

  /**
   * Tỷ trọng do SERVER tính trên Decimal, mẫu số là doanh thu cả kỳ (kể cả phần chưa gắn khách).
   * Không tự chia ở đây: tiền là chuỗi và `Number(a)/Number(b)` là đúng thứ ADR 0007 cấm.
   */
  const shareLabel = (value: number | null | undefined) =>
    value == null ? tLabels('emptyValue') : t('share', { value });

  return (
    <YStack gap={space.sm}>
      <BlockTitle>{t('title')}</BlockTitle>

      <SelectControl
        label={t('sort.label')}
        value={sort ?? DEFAULT_CUSTOMER_REVENUE_SORT}
        options={sortOptions}
        onChange={onSortChange}
      />

      {error ? (
        <ScreenError error={error.error} title={t('error')} onRetry={error.onRetry} />
      ) : loading && items.length === 0 ? (
        <SkeletonText lines={5} />
      ) : items.length === 0 ? (
        <ScreenMessage icon="people-outline" title={t('empty')} description={t('emptyHint')} />
      ) : (
        <>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('total', { count: meta.total })}
          </Text>

          {items.map((row) => {
            /* Bề rộng thanh tỷ trọng — server đã tính trên Decimal, ở đây chỉ kẹp về 0–100. */
            const share = Math.min(100, Math.max(0, row.sharePercent ?? 0));

            return (
              <Card
                key={row.tenantCustomerId}
                {...(canOpenCustomer
                  ? {
                      onPress: () =>
                        navigateOnce(ROUTES.manage.customerDetail(row.tenantCustomerId)),
                      accessibilityLabel: row.fullName,
                    }
                  : {})}
              >
                <YStack gap={space.xs}>
                  {/* Tầng 1 — MẶT NGƯỜI, tên, và số tiền: ai, mang về bao nhiêu. */}
                  <XStack ai="center" gap={space.sm}>
                    <Avatar name={row.fullName} size={AVATAR_SIZE} />

                    <YStack f={1} minWidth={0} gap={2}>
                      <Text
                        col={colors.text}
                        fos={fontSize.bodySm}
                        fow={fontWeight.semibold}
                        numberOfLines={1}
                      >
                        {row.fullName}
                      </Text>
                    </YStack>

                    <Text
                      /* Tiền VÀO nên xanh — cùng luật màu với ba thẻ đầu màn và dải hiệu quả xe. */
                      col={colors.success}
                      fos={fontSize.body}
                      fow={fontWeight.bold}
                      numberOfLines={1}
                    >
                      {fmt.money(row.revenue)}
                    </Text>
                    {canOpenCustomer ? <DetailChevron /> : null}
                  </XStack>

                  {/*
                    Tầng 2 — TỶ TRỌNG thành thanh, không chỉ thành con số.

                    "12%" và "38%" đọc gần như nhau khi lướt qua hai chục dòng; hai thanh dài
                    ngắn khác nhau thì không. Thanh nói đúng một điều: khách này chiếm bao nhiêu
                    phần doanh thu CẢ KỲ (mẫu số gồm cả phần chưa gắn khách), nên nó không bao
                    giờ đầy khung ngay cả ở dòng đầu bảng.
                  */}
                  <YStack
                    h={TRACK_HEIGHT}
                    br={radius.pill}
                    bg={colors.surfaceMuted}
                    ov="hidden"
                    accessibilityRole="progressbar"
                    accessibilityValue={{ min: 0, max: 100, now: Math.round(share) }}
                  >
                    <YStack
                      h={TRACK_HEIGHT}
                      br={radius.pill}
                      bg={colors.primary}
                      width={`${share}%`}
                    />
                  </YStack>

                  {/* Tầng 3 — hai chỉ số phụ thành cột, quét dọc so sánh được giữa các khách. */}
                  <MetricStrip
                    items={[
                      {
                        key: 'trips',
                        label: t('columns.trips'),
                        value: fmt.count(row.trips),
                        icon: 'repeat-outline',
                        tone: METRIC_TONE.count,
                      },
                      {
                        key: 'share',
                        label: t('columns.share'),
                        value: shareLabel(row.sharePercent),
                        icon: 'pie-chart-outline',
                        tone: METRIC_TONE.share,
                      },
                    ]}
                  />
                </YStack>
              </Card>
            );
          })}

          {meta.total > meta.limit ? (
            <Pagination
              page={meta.page}
              limit={meta.limit}
              total={meta.total}
              onChange={onPageChange}
            />
          ) : null}
        </>
      )}

      {/*
        Doanh thu không gắn khách nào — phiếu thu tay không liên kết đơn. Cùng lý do với chi phí
        chung ở dải theo xe: thiếu dòng này thì tổng các dòng nhỏ hơn ô "Doanh thu" phía trên và
        người dùng đi tìm mãi phần chênh.
      */}
      {unassignedRevenue && !isZeroMoney(unassignedRevenue) ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('unassigned', { value: fmt.money(unassignedRevenue) })}
        </Text>
      ) : null}
    </YStack>
  );
}
