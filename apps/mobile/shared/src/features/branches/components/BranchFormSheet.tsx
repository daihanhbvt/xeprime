import { useState } from 'react';
import { Pressable } from 'react-native';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { guessAddressLine } from '@xeprime/domain';
import { branchFormSchema, type BranchFormValues } from '@xeprime/validators';
import { AddressFields } from '@/components/form/AddressFields';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { CheckMark } from '@/components/ui/CheckMark';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, sizing, space } from '@/theme/tokens';
import { BRANCH_ACTION, type Branch } from '../api';
import { useBranchAction, useCreateBranch, useUpdateBranch } from '../hooks/use-branches';

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
 * ảnh bản đồ. Tỉnh/thành, xã/phường VÀ số nhà/đường đều BẮT BUỘC (`branchFormSchema`, ADR 0077 -
 * y như web `BranchFormDialog`): toạ độ chi nhánh là điểm xuất phát của phí giao xe tận nơi.
 */
export function BranchFormSheet({
  open,
  branch,
  onClose,
  notice,
}: {
  open: boolean;
  /** `null` = thêm mới; có giá trị = sửa chi nhánh đó. */
  branch: Branch | null;
  onClose: () => void;
  /**
   * Dải cảnh báo đặt TRÊN form — nơi gọi nói điều mà form không tự biết.
   *
   * Ví dụ duy nhất đang dùng: chi nhánh này đang giữ nhiều xe, nên sửa địa chỉ ở đây đổi vị trí
   * công khai của tất cả chúng. Form chi nhánh không biết mình đang được mở từ đâu.
   */
  notice?: React.ReactNode;
}) {
  const t = useTranslations('Branches.form');

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={branch ? t('editTitle', { name: branch.name }) : t('createTitle')}
    >
      {open ? (
        <>
          {notice}
          <BranchForm key={branch?.id ?? 'new'} branch={branch} onDone={onClose} />
        </>
      ) : null}
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
  const colors = useColors();
  const create = useCreateBranch();
  const update = useUpdateBranch();
  const setDefault = useBranchAction();
  /*
   * "Đặt làm chi nhánh mặc định" ngay trong form (web `BranchFormDialog`, PR #282) — chỉ khi chi
   * nhánh chưa là mặc định. Lưu xong mới gọi lượt đặt mặc định; lượt đó lỗi thì chi nhánh vẫn đã
   * lưu, lối đặt mặc định ở menu thẻ vẫn còn.
   */
  const canMakeDefault = !branch?.isDefault;
  const [makeDefault, setMakeDefault] = useState(false);
  const saving = create.isPending || update.isPending || setDefault.isPending;

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
      /*
       * Chuỗi RỖNG không được gửi. DTO khai `@IsOptional()` kèm `@Length(5, 5)`, mà `@IsOptional`
       * chỉ bỏ qua `null`/`undefined` — một `''` vẫn đi vào `@Length` và bật 400. Từ ADR 0042
       * form không còn ô Xã/phường nên chi nhánh MỚI luôn để trống trường này; chi nhánh cũ đã có
       * mã thì giữ nguyên mã đó.
       */
      wardCode: values.wardCode || undefined,
      addressLine: values.addressLine.trim() || undefined,
      placeId: values.placeId ?? undefined,
      latitude: values.latitude ?? undefined,
      longitude: values.longitude ?? undefined,
      locationSource: values.locationSource ?? undefined,
      phone: values.phone.trim() || undefined,
    };
    const done = {
      onSuccess: (saved: Branch) => {
        toast.showSuccess(branch ? t('toast.updated') : t('toast.created', { name: body.name }));
        if (makeDefault && canMakeDefault) {
          setDefault.mutate(
            { id: saved.id, action: BRANCH_ACTION.SET_DEFAULT },
            { onError: (err: unknown) => toast.showError(errorMessage(err)) },
          );
        }
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
        // Chỉ form TẠO MỚI. Ở form SỬA, ô tỉnh trống nghĩa là chi nhánh này có từ trước danh mục
        // hành chính (ADR 0035 điều 7) — điền vào đó tỉnh người dùng vừa tìm xe là dời một địa
        // điểm vận hành có thật sang tỉnh khác, âm thầm, chỉ vì họ bấm Lưu.
        prefillRememberedProvince={!branch}
      />
      <TextField
        control={control}
        name="phone"
        label={tForm('phoneLabel')}
        placeholder={tForm('phonePlaceholder')}
        keyboardType="phone-pad"
      />
      {canMakeDefault ? (
        <Pressable
          disabled={saving}
          onPress={() => setMakeDefault((value) => !value)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: makeDefault, disabled: saving }}
          accessibilityLabel={tForm('makeDefault')}
        >
          <XStack ai="center" gap={space.sm} minHeight={sizing.touchTarget}>
            <CheckMark checked={makeDefault} />
            <Text f={1} col={colors.text} fos={fontSize.bodySm}>
              {tForm('makeDefault')}
            </Text>
          </XStack>
        </Pressable>
      ) : null}

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
            label={branch ? tActions('update') : tForm('createOk')}
            icon="checkmark-outline"
            loading={saving}
            onPress={() => void submit()}
          />
        </YStack>
      </XStack>
    </YStack>
  );
}
