import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { startOfAppDay } from '@xeprime/domain';
import { VEHICLE_TYPE } from '@xeprime/types';
import { Chip } from '@/components/ui/Chip';
import { CountBadge } from '@/components/ui/CountBadge';
import { IconButton } from '@/components/ui/IconButton';
import {
  activeFilterCount,
  ManageFilterSheet,
  type FilterGroup,
} from '@/features/shell/ManageFilterSheet';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { CALENDAR_SORT_VALUES, type CalendarFilters, type CalendarSort } from '../api';
import {
  CALENDAR_DAY_OPTIONS,
  DEFAULT_DAYS,
  DEFAULT_SORT,
  type CalendarFilterPatch,
} from '../hooks/use-calendar-filters';
import { shiftFrom, todayIsoDate } from '../utils/calendar-date.util';

/** Sentinel "không lọc" — không endpoint nào nhận `vehicleType=all`. */
const ALL = 'all';

/** Ba chiều lọc của lưới. Mã, không phải chữ — nhãn tra ở `Calendar.toolbar.*`. */
const GROUP = { VEHICLE_TYPE: 'vehicleType', SORT: 'sort', DAYS: 'days' } as const;

/** Cỡ vẽ của nút Lọc — bằng `IconButton compact` và `Chip` cỡ `sm`, xem docblock `filterButton`. */
const FILTER_BOX = 32;
const FILTER_SLOP = Math.ceil((sizing.touchTarget - FILTER_BOX) / 2);

const styles = StyleSheet.create({
  /* Cùng hình với nút Lọc của `ManageListShell` — hai màn không được có hai kiểu nút lọc. */
  /*
   * Cùng hình với nút Lọc của `ManageListShell`, nhưng CỠ VẼ gọn: nó đứng cạnh bốn điều khiển
   * ngày trên một hàng, nên nó theo cỡ của chúng (32dp — xem `IconButton compact`). `hitSlop`
   * bù lại phần thiếu để ngón tay vẫn có 44pt.
   */
  filterButton: {
    flexShrink: 0,
    height: FILTER_BOX,
    /* Tối thiểu bằng chiều cao để nút rỗng vẫn TRÒN, nhưng nới ra được khi có huy hiệu đếm. */
    minWidth: FILTER_BOX,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 2,
    paddingHorizontal: space.xs,
  },
});

