import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PAYMENT_METHOD,
  PAYMENT_METHOD_VALUES,
  RECEIPT_TYPE,
  RECEIPT_TYPE_VALUES,
} from '@xeprime/types';
import {
  DAY_PARAM_FORMAT,
  dayjs,
  isNegativeMoney,
  isZeroMoney,
  LIST_SEPARATOR,
  vehicleLabel,
} from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { CheckMark } from '@/components/ui/CheckMark';
import { FieldLabel } from '@/components/ui/Field';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { DateField } from '@/components/ui/DateField';
import { FieldBox } from '@/components/ui/FieldBox';
import { MoneyField } from '@/components/ui/MoneyField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useColors } from '@/theme/ThemeProvider';
import { FONT_FAMILY } from '@/theme/fonts';
import { radius, space, typeScale } from '@/theme/tokens';
import {
  RECEIPT_DESCRIPTION_MAX,
  RECEIPT_LINK_MODE,
  RECEIPT_LINK_MODE_VALUES,
  type ReceiptLinkMode,
} from '../constants';
import {
  useCreateReceipt,
  useFinanceCategories,
  useReceiptVehicleOptions,
} from '../hooks/use-finance';
import { branchLabel } from '@/api/branches/api';
import { useActiveBranches } from '@/features/branches/hooks/use-branches';
import { receiptFormSchema, type ReceiptFormValues } from '../schema';
import { ReceiptAttachmentsField } from './ReceiptAttachmentsField';
import { useAppFormat } from '@/i18n/use-app-format';
import { BookingPickerSheet, VehiclePickerSheet } from './ReceiptLinkPicker';
import type { CreateReceiptInput, ReceiptBookingOption, ReceiptVehicleOption } from '../api';

/**
 * Hình của ba lựa chọn "Khoản này là" — cùng bộ hình web dùng.
 *
 * Ba lựa chọn phân biệt nhau bằng HÌNH trước khi mắt kịp đọc chữ; thiếu hình thì ba hàng chỉ khác
 * nhau ở một cái tên hai chữ.
 */

const DEFAULTS = (initialVehicleId: string | null): ReceiptFormValues => ({
  type: RECEIPT_TYPE.EXPENSE,
  /*
   * Mặc định HÔM NAY: đại đa số phiếu nhập ngay lúc phát sinh. Tính lúc mở form chứ không phải
   * lúc nạp module — màn mở qua nửa đêm mà vẫn điền ngày hôm qua là một lỗi im lặng.
   */
  occurredAt: dayjs().format(DAY_PARAM_FORMAT),
  amount: null,
  paymentMethod: PAYMENT_METHOD.CASH,
  categoryId: null,
  /*
   * Mở từ hồ sơ xe thì chế độ đã được quyết bởi chính lối vào — bắt người dùng bấm lại "Xe"
   * sau khi họ vừa bấm "Tạo phiếu cho xe này" là hỏi lại một câu đã trả lời.
   */
  linkMode: initialVehicleId ? RECEIPT_LINK_MODE.VEHICLE : RECEIPT_LINK_MODE.NONE,
  bookingId: null,
  vehicleId: initialVehicleId,
  branchId: null,
  referenceCode: '',
  description: '',
  keepOpen: false,
  attachments: [],
});

/**
 * Tạo phiếu thu/chi (chờ duyệt) — bản native của `ReceiptFormDrawer`.
 *
 * Câu hỏi ĐẦU TIÊN của form là **khoản này gắn vào đâu** (`RECEIPT_LINK_MODE`), vì nó quyết định
 * mọi ô còn lại. Ba lối vào ứng với ba loại khoản có thật trong sổ: tiền của một chuyến (chọn
 * đơn → tự điền xe và số còn nợ), tiền của một chiếc xe ngoài chuyến nào (rửa xe, vá lốp), và
 * tiền của gian hàng không thuộc xe nào (marketing, văn phòng).
 *
 * Chọn xong, đối tượng được đọc lại bằng một THẺ có ảnh + trạng thái + bối cảnh
 * (`ReceiptLinkCard`) chứ không phải một dòng chữ: đây là bước cuối trước khi tiền được ghi vào
 * một chiếc xe cụ thể.
 *
 * KHÔNG có lối gắn tiền thẳng vào KHÁCH — nghiệp vụ không có nó: tiền của khách luôn đi qua một
 * chuyến, và API chỉ nhận `bookingId`/`vehicleId`.
 *
 * Giá trị mặc định chỉ đọc lúc DỰNG, nên nơi gọi phải gắn/tháo theo cờ mở
 * (`{open ? <ReceiptFormSheet … /> : null}`) chứ không giữ nó mãi trong cây.
 */
