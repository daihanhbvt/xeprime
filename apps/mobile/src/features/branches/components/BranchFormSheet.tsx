import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { branchFormSchema, type BranchFormValues } from '@xeprime/validators';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { FieldLabel } from '@/components/ui/Field';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { MAP_PREVIEW_RATIO, mapAppUrl, mapPreviewUrl, toGeoPoint } from '@/lib/map-static';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { Branch } from '../api';
import { useCreateBranch, useUpdateBranch } from '../hooks/use-branches';

/**
 * Thêm/sửa chi nhánh — MỘT tấm trượt cho cả hai, đúng như web dùng chung một `BranchFormDialog`:
 * hai màn nhập cùng một bộ trường, còn trạng thái/mặc định đi bằng endpoint riêng.
 *
 * Thân form chỉ render khi mở và remount theo `key`, nên mỗi lần mở là state sạch mà không cần
 * một effect nào đồng bộ lại.
 *
 * **Không có ô toạ độ.** Backend tự tra từ địa chỉ khi lưu; phần KIỂM lại cái ghim nằm ở
 * `BranchLocation` cuối file.
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
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const provinces = useProvinceOptions();

  const create = useCreateBranch();
  const update = useUpdateBranch();
  const saving = create.isPending || update.isPending;

  const resolver = useValidationResolver<BranchFormValues>(
    branchFormSchema,
    'Branches.validation',
  );
  const { control, handleSubmit } = useForm<BranchFormValues>({
    resolver,
    defaultValues: {
      name: branch?.name ?? '',
      provinceCode: branch?.provinceCode ?? '',
      address: branch?.address ?? '',
      phone: branch?.phone ?? '',
    },
  });

  const submit = handleSubmit((values) => {
    const body = {
      name: values.name.trim(),
      provinceCode: values.provinceCode,
      address: values.address.trim() || undefined,
      phone: values.phone.trim() || undefined,
    };
    const done = {
      onSuccess: () => {
        toast.showSuccess(
          branch ? t('toast.updated') : t('toast.created', { name: body.name }),
        );
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
        <Callout tone="warning" title={tForm('noProvinceTitle')}>
          {branch.legacyProvinceValue
            ? tForm('noProvinceLegacy', { value: branch.legacyProvinceValue })
            : tForm('noProvinceHint')}
        </Callout>
      ) : null}

      {provinces.isError ? (
        <Callout tone="warning" title={tForm('provincesLoadError')}>
          {errorMessage(provinces.error)}
        </Callout>
      ) : null}

      <TextField
        control={control}
        name="name"
        label={tForm('nameLabel')}
        placeholder={tForm('namePlaceholder')}
        required
      />
      <SelectField
        control={control}
        name="provinceCode"
        label={tForm('provinceLabel')}
        options={provinces.options}
        required
        placeholder={provinces.isLoading ? tForm('provinceLoading') : tForm('provincePlaceholder')}
        hint={tForm('provinceHelp')}
      />
      <TextField
        control={control}
        name="address"
        label={tForm('addressLabel')}
        placeholder={tForm('addressPlaceholder')}
      />
      <TextField
        control={control}
        name="phone"
        label={tForm('phoneLabel')}
        placeholder={tForm('phonePlaceholder')}
        keyboardType="phone-pad"
      />

      {/*
        Chỉ hiện khi SỬA: chi nhánh mới chưa có địa chỉ nào để tra, một khối bản đồ rỗng ở form
        tạo chỉ là chỗ trống gây khó hiểu. Ba nhánh dưới đây là ba SỰ THẬT khác nhau và phải nói
        khác nhau — có vị trí / có địa chỉ nhưng tra không ra / chưa nhập địa chỉ.
      */}
      {branch ? <BranchLocation branch={branch} /> : null}

      <Button
        label={branch ? tActions('save') : tForm('createOk')}
        loading={saving}
        onPress={() => void submit()}
      />
      <Button label={tActions('close')} variant="ghost" disabled={saving} onPress={onDone} />
    </YStack>
  );
}