/**
 * Thanh công cụ lịch — MỘT hàng, không phải năm.
 *
 * ## Vì sao mọi chiều lọc dời vào tấm trượt
 *
 * Bản trước bày hết ra màn: ô tìm kiếm · dải viên loại xe · dải viên khoảng xem · nút Hôm nay ·
 * cụm điều hướng. Năm hàng ăn hơn 200dp của một màn cao 800dp, và lưới lịch — thứ người ta mở màn
 * này để nhìn — chỉ còn chỗ cho ba hàng xe.
 *
 * Mọi màn danh sách của khu quản lý đã giải xong bài đó: bộ lọc nằm sau MỘT nút có huy hiệu đếm,
 * và ô tìm kiếm nằm trong chính tấm trượt ấy (`ManageListShell` + `ManageFilterSheet`). Lịch dùng
 * lại đúng tấm trượt đó — không phải để tiết kiệm dòng, mà để "Bộ lọc" ở màn Xe và ở màn Lịch là
 * CÙNG một cử chỉ, cùng một chỗ, cùng một cách đếm.
 *
 * Không dùng cả `ManageListShell`: vỏ đó dựng khối đầu trang ĐÈ lên một danh sách cuộn dọc rồi tự
 * ẩn theo cuộn. Lưới lịch không phải danh sách đó — nó đo `flex: 1` rồi tự ảo hoá bên trong, nên
 * một khối đè cộng `paddingTop` sẽ cắt mất phần đáy của chính nó.
 *
 * ## Cái gì Ở LẠI trên màn
 *
 * Điều hướng ngày. `<` `>` `Hôm nay` và nhãn khoảng KHÔNG phải bộ lọc — chúng là thứ người dùng
 * bấm liên tục trong lúc đọc lịch, và chôn chúng sau một tấm trượt biến việc lật một tuần từ MỘT
 * chạm thành ba (mở tấm → chọn ngày → Áp dụng). Đã thử dời chúng vào tấm lọc và đổi lại: một
 * hàng tiết kiệm được không bù nổi thao tác dùng nhiều nhất của màn này.
 *
 * Nhãn khoảng đi cùng cụm nút vì hàng header của lưới chỉ in "T5 10 · T6 11" — không tháng,
 * không năm.
 *
 * ## Vì sao vừa MỘT hàng
 *
 * Sáu thứ trên cùng một hàng — lui, tiến, nhãn khoảng, Hôm nay, Lọc — nghe như quá tải, và ở cỡ
 * nút mặc định thì đúng là quá tải: bốn nút 48dp ăn hết chỗ và nhãn khoảng bị cắt mất năm.
 *
 * Chỗ được mở ra bằng cách thu CỠ VẼ của nút xuống 32dp (`IconButton compact`), bằng đúng chiều
 * cao viên `Chip` cỡ `sm` bên cạnh — vùng chạm vẫn đủ 44pt nhờ `hitSlop`. Bốn nút gọn lại nhường
 * ~64dp, đủ để nhãn khoảng đọc trọn "10/09 – 23/09/2026" trên máy 360dp.
 *
 * Bản trước tách nút Lọc thành một hàng riêng, và hàng đó chở đúng một nút nép bên phải — 48dp
 * chiều cao đổi lấy khoảng trống. Dải chú giải thì trả về hàng của chính nó, trọn bề ngang.
 */
