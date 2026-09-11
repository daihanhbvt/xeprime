import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BULK_PRICE_MODE,
  DAY_PARAM_FORMAT,
  PRICE_PERCENT_MAX,
  PRICE_PERCENT_MIN,
  PRICE_ROUND_STEPS,
  PRICE_ROUND_STEP_DEFAULT,
  PRICE_SPREAD_WARN_RATIO,
  dayjs,
  listedPriceForDay,
  nowInAppTz,
  planBulkDayPrices,
  priceSpreadRatio,
  type BulkPriceMode,
} from '@xeprime/domain';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Chip } from '@/components/ui/Chip';
import { FieldLabel } from '@/components/ui/Field';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { FieldBox } from '@/components/ui/FieldBox';
import { InlineAction } from '@/components/ui/InlineAction';
import { MoneyField } from '@/components/ui/MoneyField';
import { NumberField } from '@/components/ui/NumberField';
import { SelectControl } from '@/components/ui/SelectControl';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { CalendarFilters } from '../api';
import { useBulkDayPreview, useBulkPriceDay, useBulkRestoreDayPrices } from '../hooks/use-bulk-day';

export interface BulkDayPriceState {
  date: string;
  suggestedRange: { from: string; to: string };
}

type RangeMode = 'single' | 'range';

/**
 * Số dòng xem trước hiện ra MỖI LẦN — một trang, không phải một cái trần.
 *
 * Web phân trang 8 dòng/trang và người dùng lật được tới xe cuối cùng. Cắt cụt ở đây thì nút vẫn
 * ghi giá cho cả 1.000 xe trong khi bảng chỉ cho kiểm 20 — đúng kiểu "hứa một đằng ghi một nẻo"
 * mà cả hộp này sinh ra để tránh. Nên: mở dần, và luôn nói còn bao nhiêu.
 */
const PREVIEW_PAGE = 20;

interface PriceFormValues {
  percent: number;
  fixedPrice: number | null;
}

/**
 * Đặt giá riêng cho TOÀN BỘ xe trong một ngày (hoặc một khoảng) — bản native của
 * `BulkDayPriceDialog`.
 *
 * ## Vì sao mặc định là PHẦN TRĂM
 *
 * Đội xe thật lệch nhau tới ba lần (xe máy 150k ↔ Everest 1,5tr). Một con số đồng giá vì thế gần
 * như chắc chắn sai với phần lớn đội. "+30% dịp lễ" mới là câu người vận hành thật sự nghĩ trong
 * đầu. Đồng giá VẪN giữ vì nó đúng khi nhóm đang lọc đã hẹp; vượt ngưỡng lệch thì cảnh báo tại
 * chỗ — nói ra, không chặn.
 *
 * ## Bảng xem trước không phải trang trí
 *
 * Nó chạy CHÍNH `planBulkDayPrices` của `@xeprime/domain` mà backend gọi lúc ghi, nên con số hiện
 * ra là con số sẽ được lưu. Đó cũng là lý do phép tính này KHÔNG được chép lại ở app.
 */
export function BulkDayPriceSheet({
  state,
  filters,
  onClose,
}: {
  state: BulkDayPriceState | null;
  filters: CalendarFilters;
  onClose: () => void;
}) {
  // Đóng thì không dựng — hộp này đọc `state.date` ngay từ bộ khởi tạo; xem `VehicleBlockSheet`.
  if (state === null) return null;
  return <PriceSheetInner key={state.date} state={state} filters={filters} onClose={onClose} />;
}

