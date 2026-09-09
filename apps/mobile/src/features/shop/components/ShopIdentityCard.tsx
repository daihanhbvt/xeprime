import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { useController, useWatch, type Control } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { TENANT_STATUS, TENANT_STATUS_META, type TenantStatus } from '@xeprime/types';
import type { ShopProfileValues } from '@xeprime/validators';
import { Button } from '@/components/ui/Button';
import { ImageEditBadge } from '@/components/ui/ImageEditBadge';
import { ShopCover, ShopLogo, SHOP_LOGO } from '@/components/ui/ShopCover';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useImageUpload } from '@/components/ui/use-image-upload';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { uploadsApi } from '../api';

interface Props {
  control: Control<ShopProfileValues>;
  /** Tên gian hàng đã lưu — dùng khi tên hiển thị còn trống, để khối không bao giờ vô danh. */
  fallbackName: string;
  status: TenantStatus;
  /** Câu mô tả trang. Hiện ĐỦ, xuống dòng thoải mái — xem docblock. */
  description: string;
  editable: boolean;
  /** Có mặt khi gian hàng đang hoạt động — trang công khai chỉ tồn tại lúc đó. */
  onViewPublicPage?: () => void;
}

/**
 * Đầu màn hồ sơ gian hàng: ảnh bìa · logo · tên hiển thị · trạng thái · mô tả trang.
 *
 * Đây vừa là XEM TRƯỚC vừa là Ô NHẬP. Bản trước tách hai vai đó ra: tên gian hàng nằm ở tiêu đề
 * trang, còn logo và ảnh bìa là hai ô ảnh 16:9 lọt giữa một biểu mẫu bốn khối — chủ shop không
 * bao giờ nhìn thấy ba thứ đó cạnh nhau, tức không bao giờ nhìn thấy thứ khách sẽ thấy. Gộp lại
 * theo đúng cách trang gian hàng công khai dựng (`ShopHeader` bên web: bìa, logo tròn có vòng
 * viền đè lên, rồi tên) thì sửa tới đâu thấy tới đó.
 *
 * Tên đọc từ `useWatch` chứ không từ hồ sơ đã lưu: gõ tên mới mà khối trên vẫn đứng im thì nó
 * không còn là xem trước nữa. `useWatch` cũng khoanh việc render lại vào riêng khối này thay vì
 * cả màn nhấp nháy theo từng phím.
 *
 * Mô tả KHÔNG cắt bằng "…". Nó từng đi qua khe `total` của `ManagePageTitle` — khe dành cho
 * "142 đơn" và vì thế `numberOfLines={1}` — nên câu giải thích cả trang cụt ngay sau bốn chữ.
 */
export function ShopIdentityCard({
  control,
  fallbackName,
  status,
  description,
  editable,
  onViewPublicPage,
}: Props) {
  const t = useTranslations('Shop');
  const tImage = useTranslations('Common.image');
  const domainLabel = useDomainLabel();

  const cover = useController({ control, name: 'coverUrl' });
  const logo = useController({ control, name: 'logoUrl' });
  const displayName = useWatch({ control, name: 'displayName' });

  const coverUrl = cover.field.value;
  const logoUrl = logo.field.value;
  const name = displayName?.trim() || fallbackName;

  const coverUpload = useImageUpload({
    title: t('form.display.cover.label'),
    hint: t('form.display.cover.hint'),
    presign: uploadsApi.shopMedia,
    onUploaded: ([url]) => cover.field.onChange(url ?? null),
    ...(coverUrl ? { onRemove: () => cover.field.onChange(null) } : {}),
  });

  const logoUpload = useImageUpload({
    title: t('form.display.logo.label'),
    hint: t('form.display.logo.hint'),
    presign: uploadsApi.shopMedia,
    onUploaded: ([url]) => logo.field.onChange(url ?? null),
    ...(logoUrl ? { onRemove: () => logo.field.onChange(null) } : {}),
  });

  return (
    <YStack>
      <Pressable
        onPress={coverUpload.open}
        disabled={!editable || coverUpload.busy}
        accessibilityRole="imagebutton"
        accessibilityLabel={
          coverUrl ? tImage('changeImage') : t('form.display.cover.label')
        }
      >
        <ShopCover url={coverUrl}>
          {/*
            ĐÚNG MỘT hình ở giữa khung, không bao giờ hai.

            Sửa được thì viên máy ảnh nói cả hai việc — "chưa có ảnh bìa" và "chạm để đổi" — nên
            hình `image-outline` chỉ còn việc ở chế độ CHỈ ĐỌC (nhân viên không có `tenant.update`,
            hoặc hồ sơ đang chờ duyệt). Vẽ cả hai thì chúng chồng lên nhau giữa khung.
          */}
          {editable ? (
            <ImageEditBadge busy={coverUpload.busy} />
          ) : coverUrl ? null : (
            <Ionicons name="image-outline" size={iconSize.lg} color={colors.primaryActive} />
          )}
        </ShopCover>
      </Pressable>

      <YStack px={layout.screenX} gap={space.sm}>
        {/*
          Hàng logo + hành động: logo ĐÈ lên nửa dưới ảnh bìa (đúng `margin-top: -44px` của web),
          còn nút sang trang công khai neo ở đáy hàng nên nó luôn nằm dưới mép ảnh bìa.
        */}
        <XStack ai="flex-end" jc="space-between" gap={space.sm} mt={-SHOP_LOGO / 2}>
          <Pressable
            onPress={logoUpload.open}
            disabled={!editable || logoUpload.busy}
            accessibilityRole="imagebutton"
            accessibilityLabel={logoUrl ? tImage('changeImage') : t('form.display.logo.label')}
          >
            <ShopLogo url={logoUrl} name={name}>
              {/*
                Viên máy ảnh nằm TRONG vòng tròn, không treo ở góc ngoài: một chấm 24dp lơ lửng
                cạnh logo đọc ra như huy hiệu trạng thái (đang online, đã xác minh), không ra nút
                đổi ảnh. Cỡ `sm` để chữ cái / logo bên dưới vẫn thò ra quanh viên.
              */}
              {editable ? <ImageEditBadge busy={logoUpload.busy} size="sm" /> : null}
            </ShopLogo>
          </Pressable>

          {status === TENANT_STATUS.ACTIVE && onViewPublicPage ? (
            <Button
              label={t('page.viewPublicPage')}
              variant="secondary"
              size="sm"
              shape="square"
              block={false}
              icon="open-outline"
              onPress={onViewPublicPage}
            />
          ) : null}
        </XStack>

        <YStack gap={space.xs}>
          <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} numberOfLines={2}>
            {name}
          </Text>
          <XStack>
            <StatusBadge
              label={domainLabel('tenantStatus', status)}
              color={TENANT_STATUS_META[status].color}
            />
          </XStack>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {description}
          </Text>
        </YStack>
      </YStack>

      {coverUpload.sheet}
      {logoUpload.sheet}
    </YStack>
  );
}
