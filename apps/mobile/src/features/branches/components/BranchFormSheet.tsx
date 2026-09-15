import { useForm } from 'react-hook-form';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { guessAddressLine } from '@xeprime/domain';
import { branchFormSchema, type BranchFormValues } from '@xeprime/validators';
import { AddressFields } from '@/components/form/AddressFields';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { space } from '@/theme/tokens';
import type { Branch } from '../api';
import { useCreateBranch, useUpdateBranch } from '../hooks/use-branches';

/** Tên trường địa chỉ trong `branchFormSchema` — hằng ngoài component để định danh ổn định. */
const ADDRESS_FIELD_NAMES = {
  provinceCode: 'provinceCode',
  wardCode: 'wardCode',
  addressLine: 'addressLine',
} as const;
const ADDRESS_PIN_NAMES = {
  placeId: 'placeId',
  latitude: 'latitude',
  longitude: 'longitude',
  locationSource: 'locationSource',
} as const;

/**
 * Thêm/sửa chi nhánh — MỘT tấm trượt cho cả hai, đúng như web dùng chung một `BranchFormDialog`:
 * hai màn nhập cùng một bộ trường, còn trạng thái/mặc định đi bằng endpoint riêng.
 *
 * Thân form chỉ render khi mở và remount theo `key`, nên mỗi lần mở là state sạch mà không cần
 * một effect nào đồng bộ lại.
 *
 * Địa chỉ đi qua `AddressFields` — tỉnh/thành và xã/phường chọn từ DANH MỤC NHÀ NƯỚC (mô hình
 * hai cấp từ 01/07/2025), số nhà và đường thì gõ kèm gợi ý địa điểm, rồi KIỂM lại cái ghim trên
 * ảnh bản đồ. Cả ba phần đều bắt buộc vì chi nhánh là địa điểm vận hành thật: xe nằm ở đó, khách
 * tới đó nhận xe, và toạ độ của nó là điểm xuất phát của mọi phép tính phí giao xe tận nơi.
 */
export function BranchFormSheet({
  open,
  branch,
  onClose,
}: {
  open: boolean;
  /** `null` = thêm mới; có giá trị = sửa chi nhánh đó. */
  branch: Branch | null;
  onClose: () => void;
}) {
  const t = useTranslations('Branches.form');

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={branch ? t('editTitle', { name: branch.name }) : t('createTitle')}
    >
      {open ? <BranchForm key={branch?.id ?? 'new'} branch={branch} onDone={onClose} /> : null}
    </BottomSheet>
  );
}

function BranchForm({ branch, onDone }: { branch: Branch | null; onDone: () => void }) {
  const t = useTranslations('Branches');
  const tForm = useTranslations('Branches.form');
  const tAddr = useTranslations('Address');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const create = useCreateBranch();
  const update = useUpdateBranch();
  const saving = create.isPending || update.isPending;

  const resolver = useValidationResolver<BranchFormValues>(branchFormSchema, 'Branches.validation');
  const { control, handleSubmit } = useForm<BranchFormValues>({
    resolver,
    defaultValues: {
      name: branch?.name ?? '',
      provinceCode: branch?.provinceCode ?? '',
      wardCode: branch?.wardCode ?? '',
      /*
       * Chi nhánh CŨ chưa có `addressLine`: đoán phần "số nhà, đường" từ chuỗi hiển thị bằng
       * cách cắt các cụm trông như đơn vị hành chính. GỢI Ý cho ô nhập, không phải dữ liệu tự
       * lưu — chủ shop nhìn và sửa trước khi lưu.
       */
      addressLine: branch?.addressLine ?? guessAddressLine(branch?.address),
      placeId: branch?.placeId ?? null,
      latitude: branch?.latitude == null ? null : Number(branch.latitude),
      longitude: branch?.longitude == null ? null : Number(branch.longitude),
      locationSource: branch?.locationSource ?? null,
      phone: branch?.phone ?? '',
    },
  });

  const submit = handleSubmit((values) => {
    const body = {
      name: values.name.trim(),
      provinceCode: values.provinceCode,
      wardCode: values.wardCode,
      addressLine: values.addressLine.trim() || undefined,
      placeId: values.placeId ?? undefined,
      latitude: values.latitude ?? undefined,
      longitude: values.longitude ?? undefined,
      locationSource: values.locationSource ?? undefined,
      phone: values.phone.trim() || undefined,
    };
    const done = {
      onSuccess: () => {
        toast.showSuccess(branch ? t('toast.updated') : t('toast.created', { name: body.name }));
        onDone();
      },
      onError: (err: unknown) => toast.showError(errorMessage(err)),
    };
    // Tấm trượt chỉ đóng khi lưu THÀNH CÔNG — đóng trước rồi báo lỗi sau là mất hết dữ liệu vừa nhập.
    if (branch) update.mutate({ id: branch.id, body }, done);
    else create.mutate(body, done);
  });

  return (
    <YStack gap={space.md}>
      {branch?.needsLocationReview ? (
        <Callout tone="warning" title={tAddr('review.title')}>
          {branch.legacyProvinceValue
            ? `${tAddr('review.hint')} ${tAddr('review.legacyValue', { value: branch.legacyProvinceValue })}`
            : tAddr('review.hint')}
        </Callout>
      ) : null}

      <TextField
        control={control}
        name="name"
        label={tForm('nameLabel')}
        placeholder={tForm('namePlaceholder')}
        required
      />
      <AddressFields
        control={control}
        names={ADDRESS_FIELD_NAMES}
        pin={ADDRESS_PIN_NAMES}
        required
      />
      <TextField
        control={control}
        name="phone"
        label={tForm('phoneLabel')}
        placeholder={tForm('phonePlaceholder')}
        keyboardType="phone-pad"
      />

      <XStack gap={space.sm}>
        {/*
          Lối thoát bên TRÁI, hành động chính bên PHẢI — xếp dọc thì hàng dưới đọc ra là một
          bước tiếp theo chứ không phải một lựa chọn thay thế.
        
          "Đóng" co vừa chữ, nút chính lấy phần còn lại — xem luật ở `Button.tsx`. Chia đôi thì
          nửa hàng bên trái bỏ trống quá nửa cho một từ bốn chữ, còn nút chính thiếu chỗ.
        */}
        <YStack flexShrink={0}>
          <Button label={tActions('close')} variant="ghost" disabled={saving} onPress={onDone} />
        </YStack>
        <YStack f={1}>
          <Button
            label={branch ? tActions('save') : tForm('createOk')}
            icon="checkmark-outline"
            loading={saving}
            onPress={() => void submit()}
          />
        </YStack>
      </XStack>
    </YStack>
  );
}
