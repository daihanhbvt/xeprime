import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useQuery } from '@tanstack/react-query';
import * as yup from 'yup';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { queryKeys } from '@xeprime/api-client';
import { DAY_PARAM_FORMAT, dayjs, nowInAppTz, startOfAppDay } from '@xeprime/domain';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { DataRow } from '@/components/ui/DataRow';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { FieldBox } from '@/components/ui/FieldBox';
import { MoneyField } from '@/components/ui/MoneyField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import { calendarApi } from '../api';
import { useDeleteDailyPrices, useSaveDailyPrices } from '../hooks/use-calendar-mutations';

/** Trần theo `DAILY_PRICE_MAX_DATES` của backend — khớp khoảng xem lớn nhất của lịch. */
const MAX_RANGE_DAYS = 62;
/** Ghi chú tối đa — khớp `@MaxLength(255)` của `SaveDailyPricesDto`. */
const NOTE_MAX = 255;

/** Mở từ ô lịch: biết xe (kèm giá thường để đối chiếu) và ngày được chạm. */
export interface DailyPriceSheetState {
  vehicleId: string;
  vehicleName: string;
  /** Giá ngày thường của xe — đối chiếu "giá mặc định" ngay trong tấm trượt. */
  weekdayPrice: string | null;
  /** Xe có cho thuê giờ không — quyết định ô "giá giờ" có hiện hay không. */
  hourlyPrice: string | null;
  date: string;
}

interface PriceValues {
  dailyPrice: number | null;
  hourlyPrice: number | null;
  /** Ghi chú nằm TRONG form, không ở state riêng — để prefill là MỘT phép đồng bộ, không phải hai. */
  note: string;
}

/**
 * Đặt giá riêng theo ngày (CAL-01 · hành động "Đặt giá") — bản native của `DailyPriceDialog`.
 *
 * Bản ghi đè BỀN trong `vehicle_daily_prices`, không phải state giao diện. Mặc định áp cho đúng
 * ngày được chạm; nới thành một khoảng ngắn thì backend upsert tất định từng ngày.
 *
 * Giá riêng KHÔNG đụng lịch trống của xe — đó là lý do nó không đi qua `OccupancyService` và
 * không thể sinh ra 409 trùng lịch.
 */
export function DailyPriceSheet({
  state,
  onClose,
}: {
  state: DailyPriceSheetState | null;
  onClose: () => void;
}) {
  // Đóng thì không dựng form — bộ khởi tạo của nó đọc `state.date`; xem `VehicleBlockSheet`.
  if (state === null) return null;
  return <PriceForm key={`${state.vehicleId}-${state.date}`} state={state} onClose={onClose} />;
}

