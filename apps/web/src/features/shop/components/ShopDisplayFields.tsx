'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { Control, FieldValues, Path } from 'react-hook-form';
import type { ShopProfileValues } from '@xeprime/validators';

import { SHOP_LOGO_TRIGGER_ID } from '@/constants/routes';
import { ImageUploadField } from '@/components/form/ImageUploadField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { presignShopMedia } from '@/services/upload';

import styles from './ShopFields.module.css';

/**
 * THÔNG TIN HIỂN THỊ — bốn thứ khách nhìn thấy trên marketplace: tên, giới thiệu, logo, ảnh bìa.
 *
 * Dùng chung bởi trang Cửa hàng (`/manage/shop`) và tiến trình đăng ký chủ xe
 * (`/account/registration`): cùng endpoint, cùng schema, nên cùng một bộ ô. Chỉ nhận `control` —
 * nó KHÔNG biết mình đang nằm trong bố cục nào, và đó là điều kiện để hai màn có bố cục khác
 * nhau mà không cần hai bản sao của bốn ô này.
 *
 * Logo là hình đại diện DUY NHẤT của gian hàng trong cổng quản lý (`ManageUserCard`, `Topbar`
 * đều đọc nó qua `/auth/me`). Không có đường nào chép nó sang `users.avatar_url` và ngược lại:
 * một tấm là mặt tiền của cửa hàng, tấm kia là ảnh của một con người trên marketplace.
 */
export function ShopDisplayFields({ control }: { control: Control<ShopProfileValues> }) {
  const t = useTranslations('Shop');

  return (
    <>
      <ShopDisplayNameField control={control} />
      <TextAreaField
        control={control}
        name="bio"
        label={t('form.display.bio.label')}
        placeholder={t('form.display.bio.placeholder')}
        maxLength={2000}
      />
      {/*
        Logo và ảnh bìa CÙNG HÀNG ở desktop, xếp dọc ở màn hẹp: chúng là một quyết định ("gian
        hàng của tôi trông thế nào"), nên nhìn thấy cả hai cùng lúc mới so được.
      */}
      <div className={styles.imageRow}>
        <ShopLogoField control={control} />
        <ImageUploadField
          control={control}
          name="coverUrl"
          label={t('form.display.cover.label')}
          help={t('form.display.cover.hint')}
          presign={presignShopMedia}
        />
      </div>
    </>
  );
}

/**
 * Hai ô dưới đây tách riêng vì có màn hình hỏi ĐÚNG chúng mà không hỏi giới thiệu/ảnh bìa: bước
 * "thông tin gian hàng" của luồng nâng cấp lên tuyến gói (`PackageUpgradeWizard`) chỉ cần đủ bộ
 * `missingPackageShopRegistrationFields` + logo.
 *
 * Tách ở mức Ô NHẬP, không phải chép lại: nhãn, gợi ý, đường presign và `triggerId` chỉ có một
 * bản. Một bản sao của ô logo ở màn khác là một chỗ để `SHOP_LOGO_TRIGGER_ID` lặng lẽ trỏ vào hư
 * không sau lần đổi id tiếp theo.
 *
 * `Control<ShopProfileValues>` không dùng được ở đây: form nâng cấp `pick` một tập con của
 * `shopProfileSchema`, và `Control` của nó là một kiểu KHÁC. Nên hai ô này chỉ đòi form có đúng
 * trường mình đọc — đó là toàn bộ thứ chúng chạm tới.
 */
export function ShopDisplayNameField<T extends FieldValues & { displayName: string }>({
  control,
}: {
  control: Control<T>;
}) {
  const t = useTranslations('Shop');
  return (
    <TextField
      control={control}
      name={'displayName' as Path<T>}
      label={t('form.display.displayName.label')}
      required
      placeholder={t('form.display.displayName.placeholder')}
    />
  );
}

export function ShopLogoField<T extends FieldValues & { logoUrl?: string | null }>({
  control,
  help,
}: {
  control: Control<T>;
  /** Gợi ý thay thế — luồng nâng cấp nói rõ logo bắt buộc TRƯỚC KHI gửi xe lên chợ, không phải lúc mua gói. */
  help?: ReactNode;
}) {
  const t = useTranslations('Shop');
  return (
    <ImageUploadField
      control={control}
      name={'logoUrl' as Path<T>}
      label={t('form.display.logo.label')}
      help={help ?? t('form.display.logo.hint')}
      presign={presignShopMedia}
      /*
       * Đích của CTA "Tải logo" ở dải chào mừng sau khi thanh toán, và của lỗi thiếu logo khi
       * gửi xe duyệt (ADR 0040). Hằng số dùng chung nên hai nơi kia không gõ tay một chuỗi
       * `id` — gõ sai là nút cuộn về hư không, và không có gì đỏ lên để báo.
       */
      triggerId={SHOP_LOGO_TRIGGER_ID}
    />
  );
}