/** Nền tối mờ dưới chữ trắng — đủ tương phản trên cả nền bản đồ sáng lẫn mảng cây xanh đậm. */
const SCRIM = 'rgba(0,0,0,0.55)';

const styles = StyleSheet.create({
  map: { width: '100%', aspectRatio: MAP_PREVIEW_RATIO },
});

/**
 * Vị trí chi nhánh trên bản đồ — bản native của khối `EmbedMap` bên web.
 *
 * **Toạ độ không có ô nhập.** Backend tự tra từ địa chỉ khi lưu (best-effort), và khối này là chỗ
 * chủ shop KIỂM lại kết quả đó. Việc kiểm không phải trang trí: toạ độ chi nhánh là điểm xuất
 * phát của mọi phép tính phí giao xe tận nơi, nên một cái ghim lệch vài km là mọi đơn giao của
 * chi nhánh đó sai tiền — mà một cái NÚT thì không kiểm được gì, phải mở app khác rồi quay lại.
 *
 * Web nhúng `<iframe>` Maps Embed; native hiện ẢNH bản đồ có ghim (Maps Static API) và chạm vào
 * thì mở bản đồ thật của hệ điều hành. Khác biệt NĂNG LỰC NỀN TẢNG, không phải nghiệp vụ: cùng
 * một việc (nhìn cái ghim), và bản đồ hệ điều hành còn cho zoom/chỉ đường thật. Lý do chọn ảnh
 * tĩnh thay vì `react-native-maps`: `lib/map-static.ts`.
 *
 * Chưa khai key thì lùi về đúng cái nút cũ — mất phần xem trước, không mất lối đi.
 */
function BranchLocation({ branch }: { branch: Branch }) {
  const t = useTranslations('Branches.map');
  const tStates = useTranslations('Common.states');

  const point = toGeoPoint(branch.latitude, branch.longitude);
  const preview = mapPreviewUrl(point);

  if (!point) {
    return (
      <YStack gap={space.xs}>
        <FieldLabel label={t('title')} />
        <Text col={colors.textMuted} fos={fontSize.label}>
          {branch.address ? t('pending') : t('addressFirst')}
        </Text>
      </YStack>
    );
  }

  const openMap = () => void Linking.openURL(mapAppUrl(point));

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={t('title')} />

      {preview ? (
        <Pressable onPress={openMap} accessibilityRole="imagebutton" accessibilityLabel={t('open')}>
          <YStack style={styles.map} br={radius.md} bw={1} bc={colors.border} ov="hidden">
            <RemoteImage
              uri={preview}
              radius={radius.md}
              fallback={
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {tStates('imageUnavailable')}
                </Text>
              }
            />

            {/*
              Viên "Mở bản đồ" ở GÓC, không phải giữa khung như viên máy ảnh của ô ảnh: giữa
              khung là chỗ cái GHIM đứng, mà ghim mới là thứ người dùng mở khối này ra để nhìn.
              Đây cũng đúng chỗ Google đặt "View larger map" trên khung nhúng của họ.
            */}
            <XStack
              pos="absolute"
              right={space.xs}
              bottom={space.xs}
              ai="center"
              gap={space.xs}
              bg={SCRIM}
              br={radius.pill}
              px={space.xs}
              py={2}
              pointerEvents="none"
            >
              <Ionicons name="open-outline" size={iconSize.xs} color={colors.textInverse} />
              <Text col={colors.textInverse} fos={fontSize.label} fow={fontWeight.medium}>
                {t('open')}
              </Text>
            </XStack>
          </YStack>
        </Pressable>
      ) : (
        <Button label={t('open')} variant="secondary" icon="map-outline" onPress={openMap} />
      )}

      <Text col={colors.textMuted} fos={fontSize.label}>
        {t('hint')}
      </Text>
    </YStack>
  );
}
