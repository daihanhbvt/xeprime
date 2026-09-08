import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DEFAULT_VEHICLE_PROFIT_SORT,
  PERMISSION,
  VEHICLE_PROFIT_SORT_VALUES,
  type PaginationMeta,
} from '@xeprime/types';
import { isNegativeMoney, isZeroMoney } from '@xeprime/domain';
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
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { VehicleProfit } from '../api';

/** Ô biểu tượng đầu thẻ — vừa đúng chiều cao hai dòng chữ (tên xe + biển số). */
const TILE_SIZE = 36;

/** Biển số giãn chữ nhẹ để đọc như một MÃ, không như một từ. */
const PLATE_TRACKING = 0.5;

/**
 * Lãi/lỗ theo từng xe trong kỳ — bảng của web thành một dải THẺ.
 *
 * **Sắp xếp bằng ô chọn, không bằng đầu cột** (web cũng vậy): sắp xếp chạy trên SERVER, và một
 * mũi tên trên đầu cột hứa sắp xếp tại chỗ trong khi thực tế nó nạp lại trang.
 *
 * Dải luôn hiện đủ mọi xe CÓ PHÁT SINH trong kỳ, kể cả xe doanh thu 0 mà có chuyến — đó chính
 * là dấu hiệu cần đi ghi phiếu, nên giấu nó đi là giấu mất việc cần làm.
 */
