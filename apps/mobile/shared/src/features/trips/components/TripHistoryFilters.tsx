import { useEffect, useState } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { startOfAppDay } from '@xeprime/domain';
import { DateRangeField } from '@/components/ui/DateRangeField';
import { SearchInput } from '@/components/ui/SearchInput';
import { space } from '@/theme/tokens';
import type { TripListNarrow } from '@/api/trips/api';

/** Bộ lọc tab lịch sử ở dạng người dùng chọn: từ khoá + hai NGÀY (`YYYY-MM-DD`, giờ VN). */
export interface TripHistoryNarrow {
  q?: string;
  from?: string;
  to?: string;
}

/** Trễ trước khi gửi từ khoá — `AutoSearchInput` web (`debounceMs = 300`). */
const SEARCH_DEBOUNCE_MS = 300;
/** Ô cao 44 của bản vẽ (Figma `19879:72400`). */

/**
 * Ngày người dùng chọn → mốc tuyệt đối cho `GET /trips` — cùng phép của web `tripsToParams`: từ
 * 00:00 ngày đầu tới hết ngày cuối, theo giờ VN.
 */
export function toTripListNarrow(narrow: TripHistoryNarrow): TripListNarrow {
  return {
    ...(narrow.q ? { q: narrow.q } : {}),
    ...(narrow.from ? { dateFrom: startOfAppDay(narrow.from).toISOString() } : {}),
    ...(narrow.to
      ? {
          dateTo: startOfAppDay(narrow.to).add(1, 'day').subtract(1, 'millisecond').toISOString(),
        }
      : {}),
  };
}

export function hasTripHistoryNarrow(narrow: TripHistoryNarrow): boolean {
  return Boolean(narrow.q || narrow.from || narrow.to);
}

/**
 * Hàng lọc của tab "Lịch sử chuyến" — bản native của `TripHistoryFilters` web (≤640px: hai ô xếp
 * dọc, cách 12): ô "Tìm kiếm chuyến đi" (gửi sau 300ms ngừng gõ) và ô "Chọn khoảng thời gian" (hai
 * nửa bấm được: ngày đầu · ngày cuối, mở tấm lịch; có giá trị thì có nút xoá như RangePicker).
 */
export function TripHistoryFilters({
  narrow,
  onChange,
}: {
  narrow: TripHistoryNarrow;
  onChange: (next: TripHistoryNarrow) => void;
}) {
  const t = useTranslations('Trips.list');
  const [draft, setDraft] = useState(narrow.q ?? '');

  // Bộ lọc bị xoá từ ngoài (nút "Xoá bộ lọc") ⇒ ô tìm cũng trống theo.
  useEffect(() => {
    setDraft(narrow.q ?? '');
  }, [narrow.q]);

  useEffect(() => {
    const normalized = draft.trim();
    if (normalized === (narrow.q ?? '')) return;
    const timer = setTimeout(
      () => onChange({ ...narrow, q: normalized || undefined }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [draft, narrow, onChange]);

  return (
    <YStack gap={space.sm}>
      <SearchInput
        variant="boxed"
        label={t('searchLabel')}
        placeholder={t('searchPlaceholder')}
        value={draft}
        onChange={setDraft}
        maxLength={80}
      />

      {/* Ô khoảng ngày dùng chung (`DateRangeField`) — kiểm từ ≤ đến, không chọn ngày tương lai. */}
      <DateRangeField
        value={{ from: narrow.from, to: narrow.to }}
        onChange={(range) => onChange({ ...narrow, from: range.from, to: range.to })}
        labels={{ field: t('rangeLabel'), from: t('rangeFrom'), to: t('rangeEnd'), clear: t('narrowClear') }}
      />
    </YStack>
  );
}
