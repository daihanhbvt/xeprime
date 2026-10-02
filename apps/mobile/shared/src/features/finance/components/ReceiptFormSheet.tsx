import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
  moneyToVietnameseWords,
  vehicleLabel,
} from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import type { IconName } from '@/components/ui/Chip';
import { CheckOption, RadioOption } from '@/components/ui/RadioOption';
import { DateField } from '@/components/ui/DateField';
import { FieldBox } from '@/components/ui/FieldBox';
import { MoneyField } from '@/components/ui/MoneyField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
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
import { receiptFormSchema, type ReceiptFormValues } from '../schema';
import { ReceiptAttachmentsField } from './ReceiptAttachmentsField';
import { BookingLinkCard, VehicleLinkCard } from './ReceiptLinkCard';
import { BookingPickerSheet, VehiclePickerSheet } from './ReceiptLinkPicker';
import type { CreateReceiptInput, ReceiptBookingOption, ReceiptVehicleOption } from '../api';

/**
 * Hình của ba lựa chọn "Khoản này là" — cùng bộ hình web dùng.
 *
 * Ba lựa chọn phân biệt nhau bằng HÌNH trước khi mắt kịp đọc chữ; thiếu hình thì ba hàng chỉ khác
 * nhau ở một cái tên hai chữ.
 */
const LINK_MODE_ICON: Readonly<Record<ReceiptLinkMode, IconName>> = {
  [RECEIPT_LINK_MODE.NONE]: 'pricetag-outline',
  [RECEIPT_LINK_MODE.BOOKING]: 'document-text-outline',
  [RECEIPT_LINK_MODE.VEHICLE]: 'car-outline',
};

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
          : {};

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
          reset({ ...DEFAULTS(initialVehicleId), keepOpen: true });
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
      footer={
        <YStack gap={space.sm}>
          {/*
            "Tạo và tiếp tục" là một LỰA CHỌN, không phải nút thứ hai — nên nó là ô tick thật.

            Bản trước dùng `Chip role="button"`: hình dạng của nó là một cái NÚT, đứng ngay trên
            hai nút thật, nên nó đọc ra như hành động thứ ba của form chứ không như một thiết lập
            cho hành động sắp bấm.
          */}
          <CheckOption
            label={t('keepOpen')}
            checked={Boolean(keepOpen)}
            onPress={() => setValue('keepOpen', !keepOpen)}
          />
          <XStack gap={space.sm}>
            <YStack flexShrink={1}>
              <Button
                label={tActions('cancel')}
                variant="secondary"
                icon="close-outline"
                onPress={close}
              />
            </YStack>
            <YStack f={1}>
              {/*
                Hình ĐỔI THEO loại phiếu — mũi tên xuống cho tiền vào, lên cho tiền ra, cùng bộ
                hình mà cả module tài chính đang dùng. Nó cũng là phản hồi cho ô "Loại giao dịch"
                ở tận đầu form: đổi loại thì nút dưới cùng đổi theo, thấy ngay mà không phải cuộn
                ngược lên kiểm tra.
              */}
              <Button
                label={t(`submit.${type as 'income' | 'expense'}`)}
                icon={
                  type === RECEIPT_TYPE.INCOME
                    ? 'arrow-down-circle-outline'
                    : 'arrow-up-circle-outline'
                }
                loading={create.isPending}
                onPress={() => void submit()}
              />
            </YStack>
          </XStack>
        </YStack>
      }
    >
      <DateField control={control} name="occurredAt" label={t('occurredAt')} required />

      <SelectField
        control={control}
        name="type"
        label={t('type')}
        options={RECEIPT_TYPE_VALUES.map((value) => ({
          value,
          label: domainLabel('receiptType', value),
        }))}
        required
      />

      {/*
        Ba lối liên kết — BA HÀNG lựa chọn xếp dọc, đúng khối "Khoản này là" của web.

        Dải viên nằm ngang chỉ chứa nổi cái tên ("Không gắn" · "Đơn thuê" · "Xe"), nên lời giải
        thích phải dồn xuống MỘT dòng chú thích chung bên dưới — và nó chỉ nói về viên ĐANG chọn.
        Người dùng muốn biết "Đơn thuê" khác "Xe" chỗ nào thì phải bấm thử từng viên mới đọc được.
        Xếp dọc thì cả ba lời giải thích cùng hiện, và đây là câu hỏi ĐẦU TIÊN của form — nó quyết
        định hình dạng phần còn lại, đáng để chiếm chỗ.
      */}
      <YStack gap={space.xs}>
        <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {t('linkMode.label')}
        </Text>
        {RECEIPT_LINK_MODE_VALUES.map((mode) => (
          <RadioOption
            key={mode}
            label={t(`linkMode.${mode}`)}
            hint={t(`linkHint.${mode}`)}
            icon={LINK_MODE_ICON[mode]}
            checked={linkMode === mode}
            onPress={() => changeLinkMode(mode)}
          />
        ))}
      </YStack>

      {linkingBooking ? (
        <YStack gap={space.sm}>
          <FieldBox
            label={t('link.label')}
            value={booking?.code ?? bookingId ?? ''}
            placeholder={t('bookingPlaceholder')}
            icon="document-text-outline"
            required
            onPress={() => setPicking('booking')}
          />
          {booking ? <BookingLinkCard booking={booking} /> : null}
        </YStack>
      ) : null}

      {linkingVehicle ? (
        <YStack gap={space.sm}>
          <FieldBox
            label={t('link.label')}
            value={
              selectedVehicle ? vehicleLabel(selectedVehicle.name, selectedVehicle.plateNumber) : ''
            }
            placeholder={t('vehiclePlaceholder')}
            icon="car-outline"
            required
            onPress={() => setPicking('vehicle')}
          />
          {vehicleMissing ? <Callout tone="danger">{t('vehicleGone')}</Callout> : null}
          {selectedVehicle ? <VehicleLinkCard vehicle={selectedVehicle} /> : null}
        </YStack>
      ) : null}

      <SelectField
        control={control}
        name="categoryId"
        label={t('category')}
        placeholder={loadingCategories ? '' : t('categoryPlaceholder')}
        options={categoryOptions}
        required
      />

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

      <YStack gap={space.xs}>
        <MoneyField control={control} name="amount" label={t('amount')} required />
        {/* Số tiền bằng chữ NGAY DƯỚI ô nhập — chỗ duy nhất bắt được lỗi thừa một số 0. */}
        {amount == null ? null : (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {moneyToVietnameseWords(String(amount))}
          </Text>
        )}
      </YStack>

      <TextField
        control={control}
        name="referenceCode"
        label={t('referenceCode')}
        placeholder={t('referenceCodePlaceholder')}
      />

      <TextField
        control={control}
        name="description"
        label={t('description')}
        required
        multiline
        rows={3}
        maxLength={RECEIPT_DESCRIPTION_MAX}
      />

      <ReceiptAttachmentsField
        control={control}
        name="attachments"
        label={t('attachments.label')}
      />

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