export function CalendarToolbar({
  filters,
  setFilters,
  searchValue,
  onSearchChange,
  onBack,
}: {
  filters: CalendarFilters;
  setFilters: (patch: CalendarFilterPatch) => void;
  /**
   * Chữ đang GÕ, tách khỏi `filters.q` đã áp dụng.
   *
   * Ô tìm kiếm phản hồi từng phím, còn API thì không được gọi từng phím — màn hình giữ bản nháp
   * và hoãn (`useDebouncedValue`) trước khi đẩy vào bộ lọc, đúng vai `AutoSearchInput` của web.
   */
  searchValue: string;
  onSearchChange: (next: string) => void;
  /**
   * Lối QUAY LẠI chỗ vừa đi ra — chỉ có khi người dùng tới đây từ một màn khác.
   *
   * Web bày đúng nút này khi có `?back=`. Ở app nó càng cần: lịch là một TAB và thanh trên của
   * khu quản lý không có nút lui, nên vào từ hồ sơ xe rồi thì không còn đường nào rõ ràng để về.
   */
  onBack?: () => void;
}) {
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common.actions');
  const tFilters = useTranslations('Common.filters');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [filtering, setFiltering] = useState(false);

  /**
   * Nhãn khoảng — LUÔN có năm, y như web.
   *
   * Đã thử bỏ năm khi khoảng nằm trong năm nay để nhãn co lại vừa một hàng chung với nút Lọc.
   * Sai: hàng header của lưới chỉ in "T5 10 · T6 11", nên nhãn này là chỗ DUY NHẤT trên màn nói
   * ra tháng và năm. Bỏ năm đi là người dùng lùi vài khoảng rồi không còn biết mình đang đứng ở
   * đâu. Chỗ cho nút Lọc lấy từ hàng chú giải, không lấy từ nhãn này.
   */
  const rangeLabel = useMemo(() => {
    const start = startOfAppDay(filters.from);
    const end = start.add(filters.days - 1, 'day');
    return `${fmt.dayMonth(start.format('YYYY-MM-DD'))} – ${fmt.dateKey(end.format('YYYY-MM-DD'))}`;
  }, [filters.from, filters.days, fmt]);

  /**
   * Ba chiều lọc, đúng bộ web bày trên thanh công cụ của nó.
   *
   * `days` là một chiều lọc THẬT chứ không phải mức thu phóng: nó quyết định khoảng backend được
   * hỏi (`startAt`/`endAt`), y hệt `vehicleType` quyết định tập xe. Mốc BẮT ĐẦU thì không nằm ở
   * đây — nó là điều hướng, và nó ở ngay trên màn.
   */
  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: GROUP.VEHICLE_TYPE,
        label: t('toolbar.vehicleTypeLabel'),
        value: filters.vehicleType ?? ALL,
        resetValue: ALL,
        options: [
          { value: ALL, label: t('toolbar.allVehicleTypes') },
          { value: VEHICLE_TYPE.CAR, label: domainLabel('vehicleType', VEHICLE_TYPE.CAR) },
          {
            value: VEHICLE_TYPE.MOTORBIKE,
            label: domainLabel('vehicleType', VEHICLE_TYPE.MOTORBIKE),
          },
        ],
      },
      {
        key: GROUP.SORT,
        label: t('toolbar.sortAriaLabel'),
        value: filters.sort,
        resetValue: DEFAULT_SORT,
        options: CALENDAR_SORT_VALUES.map((value) => ({
          value,
          label: t(`toolbar.sort.${value}`),
        })),
      },
      {
        key: GROUP.DAYS,
        label: t('toolbar.rangeLength'),
        value: String(filters.days),
        /*
         * "Không lọc" phải trỏ vào CHÍNH `DEFAULT_DAYS`, không phải một đầu của danh sách lựa chọn.
         *
         * Bản trước lấy phần tử CUỐI của `CALENDAR_DAY_OPTIONS` vì lúc đó mặc định tình cờ trùng
         * với nó (14). Khi mặc định đổi xuống 3, hai thứ rời nhau và nút Lọc đếm ngược hẳn: mở màn
         * lên đã báo "1 bộ lọc đang bật" trong khi người dùng chưa chạm gì, còn chọn 14 ngày thì
         * lại không được đếm. Một giá trị suy ra từ vị trí trong mảng là một giá trị chờ trôi.
         */
        resetValue: String(DEFAULT_DAYS),
        options: CALENDAR_DAY_OPTIONS.map((value) => ({
          value: String(value),
          label: t('toolbar.dayRange', { count: value }),
        })),
      },
    ],
    [filters.vehicleType, filters.sort, filters.days, t, domainLabel],
  );

  /** Từ khoá cũng là MỘT bộ lọc — nó không còn hiện trên màn, nên nút phải đếm nó. */
  const count = activeFilterCount(groups) + (searchValue.trim() ? 1 : 0);

  function applyFilter(groupKey: string, value: string) {
    if (groupKey === GROUP.VEHICLE_TYPE) setFilters({ vehicleType: value === ALL ? null : value });
    else if (groupKey === GROUP.SORT) setFilters({ sort: value as CalendarSort });
    else if (groupKey === GROUP.DAYS) setFilters({ days: Number(value) });
  }

  return (
    <YStack gap={space.xs} px={layout.screenX} pt={space.sm}>
      {/*
        Hàng NGÀY — trọn bề ngang.

        KHÔNG gói cụm này thành một nhóm trợ năng có nhãn như web làm (`toolbar.pagerAriaLabel`):
        trên native, một container `accessible` gộp mọi thứ bên trong thành MỘT node và ba nút
        tiến/lùi/hôm nay biến mất khỏi trình đọc màn hình. Nhãn của từng nút đã tự nói đủ.
      */}
      <XStack ai="center" gap={space.xs}>
        {onBack ? (
          <IconButton
            icon="arrow-back"
            label={tCommon('back')}
            tone="surface"
            compact
            onPress={onBack}
          />
        ) : null}

        {/*
          Hai mũi tên tô GOLD (`accent`), nhãn ngày để TRƠN.

          `accent` là tông nền-nhạt-VIỀN-ĐẬM, nên mỗi nút giữ được cái mép của riêng nó — đó mới
          là thứ nói "bấm được". Đã thử gom cả cụm `< ngày >` vào một viên gold chung cho liền
          mạch: hỏng, vì lúc đó hai nút mất mép và đọc ra như hai hình vẽ trang trí nằm trong một
          cái nhãn.

          Nhãn ngày không tô màu: nó là thông tin, không phải nút. Tô nó cùng gold thì cả cụm
          trông như một khối bấm được, và người dùng lại chạm nhầm vào giữa.
        */}
        <IconButton
          icon="chevron-back"
          label={t('toolbar.previousRange', { count: filters.days })}
          tone="accent"
          compact
          onPress={() => setFilters({ from: shiftFrom(filters.from, filters.days, -1) })}
        />
        {/*
          `accessibilityLiveRegion` để trình đọc màn hình đọc khoảng MỚI sau khi bấm tiến/lùi —
          không có nó thì nút vẫn đọc đúng nhưng KẾT QUẢ của cú bấm hoàn toàn im lặng.
        */}
        <Text
          f={1}
          minWidth={0}
          ta="center"
          col={colors.text}
          fos={fontSize.bodySm}
          fow={fontWeight.semibold}
          accessibilityLiveRegion="polite"
          numberOfLines={1}
          /*
           * CO CHỮ thay vì cắt. Khi vào màn từ một chỗ khác thì hàng này còn thêm nút Lui, và
           * "10/09 – 23/09/2026" bị cắt đuôi thành "…23/09/20…" — mất đúng cái năm mà nhãn này
           * tồn tại để nói ra. Sàn 0.85 giữ chữ vẫn đọc được.
           */
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {rangeLabel}
        </Text>
        <IconButton
          icon="chevron-forward"
          label={t('toolbar.nextRange', { count: filters.days })}
          tone="accent"
          compact
          onPress={() => setFilters({ from: shiftFrom(filters.from, filters.days, 1) })}
        />
        <Chip
          label={t('toolbar.today')}
          size="sm"
          role="button"
          tone="accent"
          onPress={() => setFilters({ from: todayIsoDate() })}
        />

        {/*
          Nút Lọc CHỈ CÒN BIỂU TƯỢNG ở màn này — cố ý lệch khỏi `ManageListShell`, nơi nó có cả
          chữ "Bộ lọc".

          Ở các màn danh sách, nút đó sống trên một hàng của riêng nó và chữ là thứ miễn phí. Ở
          đây nó chia hàng với bốn điều khiển ngày và một nhãn khoảng không được phép cắt. Cái
          phễu + huy hiệu đếm là cùng một hình, cùng một chỗ (mép phải), cùng một cử chỉ — thứ
          duy nhất mất đi là chữ, và `accessibilityLabel` vẫn đọc nguyên "Bộ lọc, N bộ lọc đang
          bật".
        */}
        <Pressable
          onPress={() => setFiltering(true)}
          accessibilityRole="button"
          accessibilityLabel={
            count > 0
              ? `${tFilters('title')}, ${tFilters('activeCount', { count })}`
              : tFilters('open')
          }
          hitSlop={FILTER_SLOP}
          style={({ pressed }) => [
            styles.filterButton,
            {
              backgroundColor: count > 0 ? colors.primaryLight : colors.surface,
              borderColor: count > 0 ? colors.primary : colors.borderInput,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons
            name="funnel-outline"
            size={iconSize.sm}
            color={count > 0 ? colors.primaryActive : colors.textMuted}
          />
          {count > 0 ? <CountBadge count={count} /> : null}
        </Pressable>
      </XStack>

      <ManageFilterSheet
        open={filtering}
        groups={groups}
        onChange={applyFilter}
        searchValue={searchValue}
        searchLabel={t('toolbar.searchAriaLabel')}
        searchPlaceholder={t('toolbar.searchPlaceholder')}
        onSearchChange={onSearchChange}
        onClose={() => setFiltering(false)}
      />
    </YStack>
  );
}