export function ReceiptFormSheet({
  open,
  onClose,
  initialVehicleId = null,
}: {
  open: boolean;
  onClose: () => void;
  /** Xe chọn sẵn khi form mở từ sổ đang lọc theo một chiếc xe. Chỉ là giá trị KHỞI TẠO. */
  initialVehicleId?: string | null;
}) {
  const fmt = useAppFormat();
  const colors = useColors();
  const t = useTranslations('Finance.receipts.form');
  const tActions = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const resolver = useValidationResolver<ReceiptFormValues>(
    receiptFormSchema,
    'Finance.receipts.form',
  );
  const { control, handleSubmit, reset, setValue, getValues } = useForm<ReceiptFormValues>({
    resolver,
    defaultValues: DEFAULTS(initialVehicleId),
  });

  const type = useWatch({ control, name: 'type' });
  const amount = useWatch({ control, name: 'amount' });
  const linkMode = useWatch({ control, name: 'linkMode' });
  const bookingId = useWatch({ control, name: 'bookingId' });
  const vehicleId = useWatch({ control, name: 'vehicleId' });

  /*
   * Chi nhánh phát sinh (ADR 0052) — CHỈ chi nhánh đang hoạt động, và chỉ hỏi ở chế độ "Không
   * gắn"; gắn xe/đơn thì chi nhánh suy TỪ XE. Gian hàng một chi nhánh: điền sẵn và khoá ô.
   */
  const tBranches = useTranslations('Branches');
  const branches = useActiveBranches(open);
  const branchOptions = useMemo(
    () =>
      (branches.data?.items ?? []).map((b) => ({
        value: b.id,
        label: branchLabel(b, tBranches('labels.noProvince')),
      })),
    [branches.data, tBranches],
  );
  const soleBranchId = branchOptions.length === 1 ? branchOptions[0]!.value : null;
  useEffect(() => {
    if (!open || !soleBranchId) return;
    if (!getValues('branchId')) setValue('branchId', soleBranchId);
  }, [open, soleBranchId, getValues, setValue]);

  /**
   * Đối tượng đã chọn giữ ở state màn, không đọc lại từ danh sách gợi ý.
   *
   * Người dùng gõ tìm tiếp sau khi chọn thì danh sách gợi ý đổi và đối tượng vừa chọn rơi ra
   * khỏi nó — đọc thẻ xác nhận từ danh sách đó nghĩa là thẻ biến mất giữa chừng.
   */
  const [booking, setBooking] = useState<ReceiptBookingOption | null>(null);
  const [vehicle, setVehicle] = useState<ReceiptVehicleOption | null>(null);
  const [picking, setPicking] = useState<'booking' | 'vehicle' | null>(null);

  const { data: categories, isFetching: loadingCategories } = useFinanceCategories(type, open);
  const create = useCreateReceipt();

  const linkingBooking = linkMode === RECEIPT_LINK_MODE.BOOKING;
  const linkingVehicle = linkMode === RECEIPT_LINK_MODE.VEHICLE;
  const linkingNone = !linkingBooking && !linkingVehicle;
  /** Chưa có chi nhánh nào (đã tải xong) - phiếu "Khoản chung" không lưu được, phải nói ra. */
  const branchMissing = linkingNone && branchOptions.length === 0 && !branches.isLoading;
  const showBranchField = linkingNone && !branchMissing;

  /**
   * Nạp trước XE ĐÃ CHỌN SẴN khi form mở từ hồ sơ xe.
   *
   * Thiếu bước này thì ô liên kết hiện một ULID 26 ký tự cho tới lúc người dùng mở tấm chọn —
   * đúng cái bẫy mà `includeId` sinh ra để chặn. Dùng CÙNG query key với tấm chọn (từ khoá rỗng
   * + `includeId`), nên nó không phải một request thứ hai: mở tấm chọn ngay sau đó là đọc cache.
   */
  const preloaded = useReceiptVehicleOptions(
    '',
    open && linkingVehicle && vehicle === null && Boolean(vehicleId),
    vehicleId ?? null,
  );
  const selectedVehicle =
    vehicle ?? (preloaded.data ?? []).find((option) => option.id === vehicleId) ?? null;

  /**
   * Xe đã chọn nhưng server KHÔNG trả về — xe đã xoá, hoặc không còn thuộc gian hàng này.
   *
   * Phân biệt được vì `includeId` bắt server luôn kèm xe đang chọn nếu nó còn hợp lệ: xin đích
   * danh mà không thấy thì đúng là nó không còn. Nói ra ngay tại form (đúng như web) — không có
   * dòng này thì ô liên kết hiện TRỐNG trong khi `vehicleId` vẫn nằm trong form và vẫn được gửi
   * đi, tức người dùng gõ xong mọi ô rồi mới nhận một lỗi 404 không giải thích được.
   */
  const vehicleMissing =
    linkingVehicle &&
    Boolean(vehicleId) &&
    selectedVehicle === null &&
    !preloaded.isFetching &&
    !preloaded.isError;

  const categoryOptions = useMemo(
    () => (categories ?? []).map((category) => ({ value: category.id, label: category.name })),
    [categories],
  );

  /**
   * Chọn đơn → điền hộ những gì suy được: xe của đơn, và số CÒN NỢ vào ô tiền.
   *
   * Cố ý **không ghi đè** số tiền đã gõ: nhập một con số cụ thể rồi mới nhớ ra phải gắn đơn là
   * chuyện thường, và nuốt mất con số đó là cách chắc chắn nhất khiến họ thôi dùng ô liên kết.
   *
   * Điền ở CHÍNH chỗ chọn, không qua effect: web phải đi vòng qua effect vì ô chọn của nó ghi
   * thẳng vào RHF và không có khe cho người gọi chen vào — ở đây tấm chọn gọi thẳng về nên không
   * cần thêm một chốt "đã điền cho đơn nào" như web phải dựng để effect khỏi ghi đè.
   */
  const pickBooking = (picked: ReceiptBookingOption) => {
    setBooking(picked);
    setValue('bookingId', picked.id, { shouldDirty: true });
    setValue('vehicleId', picked.vehicleId, { shouldDirty: true });
    /*
     * "Còn nợ > 0" so trên CHUỖI tiền (ADR 0007). `Number` chỉ còn ở bước đổ vào ô nhập — ô tiền
     * làm việc trên `number` ở cả hai client — chứ không còn tham gia phép SO SÁNH nào.
     */
    if (getValues('amount') == null) {
      const debt = picked.debtAmount;
      if (!isZeroMoney(debt) && !isNegativeMoney(debt)) {
        setValue('amount', Number(debt), { shouldDirty: true });
      }
    }
    setPicking(null);
  };

  const pickVehicle = (picked: ReceiptVehicleOption) => {
    setVehicle(picked);
    setValue('vehicleId', picked.id, { shouldDirty: true });
    setPicking(null);
  };

  const changeLinkMode = (next: ReceiptLinkMode) => {
    setValue('linkMode', next, { shouldDirty: true });
  };

  const resetAll = () => {
    reset(DEFAULTS(initialVehicleId));
    setBooking(null);
    setVehicle(null);
  };

  const close = () => {
    resetAll();
    onClose();
  };

  const submit = handleSubmit((values) => {
    /*
     * Chế độ QUYẾT ĐỊNH cái gì được gửi, không phải "ô nào tình cờ còn giá trị".
     *
     * Chọn một đơn rồi đổi sang "gắn xe" mà vẫn gửi `bookingId` cũ là gửi một liên kết người
     * dùng đã bỏ — và nếu xe mới khác xe của đơn đó, server từ chối bằng một lỗi họ không hiểu
     * vì ô đơn thuê đã biến mất khỏi màn hình.
     */
    const linked =
      values.linkMode === RECEIPT_LINK_MODE.BOOKING
        ? { bookingId: values.bookingId || undefined, vehicleId: values.vehicleId || undefined }
        : values.linkMode === RECEIPT_LINK_MODE.VEHICLE
          ? { vehicleId: values.vehicleId || undefined }
          : // Chỉ khoản KHÔNG gắn mới mang chi nhánh tự khai — gắn xe thì chi nhánh suy TỪ XE, và
            // server từ chối nếu nhận cả hai (ADR 0052).
            { branchId: values.branchId || undefined };

    const body: CreateReceiptInput = {
      type: values.type as CreateReceiptInput['type'],
      // Tiền hoá CHUỖI lúc gửi — form giữ `number` chỉ để ô nhập làm việc (ADR 0007).
      amount: String(values.amount ?? 0),
      paymentMethod: values.paymentMethod as CreateReceiptInput['paymentMethod'],
      occurredAt: values.occurredAt,
      ...(values.categoryId ? { categoryId: values.categoryId } : {}),
      ...linked,
      ...(values.referenceCode ? { referenceCode: values.referenceCode } : {}),
      description: values.description,
      ...(values.attachments?.length ? { attachments: values.attachments } : {}),
    };

    create.mutate(body, {
      onSuccess: () => {
        toast.showSuccess(t('success'));
        /*
         * "Tạo và tiếp tục nhập mới": giữ tấm mở nhưng trả form về TRẮNG.
         *
         * Bản trước giữ lại loại phiếu, ngày, hình thức, danh mục và cả xe/đơn vừa chọn — ý là
         * để nhập một xấp hoá đơn của cùng chiếc xe. Nhưng một form còn nguyên dữ liệu cũ sau khi
         * đã lưu là chỗ sinh ra phiếu trùng: người dùng không phân biệt được "cái vừa lưu" với
         * "cái đang nhập", và chỉ cần sửa mỗi số tiền rồi bấm lưu là ra một phiếu mang danh mục
         * và xe của phiếu trước mà họ không hề chọn.
         *
         * Giữ đúng hai thứ: chính ô tick này (người dùng vừa nói họ còn nhập tiếp), và `xe` mặc
         * định của lối vào từ hồ sơ xe — cái đó đến từ NGỮ CẢNH màn hình, không phải từ phiếu cũ.
         */
        if (values.keepOpen) {
          /*
           * `branchId` của gian hàng MỘT chi nhánh phải đi theo: effect tự điền chạy theo
           * `[open, soleBranchId]`, cả hai không đổi khi tấm ở lại mở — bỏ nó là phiếu thứ hai
           * thiếu chi nhánh trong khi ô đang khoá, không sửa được.
           */
          reset({ ...DEFAULTS(initialVehicleId), branchId: soleBranchId, keepOpen: true });
          return;
        }
        close();
      },
      onError: (error) => toast.showError(errorMessage(error)),
    });
  });

  const keepOpen = useWatch({ control, name: 'keepOpen' });

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={t('title')}
      chrome="v2"
      headerDivider
      footer={
        /* Figma "Footer cố định" `24512:130016`: "Hủy" co theo chữ + nút vàng chính giãn hết, không icon. */
        <XStack gap={space.md}>
          <Button label={tActions('cancel')} variant="secondary" shape="square" onPress={close} />
          <YStack f={1}>
            <Button
              label={t(`submit.${type as 'income' | 'expense'}`)}
              variant="gradient"
              shape="square"
              loading={create.isPending}
              onPress={() => void submit()}
            />
          </YStack>
        </XStack>
      }
    >
      {/* Figma "Horizontal tabs" `24512:130204`: Phiếu thu / Phiếu chi ở đầu form. */}
      <SegmentedTabs
        variant="neutral"
        items={RECEIPT_TYPE_VALUES.map((value) => ({
          key: value,
          label: t(`typeTab.${value as 'income' | 'expense'}`),
        }))}
        value={type}
        onChange={(next) => setValue('type', next, { shouldDirty: true, shouldValidate: true })}
      />

      {/*
        Figma "Link Chips" `24512:130736`: mỗi ô rộng theo CHỮ rồi chia đều phần dư (flexGrow, không
        flexBasis 0) - "Đơn thuê" ngắn thì hẹp hơn; đệm ngang 8 (chốt 26/11/2026). Câu giải thích chỉ của lựa chọn
        ĐANG chọn, chữ nhỏ ngay dưới (chốt 26/11/2026).
      */}
      <YStack gap={6}>
        <FieldLabel label={t('linkMode.label')} required />
        <XStack gap={space.sm}>
          {RECEIPT_LINK_MODE_VALUES.map((mode) => {
            const active = linkMode === mode;
            return (
              <YStack key={mode} flexGrow={1} flexShrink={1} minWidth={0}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => changeLinkMode(mode)}
              >
                <YStack
                  h={40}
                  ai="center"
                  jc="center"
                  px={space.xs}
                  br={radius.control}
                  bw={1}
                  bc={active ? colors.brandShape : colors.border}
                  bg={active ? colors.brandLow : colors.surfaceFaint}
                >
                  <Text
                    col={active ? colors.brandLink : colors.textMuted}
                    /* 12/18 đúng Figma (`typeScale.label`; `caption` của app là 10) - đệm ngang 4, "Đơn thuê" hẹp nhất. */
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    fontFamily={active ? FONT_FAMILY.semibold : FONT_FAMILY.medium}
                    numberOfLines={1}
                  >
                    {t(`linkChip.${mode}`)}
                  </Text>
                </YStack>
              </Pressable>
              </YStack>
            );
          })}
        </XStack>
        <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {t(`linkHint.${linkMode}`)}
        </Text>
      </YStack>

      {linkingBooking ? (
        <FieldBox
          label={t('bookingField')}
          value={
            booking
              ? [
                  booking.code,
                  [booking.customerName, booking.plateNumber].filter(Boolean).join(LIST_SEPARATOR),
                ]
                  .filter(Boolean)
                  .join('  ')
              : (bookingId ?? '')
          }
          placeholder={t('bookingPlaceholder')}
          required
          onPress={() => setPicking('booking')}
        />
      ) : null}

      {linkingVehicle ? (
        <YStack gap={space.sm}>
          <FieldBox
            label={t('vehicleField')}
            value={
              selectedVehicle ? vehicleLabel(selectedVehicle.name, selectedVehicle.plateNumber) : ''
            }
            placeholder={t('vehiclePlaceholder')}
            required
            onPress={() => setPicking('vehicle')}
          />
          {vehicleMissing ? <Callout tone="danger">{t('vehicleGone')}</Callout> : null}
        </YStack>
      ) : null}

      {/* Chi nhánh CÙNG hàng/vị trí với "Đơn hàng liên kết" / "Phương tiện liên kết" - Khoản chung hiện ô này thay cho ô đối tượng (chốt 26/11/2026). */}
      {showBranchField ? (
        <SelectField
          control={control}
          name="branchId"
          label={tBranches('filter.label')}
          placeholder={t('branchPlaceholder')}
          options={branchOptions}
          disabled={branchOptions.length === 1}
          required
        />
      ) : null}

      <XStack gap={space.md} ai="flex-start">
        <YStack f={1} minWidth={0} gap={space.xs}>
          <MoneyField control={control} name="amount" label={t('amount')} required />
          {/* Số tiền bằng chữ NGAY DƯỚI ô nhập — chỗ duy nhất bắt được lỗi thừa một số 0 (giữ, chốt 26/11/2026). */}
          {amount == null ? null : (
            <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {fmt.moneyWords(String(amount))}
            </Text>
          )}
        </YStack>
        <YStack f={1} minWidth={0}>
          <DateField control={control} name="occurredAt" label={t('occurredAt')} required />
        </YStack>
      </XStack>

      {/*
        Chi nhánh chỉ khi "Khoản chung" - gắn đơn/xe thì chi nhánh lấy theo xe (giữ nghiệp vụ,
        chốt 26/11/2026). Ẩn thì Danh mục chiếm trọn hàng.
      */}
      <SelectField
        control={control}
        name="categoryId"
        label={t('category')}
        placeholder={loadingCategories ? '' : t('categoryPlaceholder')}
        options={categoryOptions}
        required
      />
      {branchMissing ? (
        // Chưa có chi nhánh nào: NÓI RA thay vì để nút Lưu bấm mãi không ăn.
        <Callout tone="warning">{t('branchEmpty')}</Callout>
      ) : null}

      <XStack gap={space.md} ai="flex-start">
        <YStack f={1} minWidth={0}>
          <SelectField
            control={control}
            name="paymentMethod"
            label={t('method')}
            options={PAYMENT_METHOD_VALUES.map((value) => ({
              value,
              label: domainLabel('paymentMethod', value),
            }))}
            required
          />
        </YStack>
        <YStack f={1} minWidth={0}>
          <TextField
            control={control}
            name="referenceCode"
            label={t('referenceCode')}
            placeholder={t('referenceCodePlaceholder')}
          />
        </YStack>
      </XStack>

      <TextField
        control={control}
        name="description"
        label={t('description')}
        placeholder={t('descriptionPlaceholder')}
        required
        multiline
        rows={3}
        maxLength={RECEIPT_DESCRIPTION_MAX}
      />

      <ReceiptAttachmentsField control={control} name="attachments" label={t('attachments.label')} />

      {/* "Tạo và giữ form" là LỰA CHỌN cho nút sắp bấm - ô tick ở cuối form như Figma `24512:130945`. */}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: Boolean(keepOpen) }}
        accessibilityLabel={t('keepOpen')}
        onPress={() => setValue('keepOpen', !keepOpen)}
        hitSlop={space.xs}
      >
        <XStack ai="center" gap={space.sm}>
          <CheckMark checked={Boolean(keepOpen)} size="sm" />
          <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fontFamily={FONT_FAMILY.body}>
            {t('keepOpen')}
          </Text>
        </XStack>
      </Pressable>

      {picking === 'booking' ? (
        <BookingPickerSheet
          open
          onClose={() => setPicking(null)}
          selectedId={bookingId ?? null}
          onSelect={pickBooking}
        />
      ) : null}
      {picking === 'vehicle' ? (
        <VehiclePickerSheet
          open
          onClose={() => setPicking(null)}
          selectedId={vehicleId ?? null}
          onSelect={pickVehicle}
        />
      ) : null}
    </BottomSheet>
  );
}