function PriceSheetInner({
  state,
  filters,
  onClose,
}: {
  state: BulkDayPriceState;
  filters: CalendarFilters;
  onClose: () => void;
}) {
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const suggested = state.suggestedRange;
  const suggestsRange = suggested.to !== suggested.from;

  const [mode, setMode] = useState<RangeMode>(suggestsRange ? 'range' : 'single');
  const fallbackDay = nowInAppTz().format(DAY_PARAM_FORMAT);
  const [rangeFrom, setRangeFrom] = useState(suggested.from || fallbackDay);
  const [rangeTo, setRangeTo] = useState(suggested.to || fallbackDay);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [priceMode, setPriceMode] = useState<BulkPriceMode>(BULK_PRICE_MODE.PERCENT);
  const [roundStep, setRoundStep] = useState<number>(PRICE_ROUND_STEP_DEFAULT);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  /** Số dòng đang bày. Mở dần thay vì dựng 1.000 hàng ngay trong một tấm trượt. */
  const [visibleRows, setVisibleRows] = useState(PREVIEW_PAGE);

  /*
   * Hai con số đi qua React Hook Form vì `NumberField`/`MoneyField` là ô của RHF — cùng ô mà mọi
   * biểu mẫu khác của app dùng, nên cách gõ, cách kẹp min/max và cách ngăn nhóm nghìn giống hệt
   * ở đây. `useWatch` đọc lại giá trị để bảng xem trước tính LẠI theo từng phím.
   *
   * `percent` mặc định 30 — cùng con số web mở sẵn, vì "+30% dịp lễ" là lệnh hay chạy nhất.
   */
  const { control } = useForm<PriceFormValues>({
    defaultValues: { percent: 30, fixedPrice: null },
  });
  const [percentValue, fixedPrice] = useWatch({ control, name: ['percent', 'fixedPrice'] });
  const percent = percentValue ?? 0;

  const from = mode === 'single' ? state.date : rangeFrom;
  const to = mode === 'single' ? state.date : rangeTo;

  const preview = useBulkDayPreview(filters, from, to, true);
  const save = useBulkPriceDay();
  const restore = useBulkRestoreDayPrices();

  const vehicles = useMemo(() => preview.data?.vehicles ?? [], [preview.data]);

  /*
   * Bảng xem trước tính cho NGÀY ĐẦU khoảng. Với khoảng vắt qua cuối tuần, giá gốc từng ngày khác
   * nhau — chú thích nói ra điều đó thay vì giả vờ mọi ngày giống nhau.
   */
  const rows = useMemo(() => {
    // Tra theo Map, không `.find()` trong `.map()`: 1.000 xe thì O(n²) đó là một triệu lượt so
    // sánh cho một bảng xem trước lẽ ra phải tính lại mỗi lần gõ phím.
    const byId = new Map(vehicles.map((v) => [v.vehicleId, v]));
    return planBulkDayPrices(
      vehicles.map((v) => ({
        vehicleId: v.vehicleId,
        // Contract khai hai trường này là TUỲ CHỌN; hàm thuần đòi `string | null` tường minh.
        weekdayPrice: v.weekdayPrice ?? null,
        weekendPrice: v.weekendPrice ?? null,
      })),
      from,
      {
        mode: priceMode,
        percent,
        fixedPrice: fixedPrice === null ? undefined : String(fixedPrice),
        roundStep,
      },
    ).flatMap((row) => {
      const vehicle = byId.get(row.vehicleId);
      // `rows` được sinh THẲNG từ `vehicles` ở trên nên mọi `row.vehicleId` phải tra trúng; bỏ
      // hàng hiếm khi không (thay vì `!` ép kiểu) để một điều bất thường ở dữ liệu không làm sập
      // cả tấm trượt.
      return vehicle ? [{ ...row, name: vehicle.name, plateNumber: vehicle.plateNumber }] : [];
    });
  }, [vehicles, from, priceMode, percent, fixedPrice, roundStep]);

  const priceable = rows.filter((r) => r.nextPrice !== null);
  const withoutBase = rows.filter((r) => r.basePrice === null).length;

  /** Độ lệch giá trong nhóm — cơ sở để cảnh báo trước khi ai đó đặt đồng giá cho cả đội xe. */
  const spread = useMemo(
    () =>
      priceSpreadRatio(
        vehicles.map((v) =>
          listedPriceForDay(
            { weekdayPrice: v.weekdayPrice ?? null, weekendPrice: v.weekendPrice ?? null },
            from,
          ),
        ),
      ),
    [vehicles, from],
  );
  const spreadWarning =
    priceMode === BULK_PRICE_MODE.FIXED && spread !== null && spread >= PRICE_SPREAD_WARN_RATIO;

  const targetIds = () =>
    (priceMode === BULK_PRICE_MODE.FIXED ? rows : priceable).map((r) => r.vehicleId);

  /*
   * Đồng giá TRỐNG (chưa gõ gì) không phải "0đ cho cả đội xe" — nó là CHƯA NHẬP.
   *
   * `targetIds()` ở chế độ đồng giá cố ý lấy nguyên `rows` (kể cả xe chưa có giá gốc — xem
   * `planBulkDayPrices`), nên nó KHÔNG rỗng ngay cả khi `fixedPrice` là `null`. Không có cờ riêng
   * này thì nút Lưu vẫn sáng trong khi bảng xem trước đã nói "Bỏ qua" ở mọi hàng, và `submit()`
   * gửi `fixedPrice: "0"` — ghi giá công khai 0đ cho toàn bộ xe đang lọc.
   */
  const fixedPriceInvalid = priceMode === BULK_PRICE_MODE.FIXED && (fixedPrice ?? 0) <= 0;

  const roundOptions = useMemo(
    () =>
      PRICE_ROUND_STEPS.map((step) => ({
        value: String(step),
        label: step === 1 ? t('bulkPrice.roundNone') : fmt.money(String(step)),
      })),
    [fmt, t],
  );

  function submit() {
    if (fixedPriceInvalid) return;
    const vehicleIds = targetIds();
    if (vehicleIds.length === 0) return;
    save.mutate(
      {
        from,
        to,
        mode: priceMode,
        ...(priceMode === BULK_PRICE_MODE.PERCENT
          ? { percent, roundStep }
          : { fixedPrice: String(fixedPrice) }),
        vehicleIds,
      },
      {
        onSuccess: (result) => {
          toast.showSuccess(
            t('bulkPrice.done', { vehicles: result.updatedVehicles, days: result.updatedDays }),
          );
          onClose();
        },
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  }

  function runRestore() {
    restore.mutate(
      {
        from,
        to,
        mode: BULK_PRICE_MODE.PERCENT,
        percent: 0,
        vehicleIds: vehicles.map((v) => v.vehicleId),
      },
      {
        onSuccess: (result) => {
          setConfirmingRestore(false);
          toast.showSuccess(t('bulkPrice.restored', { count: result.updatedDays }));
          onClose();
        },
        onError: (error) => {
          setConfirmingRestore(false);
          toast.showError(errorMessage(error));
        },
      },
    );
  }

  return (
    <>
      <BottomSheet
        open
        onClose={onClose}
        title={t('bulkPrice.title')}
        footer={
          <>
            <Button
              // Đồng giá còn TRỐNG: đếm 0, khớp bảng xem trước đang nói "Bỏ qua" ở mọi hàng —
              // không hứa ghi cho N xe rồi khoá nút lại, hứa một đằng khoá một nẻo còn khó đọc hơn.
              label={t('bulkPrice.submit', { count: fixedPriceInvalid ? 0 : targetIds().length })}
              icon="save-outline"
              onPress={submit}
              loading={save.isPending}
              disabled={preview.isPending || targetIds().length === 0 || fixedPriceInvalid}
            />
            <Button
              label={t('bulkPrice.restore')}
              icon="refresh-outline"
              variant="danger"
              onPress={() => setConfirmingRestore(true)}
              loading={restore.isPending}
              disabled={vehicles.length === 0}
            />
            <Button
              label={tCommon('cancel')}
              icon="close-outline"
              variant="secondary"
              onPress={onClose}
              disabled={save.isPending}
            />
          </>
        }
      >
        <YStack gap={space.md}>
          {/*
            Nhóm viên PHẢI có tiêu đề — web đặt nó làm `Form.Item label` của `Segmented`.

            Không có tiêu đề thì hai viên đứng trần giữa form: mắt đọc ra hai cái nút, không đọc
            ra "đây là một lựa chọn giữa hai thứ", và trình đọc màn hình thì đọc hai nhãn rời
            không có gì nói chúng thuộc cùng một câu hỏi.
          */}
          <YStack gap={space.xs}>
            <FieldLabel label={t('bulkPrice.scope')} />
            <XStack gap={space.xs}>
              <Chip
                label={t('bulkPrice.modeSingle', { date: fmt.dateKey(state.date) })}
                selected={mode === 'single'}
                grow
                onPress={() => setMode('single')}
              />
              <Chip
                label={t('bulkPrice.modeRange')}
                selected={mode === 'range'}
                grow
                onPress={() => setMode('range')}
              />
            </XStack>
          </YStack>

          {mode === 'range' ? (
            <>
              <FieldBox
                label={t('bulkPrice.range')}
                required
                value={fmt.dateKey(rangeFrom)}
                placeholder={t('bulkPrice.range')}
                icon="calendar-outline"
                onPress={() => setPicking('from')}
              />
              <FieldBox
                label={t('block.periodEnd')}
                required
                value={fmt.dateKey(rangeTo)}
                placeholder={t('block.periodEnd')}
                icon="calendar-outline"
                onPress={() => setPicking('to')}
              />
            </>
          ) : null}

          <YStack gap={space.xs}>
            <FieldLabel label={t('bulkPrice.mode')} />
            <XStack gap={space.xs}>
              <Chip
                label={t('bulkPrice.modePercent')}
                selected={priceMode === BULK_PRICE_MODE.PERCENT}
                grow
                onPress={() => setPriceMode(BULK_PRICE_MODE.PERCENT)}
              />
              <Chip
                label={t('bulkPrice.modeFixed')}
                selected={priceMode === BULK_PRICE_MODE.FIXED}
                grow
                onPress={() => setPriceMode(BULK_PRICE_MODE.FIXED)}
              />
            </XStack>
          </YStack>

          {priceMode === BULK_PRICE_MODE.PERCENT ? (
            <>
              <NumberField
                control={control}
                name="percent"
                label={t('bulkPrice.percent')}
                suffix="%"
                integer
                min={PRICE_PERCENT_MIN}
                max={PRICE_PERCENT_MAX}
              />
              <SelectControl
                label={t('bulkPrice.roundStep')}
                value={String(roundStep)}
                options={roundOptions}
                onChange={(next) => setRoundStep(Number(next))}
              />
              <Callout tone="info">{t('bulkPrice.percentBaseNote')}</Callout>
            </>
          ) : (
            <MoneyField
              control={control}
              name="fixedPrice"
              label={t('bulkPrice.fixedPrice')}
              required
            />
          )}

          {spreadWarning ? (
            <Callout
              tone="warning"
              title={t('bulkPrice.spreadWarningTitle', { ratio: spread.toFixed(1) })}
            >
              {t('bulkPrice.spreadWarningBody')}
            </Callout>
          ) : null}

          {withoutBase > 0 && priceMode === BULK_PRICE_MODE.PERCENT ? (
            <Callout tone="warning">
              {t('bulkPrice.missingBaseWarning', { count: withoutBase })}
            </Callout>
          ) : null}

          {preview.isPending ? (
            <SkeletonText lines={4} />
          ) : preview.isError ? (
            <Callout tone="danger">{errorMessage(preview.error)}</Callout>
          ) : (
            <YStack gap={space.xs}>
              {mode === 'range' ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('bulkPrice.tableRangeNote')}
                </Text>
              ) : null}

              <XStack px={space.sm} py={space.xs} bg={colors.surfaceMuted} br={radius.sm}>
                <Text f={1} col={colors.textMuted} fos={fontSize.meta} fow={fontWeight.semibold}>
                  {t('bulkPrice.colVehicle')}
                </Text>
                <Text
                  w={76}
                  ta="right"
                  col={colors.textMuted}
                  fos={fontSize.meta}
                  fow={fontWeight.semibold}
                >
                  {t('bulkPrice.colBase')}
                </Text>
                <Text
                  w={84}
                  ta="right"
                  col={colors.textMuted}
                  fos={fontSize.meta}
                  fow={fontWeight.semibold}
                >
                  {t('bulkPrice.colNext')}
                </Text>
              </XStack>

              {/*
                Bảng nằm TRONG vùng cuộn của tấm trượt, không phải một danh sách ảo hoá lồng vào:
                lồng một `FlatList` dọc trong một `ScrollView` dọc thì không trục nào cuộn ra hồn.
                Trần 1.000 xe của `BULK_DAY_MAX_VEHICLES` là trần của LỆNH; nhóm mà người dùng
                thật sự đặt giá luôn đã bị bộ lọc thu hẹp, và web cũng chỉ phân trang 8 dòng.
              */}
              {rows.slice(0, visibleRows).map((row) => (
                <XStack
                  key={row.vehicleId}
                  px={space.sm}
                  py={space.xs}
                  ai="center"
                  // Trình đọc màn hình đọc BA cột rời trên đúng cái bảng mà người dùng phải soát
                  // trước khi ghi giá cho cả đội xe — không gộp một nhãn thì không biết số nào là
                  // giá đang có, số nào sắp ghi.
                  accessible
                  accessibilityLabel={t('bulkPrice.rowAria', {
                    vehicle: row.plateNumber ? `${row.name} · ${row.plateNumber}` : row.name,
                    base: row.basePrice === null ? t('bulkPrice.rowAriaNoBase') : fmt.money(row.basePrice),
                    next:
                      row.nextPrice === null ? t('bulkPrice.skipped') : fmt.money(row.nextPrice),
                  })}
                >
                  <YStack f={1}>
                    <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
                      {row.name}
                    </Text>
                    {row.plateNumber ? (
                      <Text col={colors.textMuted} fos={fontSize.meta} numberOfLines={1}>
                        {row.plateNumber}
                      </Text>
                    ) : null}
                  </YStack>
                  {/*
                    Số ĐẦY ĐỦ, không rút gọn.

                    Bản trước dùng `moneyCompact` cho vừa cột. Sai ở đúng cái bảng này: nó là chỗ
                    người dùng SOÁT LẠI trước khi ghi giá cho cả đội xe, mà rút gọn thì 350.000 và
                    355.000 đọc ra như nhau — bảng mất chính lý do nó tồn tại. Web in trọn số ở cả
                    hai cột.

                    Giá MỚI tô XANH: web chỉ in đậm (`<strong>`) vì bảng của nó rộng và hai cột
                    đứng cách xa nhau; trên một hàng điện thoại chật thì độ đậm một mình không đủ
                    tách "con số đang có" khỏi "con số sắp ghi". Xanh ở đây KHÔNG mang nghĩa
                    "tăng" — nó chỉ đánh dấu cột kết quả, và giảm giá cũng vẫn xanh.

                    Chữ xuống bậc `meta` để hai cột số gọn lại, nhường bề ngang cho tên xe.
                  */}
                  <Text w={76} ta="right" col={colors.textMuted} fos={fontSize.meta}>
                    {row.basePrice === null ? '—' : fmt.money(row.basePrice)}
                  </Text>
                  <Text
                    w={84}
                    ta="right"
                    col={row.nextPrice === null ? colors.textMuted : colors.success}
                    fos={fontSize.meta}
                    fow={fontWeight.bold}
                  >
                    {row.nextPrice === null ? t('bulkPrice.skipped') : fmt.money(row.nextPrice)}
                  </Text>
                </XStack>
              ))}

              {rows.length > visibleRows ? (
                <InlineAction
                  label={t('bulkPrice.tableMore', { count: rows.length - visibleRows })}
                  onPress={() => setVisibleRows((n) => n + PREVIEW_PAGE)}
                />
              ) : null}
            </YStack>
          )}
        </YStack>
      </BottomSheet>

      <DatePickerSheet
        open={picking !== null}
        onClose={() => setPicking(null)}
        value={picking === 'to' ? rangeTo : rangeFrom}
        onChange={(next) => {
          if (picking === 'to') setRangeTo(next);
          else {
            setRangeFrom(next);
            if (next > rangeTo) setRangeTo(next);
          }
        }}
        title={t('bulkPrice.range')}
        // Sàn nới rộng, cùng lý do với `BulkDayBlockSheet` — web không chặn ngày nào ở hộp này.
        // Khi đang chọn "to", sàn là `rangeFrom` — giả lập ràng buộc cấu trúc của
        // `DatePicker.RangePicker` bên web (không cho chọn ngày kết thúc trước ngày bắt đầu).
        minDate={picking === 'to' ? dayjs(rangeFrom) : nowInAppTz().subtract(2, 'year')}
      />

      <AlertDialog
        open={confirmingRestore}
        title={t('bulkPrice.confirmRestoreTitle')}
        message={t('bulkPrice.confirmRestoreContent', {
          count: vehicles.length,
          from: fmt.dayMonth(from),
          to: fmt.dayMonth(to),
        })}
        confirmLabel={t('bulkPrice.restore')}
        cancelLabel={tCommon('cancel')}
        destructive
        loading={restore.isPending}
        onConfirm={runRestore}
        onCancel={() => setConfirmingRestore(false)}
      />
    </>
  );
}