function PriceForm({ state, onClose }: { state: DailyPriceSheetState; onClose: () => void }) {
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const anchor = state.date;
  const [from, setFrom] = useState(anchor);
  const [to, setTo] = useState(anchor);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [confirmingRestore, setConfirmingRestore] = useState(false);

  const save = useSaveDailyPrices();
  const remove = useDeleteDailyPrices();

  const schema = useMemo(
    () =>
      yup.object({
        dailyPrice: yup.number().min(0).nullable().defined(),
        hourlyPrice: yup.number().min(0).nullable().defined(),
        note: yup.string().max(NOTE_MAX).default(''),
      }),
    [],
  );

  /*
   * Bản ghi đè đang có trong khoảng — để prefill, và để biết có gì mà "khôi phục mặc định".
   *
   * Khai TRƯỚC `useForm` vì form nhận nó qua `values`.
   */
  const existing = useQuery({
    queryKey: queryKeys.calendar.vehicleDailyPrices(state.vehicleId, { from, to }),
    queryFn: () => calendarApi.vehicleDailyPrices(state.vehicleId, from, to),
    enabled: Boolean(from && to),
    retry: false,
  });

  /**
   * Prefill từ bản ghi của đúng ngày được chạm — qua `values` của RHF, không qua effect.
   *
   * `values` là cửa CHÍNH THỨC của RHF cho dữ liệu ngoài đến muộn: nó đồng bộ khi tham chiếu đổi
   * và chỉ khi đó. Hai đường còn lại đều sai ở đây — `setValue` trong thân render là cập nhật
   * state của `Controller` bên trong `MoneyField` giữa lượt render của component NÀY, còn
   * `reset` trong `useEffect` là một lượt render dây chuyền (`react-hooks/set-state-in-effect`).
   *
   * `undefined` khi chưa có dữ liệu: không đồng bộ gì cả, nên đổi khoảng ngày không xoá trắng ô
   * người dùng đang nhìn trong lúc query mới còn đang chạy.
   */
  const prefillValues = useMemo<PriceValues | undefined>(() => {
    if (!existing.data) return undefined;
    const current = existing.data.find((row) => row.date === state.date);
    return {
      dailyPrice: current?.dailyPrice != null ? Number(current.dailyPrice) : null,
      hourlyPrice: current?.hourlyPrice != null ? Number(current.hourlyPrice) : null,
      note: current?.note ?? '',
    };
  }, [existing.data, state.date]);

  const { control, handleSubmit } = useForm<PriceValues>({
    resolver: yupResolver(schema) as never,
    defaultValues: { dailyPrice: null, hourlyPrice: null, note: '' },
    ...(prefillValues ? { values: prefillValues } : {}),
    /*
     * `keepDirtyValues`: nới KHOẢNG (đổi `to`) làm `existing` refetch và sinh một `prefillValues`
     * MỚI qua `values` ở trên — không có cờ này, RHF đồng bộ lại TOÀN BỘ form và giá người dùng
     * vừa gõ (nhưng chưa lưu) bị âm thầm thay bằng giá của bản ghi cũ. Cùng vế `values` +
     * `resetOptions.keepDirtyValues` mà `VehicleEditFormScreen.tsx` đã dùng cho đúng lý do này.
     */
    resetOptions: { keepDirtyValues: true },
  });

  /**
   * "Ít nhất một giá" kiểm ở đây chứ không trong schema.
   *
   * Đó là ràng buộc GIỮA hai trường, và một `.test()` ở cấp object trả về lỗi không gắn với
   * trường nào — `formState.errors` không có chỗ đặt nó, nên câu lỗi lặng lẽ biến mất. Web cũng
   * kiểm tường minh ở hàm submit, và giữ cùng một chỗ thì hai bên không thể lệch nhau.
   */
  const [formError, setFormError] = useState<string | null>(null);

  const hasOverrides = (existing.data?.length ?? 0) > 0;
  const rangeDays = from && to ? startOfAppDay(to).diff(startOfAppDay(from), 'day') + 1 : 0;
  const rangeInvalid = rangeDays < 1 || rangeDays > MAX_RANGE_DAYS;

  function listDates(): string[] {
    const start = startOfAppDay(from);
    return Array.from({ length: rangeDays }, (_, i) =>
      start.add(i, 'day').format(DAY_PARAM_FORMAT),
    );
  }

  const submit = handleSubmit((values) => {
    if (rangeInvalid) return;
    if (values.dailyPrice == null && values.hourlyPrice == null) {
      setFormError(t('dailyPrice.errors.priceRequired'));
      return;
    }
    setFormError(null);
    save.mutate(
      {
        vehicleId: state.vehicleId,
        body: {
          dates: listDates(),
          ...(values.dailyPrice != null ? { dailyPrice: String(values.dailyPrice) } : {}),
          ...(values.hourlyPrice != null ? { hourlyPrice: String(values.hourlyPrice) } : {}),
          ...(values.note.trim() ? { note: values.note.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.showSuccess(t('dailyPrice.saved'));
          onClose();
        },
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  });

  function restore() {
    remove.mutate(
      { vehicleId: state.vehicleId, from, to },
      {
        onSuccess: ({ deleted }) => {
          setConfirmingRestore(false);
          toast.showSuccess(
            deleted > 0
              ? t('dailyPrice.restored', { count: deleted })
              : t('dailyPrice.restoredNone'),
          );
          onClose();
        },
        onError: (error) => {
          setConfirmingRestore(false);
          toast.showError(errorMessage(error));
        },
      },
    );
  }

  const defaultPriceText = !state.weekdayPrice
    ? t('dailyPrice.noDefaultPrice')
    : state.hourlyPrice
      ? t('dailyPrice.defaultPriceValueWithHourly', {
          daily: fmt.money(state.weekdayPrice),
          hourly: fmt.money(state.hourlyPrice),
        })
      : t('dailyPrice.defaultPriceValue', { daily: fmt.money(state.weekdayPrice) });

  return (
    <>
      <BottomSheet
        open
        onClose={onClose}
        title={t('dailyPrice.title')}
        footer={
          <>
            <Button
              label={t('dailyPrice.submit')}
              icon="save-outline"
              onPress={() => void submit()}
              loading={save.isPending}
              disabled={rangeInvalid}
            />
            {hasOverrides ? (
              <Button
                label={t('dailyPrice.restore')}
                icon="refresh-outline"
                variant="danger"
                onPress={() => setConfirmingRestore(true)}
                loading={remove.isPending}
              />
            ) : null}
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
        {rangeInvalid ? (
          <Callout tone="danger">
            {t('dailyPrice.errors.rangeTooLong', { max: MAX_RANGE_DAYS })}
          </Callout>
        ) : null}
        {formError ? <Callout tone="danger">{formError}</Callout> : null}

        <YStack gap={space.md}>
          <DataRow label={t('dailyPrice.vehicle')} value={state.vehicleName} />
          <DataRow label={t('dailyPrice.defaultPrice')} value={defaultPriceText} block />

          <FieldBox
            label={t('dailyPrice.appliesTo')}
            required
            value={from ? fmt.dateKey(from) : ''}
            placeholder={t('dailyPrice.appliesTo')}
            icon="calendar-outline"
            onPress={() => setPicking('from')}
          />
          <FieldBox
            label={t('block.periodEnd')}
            required
            value={to ? fmt.dateKey(to) : ''}
            placeholder={t('block.periodEnd')}
            icon="calendar-outline"
            onPress={() => setPicking('to')}
          />

          <MoneyField
            control={control}
            name="dailyPrice"
            label={t('dailyPrice.daily')}
            hint={t('dailyPrice.dailyTooltip')}
          />

          {/* Ô giá GIỜ chỉ hiện khi xe có cho thuê giờ — y như web. */}
          {state.hourlyPrice != null ? (
            <MoneyField control={control} name="hourlyPrice" label={t('dailyPrice.hourly')} />
          ) : null}

          <TextField
            control={control}
            name="note"
            label={t('dailyPrice.note')}
            placeholder={t('dailyPrice.notePlaceholder')}
            maxLength={NOTE_MAX}
          />
        </YStack>
      </BottomSheet>

      <DatePickerSheet
        open={picking !== null}
        onClose={() => setPicking(null)}
        value={picking === 'to' ? to : from}
        onChange={(next) => {
          if (picking === 'to') setTo(next);
          else {
            setFrom(next);
            // Đầu khoảng vượt qua cuối ⇒ kéo cuối theo, thay vì để một khoảng âm rồi báo lỗi.
            if (to && next > to) setTo(next);
          }
        }}
        title={t('dailyPrice.appliesTo')}
        /*
         * Sàn NỚI RỘNG có chủ đích: web không chặn ngày nào ở hộp này, còn `DatePickerSheet` mặc
         * định lấy sàn là NGÀY MAI (luật của luồng đặt xe). Để mặc định thì app chặn một khoảng
         * mà web cho phép — thêm một luật nghiệp vụ mà không ai quyết định.
         *
         * Khi đang chọn "to" thì sàn là `from`: không có nó, chọn `to` trước `from` vẫn qua được
         * ô chọn rồi mới bị `rangeInvalid` chặn ở nút Lưu — với đúng câu lỗi SAI ("khoảng quá
         * dài") vì `rangeDays` âm cũng rơi vào nhánh `< 1`. Khoá ngay từ ô chọn thì người dùng
         * không bao giờ dựng được cặp ngày vô nghĩa đó.
         */
        minDate={picking === 'to' ? dayjs(from) : nowInAppTz().subtract(2, 'year')}
      />

      <AlertDialog
        open={confirmingRestore}
        title={t('dailyPrice.confirmRestoreTitle')}
        message={t('dailyPrice.confirmRestoreContent', {
          vehicle: state.vehicleName,
          from: fmt.dayMonth(from),
          to: fmt.dayMonth(to),
        })}
        confirmLabel={t('dailyPrice.confirmRestoreOk')}
        cancelLabel={tCommon('cancel')}
        destructive
        loading={remove.isPending}
        onConfirm={restore}
        onCancel={() => setConfirmingRestore(false)}
      />
    </>
  );
}
