import { XStack, YStack } from 'tamagui';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, radius, space } from '@/theme/tokens';
import { CAL_SURFACE } from '../calendar-tone';
import { GRID_METRICS } from './CalendarTimeline';

/** Số hàng vẽ sẵn — đủ phủ một màn cao, thừa vài hàng thì bị cắt chứ không để hở đáy. */
const ROWS = 9;
/** Số cột ngày — đủ tràn bề ngang máy hẹp nhất ở `minDayWidth`. */
const DAYS = 8;

/**
 * Khung chờ của LƯỚI LỊCH — cùng hình học với lưới thật.
 *
 * ## Vì sao không dùng một khung chờ chung
 *
 * Khung chờ chỉ có ích khi nó nói đúng "cái sắp hiện ra trông thế nào". Bản trước là mấy thanh
 * xám xếp dọc — đọc ra là "một danh sách đang tải", nên khi lưới thật hiện lên thì toàn bộ bố cục
 * nhảy một cái: cột xe đổi bề ngang, mọc thêm hàng header ngày và hàng "Xe còn trống". Cái nhảy
 * đó khó chịu hơn là không có khung chờ nào.
 *
 * Ở đây nó dựng đúng bốn phần của lưới — cột xe ghim, header ngày, thân, hàng tổng — và đọc
 * {@link GRID_METRICS} thay vì giữ bản sao số đo riêng. Bản trước có bản sao riêng, và nó lặng lẽ
 * trôi khỏi lưới ngay lần đầu cột xe được nới từ 100 lên 112dp.
 *
 * Bề rộng cột ngày lấy sàn `minDayWidth`: khung chờ dựng TRƯỚC khi vùng lưới được đo, nên nó
 * không biết bề ngang thật. Lấy sàn thì các cột luôn tràn qua mép phải — đúng cảm giác của lưới
 * thật, và không bao giờ để hở một mảng trắng bên phải.
 */
export function CalendarGridSkeleton() {
  const { headerHeight, rowHeight, summaryHeight, resourceWidth, minDayWidth } = GRID_METRICS;

  return (
    <XStack f={1} bg={colors.surface} ov="hidden">
      {/* ── Cột xe ghim ─────────────────────────────────────────────────── */}
      <YStack w={resourceWidth} borderRightWidth={1} borderColor={CAL_SURFACE.line}>
        <XStack
          h={headerHeight}
          ai="center"
          px={space.xs}
          bg={colors.surfaceElevated}
          borderBottomWidth={1}
          borderColor={CAL_SURFACE.line}
        >
          <Skeleton width="70%" height={10} />
        </XStack>

        {Array.from({ length: ROWS }, (_, row) => (
          <XStack
            key={row}
            h={rowHeight}
            ai="center"
            gap={space.xs}
            px={space.xs}
            borderBottomWidth={1}
            borderColor={CAL_SURFACE.line}
          >
            <Skeleton width={24} height={24} />
            <YStack f={1} gap={4}>
              <Skeleton width="85%" height={9} />
              <Skeleton width="60%" height={9} />
            </YStack>
          </XStack>
        ))}
      </YStack>

      {/* ── Dải ngày ────────────────────────────────────────────────────── */}
      <YStack f={1}>
        <XStack h={headerHeight} bg={colors.surfaceElevated}>
          {Array.from({ length: DAYS }, (_, day) => (
            <YStack
              key={day}
              w={minDayWidth}
              ai="center"
              jc="center"
              gap={4}
              borderRightWidth={1}
              borderBottomWidth={1}
              borderColor={CAL_SURFACE.line}
            >
              <Skeleton width={16} height={8} />
              <Skeleton width={12} height={10} />
            </YStack>
          ))}
        </XStack>

        {Array.from({ length: ROWS }, (_, row) => (
          <XStack key={row} h={rowHeight}>
            {Array.from({ length: DAYS }, (_, day) => (
              <YStack
                key={day}
                w={minDayWidth}
                h="100%"
                borderRightWidth={1}
                borderBottomWidth={1}
                borderColor={CAL_SURFACE.line}
              />
            ))}
            {/*
              Một thanh event giả, lệch dần theo hàng.

              Lưới thật không bao giờ đều tăm tắp, và một khung chờ đều tăm tắp đọc ra như một cái
              bảng rỗng chứ không như lịch đang tải. Vị trí suy từ chỉ số hàng nên nó tất định —
              không dùng `Math.random()`, thứ làm mỗi lượt render nhảy một chỗ khác.
            */}
            <YStack
              position="absolute"
              top={(rowHeight - 20) / 2}
              left={minDayWidth * ((row * 3) % 4)}
              w={minDayWidth * (1 + (row % 3))}
              h={20}
              br={radius.sm}
              ov="hidden"
            >
              <Skeleton fill />
            </YStack>
          </XStack>
        ))}
      </YStack>

      {/* Hàng "Xe còn trống" ghim đáy — có mặt để lúc dữ liệu về nó không mọc thêm ra. */}
      <YStack position="absolute" bottom={0} left={0} right={0}>
        <XStack
          h={summaryHeight}
          ai="center"
          px={space.xs}
          bg={colors.surfaceElevated}
          borderTopWidth={1}
          borderColor={CAL_SURFACE.line}
        >
          <Skeleton width={resourceWidth - space.sm} height={10} />
        </XStack>
      </YStack>
    </XStack>
  );
}