export function VehicleProfitList({
  items,
  meta,
  sort,
  unassignedCost,
  loading,
  error,
  onSortChange,
  onPageChange,
}: {
  items: readonly VehicleProfit[];
  meta: PaginationMeta;
  sort: string | undefined;
  /** Chi phí trong kỳ KHÔNG gắn xe nào — đến từ `summary`, không từ trang dữ liệu. */
  unassignedCost: string | undefined;
  loading: boolean;
  error: { error: unknown; onRetry: () => void } | null;
  onSortChange: (next: string) => void;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations('Finance.overview.vehicles');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();

  const canOpenVehicle = permissions.has(PERMISSION.VEHICLE_VIEW);

  const sortOptions = useMemo(
    () => VEHICLE_PROFIT_SORT_VALUES.map((value) => ({ value, label: t(`sort.${value}`) })),
    [t],
  );

  return (
    <YStack gap={space.sm}>
      <BlockTitle>{t('title')}</BlockTitle>

      <SelectControl
        label={t('sort.label')}
        value={sort ?? DEFAULT_VEHICLE_PROFIT_SORT}
        options={sortOptions}
        onChange={onSortChange}
      />

      {error ? (
        <ScreenError error={error.error} title={t('error')} onRetry={error.onRetry} />
      ) : loading && items.length === 0 ? (
        <SkeletonText lines={5} />
      ) : items.length === 0 ? (
        <ScreenMessage icon="car-outline" title={t('empty')} description={t('emptyHint')} />
      ) : (
        <>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('total', { count: meta.total })}
          </Text>

          {items.map((row) => {
            const loss = isNegativeMoney(row.profit);
            /*
              Màu theo DẤU: lãi xanh, lỗ đỏ.
              Cùng luật với ba thẻ ở đầu màn (`FinanceOverviewCards`) và với dải doanh thu theo
              khách ngay bên dưới — ba chỗ cùng bày tiền trên một màn thì không được mỗi chỗ một
              quy ước màu, nếu không người đọc phải học lại bảng màu ở từng khối.
            */
            const profitTone = loss ? colors.danger : colors.success;

            return (
              <Card
                key={row.vehicleId}
                {...(canOpenVehicle
                  ? {
                      onPress: () => navigateOnce(ROUTES.manage.vehicleDetail(row.vehicleId)),
                      accessibilityLabel: row.vehicleName,
                    }
                  : {})}
              >
                {/*
                  HAI DÒNG, đúng thẻ web ở bề rộng điện thoại: danh tính bên trái, LỢI NHUẬN bên
                  phải; dòng dưới là biển số và một câu tóm tắt mờ.

                  Bản trước tách thu/chi/chuyến thành ba hàng riêng có huy hiệu — mỗi thẻ cao gần
                  gấp đôi, mà một dải XẾP HẠNG thì việc chính là lướt qua hai mươi xe để tìm xe
                  đang lỗ, không phải đọc kỹ từng xe. Xe nào đáng đọc kỹ thì chạm vào là mở hồ sơ.

                  Ba số phụ dùng dạng RÚT GỌN (`Thu 902k`) — cũng là lựa chọn của web ở chính chỗ
                  này. Chúng chia nhau phần bề ngang còn lại sau biển số, viết đủ thì chắc chắn bị
                  cắt; mà con số quan trọng nhất — lợi nhuận — vẫn viết đủ từng đồng ở dòng trên.
                */}
                <XStack ai="center" gap={space.sm}>
                  {/*
                    HÌNH XE, không phải chữ cái đầu tên xe: "Toyota Vios" và "Toyota Innova" cho
                    ra cùng một chữ T, nên chữ cái ở đây không phân biệt được gì — nó chỉ là một
                    ô chữ ngẫu nhiên cạnh tên xe đã nằm ngay bên phải. Một hình xe thì nói ngay
                    hàng này là một CHIẾC XE, và cả dải đọc ra là dải xe.
                  */}
                  <YStack
                    w={TILE_SIZE}
                    h={TILE_SIZE}
                    br={radius.md}
                    ai="center"
                    jc="center"
                    bg={colors.primaryLight}
                  >
                    <Ionicons
                      name="car-sport-outline"
                      size={iconSize.md}
                      color={colors.primaryActive}
                    />
                  </YStack>

                  <YStack f={1} minWidth={0} gap={2}>
                    <XStack ai="center" gap={space.sm}>
                      <Text
                        f={1}
                        minWidth={0}
                        col={colors.text}
                        fos={fontSize.bodySm}
                        fow={fontWeight.semibold}
                        numberOfLines={1}
                      >
                        {row.vehicleName}
                      </Text>
                      {/*
                        Số tiền KHÔNG co: hết chỗ thì tên xe cắt bớt, không phải con số.

                        `fontSize.body` — CÙNG bậc với con số của dải "Doanh thu theo khách" ngay
                        dưới. Hai dải xếp hạng đứng liền nhau trên một màn mà số của dải này nhỏ
                        hơn dải kia thì đọc ra như dải trên kém quan trọng hơn, trong khi chúng
                        ngang vai.
                      */}
                      <Text
                        flexShrink={0}
                        col={profitTone}
                        fos={fontSize.body}
                        fow={fontWeight.bold}
                        numberOfLines={1}
                      >
                        {fmt.money(row.profit)}
                      </Text>
                    </XStack>

                    <Text
                      col={colors.textMuted}
                      fos={fontSize.label}
                      letterSpacing={PLATE_TRACKING}
                      numberOfLines={1}
                    >
                      {row.plateNumber ?? tLabels('emptyValue')}
                    </Text>

                    {/*
                      Dòng thứ ba đứng RIÊNG, không chen cạnh biển số — và vì đứng riêng nên nó có
                      đủ bề ngang để viết SỐ ĐẦY ĐỦ.

                      Ép nó chung hàng với biển số thì mỗi bên còn chưa tới 140dp, và `Thu
                      82.500.000 ₫ · Chi 19.300.000 ₫ · 7 chuyến` chỉ còn cách rút gọn — mà rút
                      gọn ở đây là mất thông tin thật: `902k` không nói được 902.000 hay 902.400.
                      Cho phép xuống hai dòng thay vì cắt: một số tiền cụt là con số sai.
                    */}
                    <Text col={colors.placeholder} fos={fontSize.label} numberOfLines={2}>
                      {t('cardLine', {
                        revenue: fmt.money(row.revenue),
                        cost: fmt.money(row.cost),
                        trips: row.trips,
                      })}
                    </Text>
                  </YStack>

                  {canOpenVehicle ? <DetailChevron /> : null}
                </XStack>
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
        Chi phí chung không gắn xe. Thiếu dòng này thì tổng "Chi phí" của dải nhỏ hơn ô "Chi phí"
        ở lớp Kết quả kinh doanh, và người dùng đi tìm mãi phần chênh mà không có chỗ nào giải
        thích. Nó KHÔNG phải một thẻ xe giả — nó là chú thích.

        Cố ý KHÔNG có lối đi ra sổ: sổ chưa lọc được "phiếu không gắn xe nào", nên một đường dẫn ở
        đây sẽ mở ra TOÀN BỘ phiếu chi và cho một con số khác hẳn câu vừa nói.
      */}
      {unassignedCost && !isZeroMoney(unassignedCost) ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('unassigned', { value: fmt.money(unassignedCost) })}
        </Text>
      ) : null}
    </YStack>
  );
}
