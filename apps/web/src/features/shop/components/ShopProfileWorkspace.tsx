'use client';

import {
  BankOutlined,
  EnvironmentOutlined,
  ExportOutlined,
  MailOutlined,
  PhoneOutlined,
  SafetyOutlined,
  SaveOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, Button, Form } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import {
  TENANT_STATUS,
  TENANT_STATUS_META,
  toLocalVnPhone,
  type TenantStatus,
} from '@xeprime/types';
import { shopProfileSchema, type ShopProfileValues } from '@xeprime/validators';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ImageUploadField } from '@/components/form/ImageUploadField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES, shopPath } from '@/constants/routes';
import { cx } from '@/lib/cx';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { getErrorMessage } from '@/services/api-client';
import { presignShopMedia } from '@/services/upload';
import type { MyShop, UpdateProfileInput } from '../types';
import styles from './ShopProfileWorkspace.module.css';

interface ShopProfileWorkspaceProps {
  shop: MyShop;
  /** Quyền `tenant.update`. Thiếu quyền và "đang chờ duyệt" đều dẫn tới chỉ-xem, xem `readOnly`. */
  canEdit: boolean;
  /** Đang gửi: khoá luôn ô nhập, để không ai sửa tiếp thứ vừa gửi đi và tưởng là đã lưu. */
  saving: boolean;
  errorMessage?: string | null;
  onSubmit: (body: UpdateProfileInput) => void;
  /** Dải trạng thái duyệt — trang dựng sẵn vì nó gắn với mutation "gửi duyệt", không phải form. */
  banner?: ReactNode;
}

/**
 * Giá trị khởi tạo của form.
 *
 * Tỉnh/thành lấy từ CHI NHÁNH MẶC ĐỊNH trước, hai cột trên hồ sơ chỉ là bản sao dự phòng cho dữ
 * liệu cũ (xem `syncProfileFromDefaultBranch` ở backend) — đọc ngược lại sẽ hiện tỉnh cũ sau khi
 * chủ shop vừa đổi chi nhánh.
 *
 * SĐT đổi về dạng `09…` để nhập/đọc; backend lưu `84…` và tự chuẩn hoá lại khi nhận.
 */
function toValues(shop: MyShop): ShopProfileValues {
  const p = shop.profile;
  return {
    displayName: p.displayName ?? '',
    bio: p.bio ?? '',
    address: p.address ?? '',
    provinceCode: shop.defaultBranch?.provinceCode ?? p.provinceCode ?? '',
    taxCode: p.taxCode ?? '',
    businessLicenseNo: p.businessLicenseNo ?? '',
    bankName: p.bankName ?? '',
    bankAccountNo: p.bankAccountNo ?? '',
    bankAccountName: p.bankAccountName ?? '',
    logoUrl: p.logoUrl ?? null,
    coverUrl: p.coverUrl ?? null,
    ownerFullName: p.ownerFullName ?? '',
    ownerPhone: p.ownerPhone ? toLocalVnPhone(p.ownerPhone) : '',
    ownerEmail: p.ownerEmail ?? '',
  };
}

/**
 * Màn hồ sơ gian hàng: tiêu đề + hành động + dải trạng thái + form, trong MỘT thẻ `<form>`.
 *
 * Bố cục: khối CÔNG KHAI (khách nhìn thấy) ở cột trái, khối NỘI BỘ (chủ gian hàng, chỉ đội ngũ
 * XePrime đọc) ở cột phải. Tách hai cột chính là để ranh giới đó nhìn phát là thấy — người điền
 * không phải đoán thông tin nào sẽ lên marketplace.
 *
 * Vì sao tiêu đề nằm TRONG component này chứ không ở route: nút Lưu/Huỷ sống ở tiêu đề, mà cả
 * hai chỉ có nghĩa khi biết form CÓ THAY ĐỔI HAY CHƯA. Đặt chúng ở route thì `isDirty` phải rời
 * khỏi React Hook Form và đi vòng qua một state thứ hai — hai nguồn sự thật cho cùng một câu hỏi.
 */
export function ShopProfileWorkspace({
  shop,
  canEdit,
  saving,
  errorMessage,
  onSubmit,
  banner,
}: ShopProfileWorkspaceProps) {
  const t = useTranslations('Shop');
  const tCommon = useTranslations('Common');
  const provinces = useProvinceOptions();

  // `values` (không phải `defaultValues`): sau khi lưu, query trả hồ sơ mới và form phải theo —
  // nếu không, "Huỷ bỏ" mời người dùng hoàn tác thứ đã lưu xong rồi.
  const { control, handleSubmit, reset, formState } = useForm<ShopProfileValues>({
    resolver: yupResolver(shopProfileSchema),
    values: toValues(shop),
  });

  const status = shop.status as TenantStatus;
  // Backend cũng từ chối ghi khi đang chờ duyệt (`INVALID_STATUS_TRANSITION`). Khoá ở đây để
  // người dùng biết TRƯỚC khi gõ, chứ không phải sau khi bấm Lưu.
  const pendingReview = status === TENANT_STATUS.PENDING_REVIEW;
  const readOnly = pendingReview || !canEdit;
  const readOnlyReason = pendingReview
    ? t('form.lockedWhilePending')
    : canEdit
      ? null
      : t('form.readOnly');

  /**
   * `isDirty` quyết định CẢ HAI nút, và đây là toàn bộ lý do chúng tồn tại:
   *
   * - Chưa sửa gì thì không có gì để lưu → nút Lưu mờ đi. Một nút Lưu lúc nào cũng sáng dạy người
   *   dùng rằng bấm nó là vô hại, và biến "tôi có thay đổi gì chưa nhỉ" thành câu không trả lời được.
   * - Chưa sửa gì thì cũng chẳng có gì để huỷ → nút Huỷ bỏ KHÔNG hiện. Một nút huỷ luôn đứng đó
   *   gợi ý rằng có thứ gì đó đang dở dang.
   */
  const dirty = formState.isDirty && !readOnly;

  const submit = handleSubmit((v) => {
    onSubmit({
      displayName: v.displayName,
      bio: v.bio,
      address: v.address,
      // Chỉ gửi MÃ tỉnh — tên do server tra ra. Backend chuyển tiếp cho chi nhánh mặc định.
      provinceCode: v.provinceCode,
      taxCode: v.taxCode,
      businessLicenseNo: v.businessLicenseNo,
      bankName: v.bankName,
      bankAccountNo: v.bankAccountNo,
      bankAccountName: v.bankAccountName,
      logoUrl: v.logoUrl ?? '',
      coverUrl: v.coverUrl ?? '',
      ownerFullName: v.ownerFullName,
      ownerPhone: v.ownerPhone,
      ownerEmail: v.ownerEmail,
    });
  });

  return (
    <Form
      component={false}
      layout="vertical"
      size="large"
      colon={false}
      requiredMark={trailingRequiredMark}
    >
      <form onSubmit={submit} noValidate className={styles.form}>
        {/*
          Thanh tiêu đề DÍNH, vì nút Lưu sống trong đó: form này cao hơn một màn hình, nút lưu đặt
          ở cuối là nút mà người dùng phải đi tìm. `top`/`z-index` xử lý ở CSS để nó xếp dưới
          topbar của vỏ quản lý chứ không đè lên.
        */}
        <div className={styles.headerBar}>
          <ManagePageHeader
            title={
              <span className={styles.titleRow}>
                <span className={styles.shopName}>{shop.name}</span>
                <StatusTag value={status} meta={TENANT_STATUS_META} group="tenantStatus" />
              </span>
            }
            subtitle={t('page.subtitle')}
            extra={
              <>
                {dirty ? (
                  <span className={styles.dirtyHint}>
                    <span className={styles.dirtyDot} aria-hidden="true" />
                    {t('form.unsaved')}
                  </span>
                ) : null}

                {/* Chỉ shop đang hoạt động mới có trang công khai — link tới 404 là hành động giả. */}
                {status === TENANT_STATUS.ACTIVE ? (
                  <Link href={shopPath.detail(shop.slug)} target="_blank" rel="noopener noreferrer">
                    <Button icon={<ExportOutlined />}>{t('page.viewPublicPage')}</Button>
                  </Link>
                ) : null}

                {/* Chưa sửa gì thì không có gì để huỷ — nút không tồn tại, chứ không phải mờ đi. */}
                {dirty ? (
                  <Button onClick={() => reset()} disabled={saving}>
                    {t('form.reset')}
                  </Button>
                ) : null}

                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  htmlType="submit"
                  loading={saving}
                  disabled={!dirty}
                >
                  {t('form.submit')}
                </Button>
              </>
            }
          />
        </div>

        {banner}

        {errorMessage ? (
          <Alert type="error" showIcon title={errorMessage} className={styles.alert} />
        ) : null}
        {readOnlyReason ? (
          <Alert type="info" showIcon className={styles.alert} title={readOnlyReason} />
        ) : null}
        {provinces.isError ? (
          <Alert
            type="warning"
            showIcon
            className={styles.alert}
            title={t('form.address.province.loadError')}
            description={getErrorMessage(provinces.error)}
            action={
              <Button size="small" onClick={provinces.refetch}>
                {tCommon('actions.retry')}
              </Button>
            }
          />
        ) : null}

        {/*
          `fieldset[disabled]` khoá mọi ô nhập/nút NATIVE bên trong bằng chính cơ chế của trình
          duyệt. `SelectField` vẫn phải nhận `disabled` tường minh: nó là combobox dựng bằng div,
          fieldset không với tới được và dropdown vẫn mở ra như thường.
        */}
        <fieldset disabled={readOnly || saving} className={styles.fieldset}>
          <div className={styles.grid}>
            <Section
              className={styles.displayCard}
              icon={<ShopOutlined />}
              title={t('form.display.title')}
            >
              <TextField
                control={control}
                name="displayName"
                label={t('form.display.displayName.label')}
                required
                placeholder={t('form.display.displayName.placeholder')}
              />
              <TextAreaField
                control={control}
                name="bio"
                label={t('form.display.bio.label')}
                placeholder={t('form.display.bio.placeholder')}
                maxLength={2000}
              />
              <div className={styles.imageRow}>
                <ImageUploadField
                  control={control}
                  name="logoUrl"
                  label={t('form.display.logo.label')}
                  help={t('form.display.logo.hint')}
                  presign={presignShopMedia}
                />
                <ImageUploadField
                  control={control}
                  name="coverUrl"
                  label={t('form.display.cover.label')}
                  help={t('form.display.cover.hint')}
                  presign={presignShopMedia}
                />
              </div>
            </Section>

            <Section
              className={styles.ownerCard}
              icon={<UserOutlined />}
              title={t('form.owner.title')}
            >
              <TextField
                control={control}
                name="ownerFullName"
                label={t('form.owner.fullName.label')}
                required
                autoComplete="name"
                placeholder={t('form.owner.fullName.placeholder')}
              />
              <TextField
                control={control}
                name="ownerPhone"
                label={t('form.owner.phone.label')}
                type="tel"
                required
                autoComplete="tel"
                prefix={<PhoneOutlined className={styles.inputIcon} />}
                placeholder={t('form.owner.phone.placeholder')}
              />
              <TextField
                control={control}
                name="ownerEmail"
                label={t('form.owner.email.label')}
                type="email"
                autoComplete="email"
                prefix={<MailOutlined className={styles.inputIcon} />}
                placeholder={t('form.owner.email.placeholder')}
              />

              <p className={styles.privacy}>
                <SafetyOutlined className={styles.privacyIcon} aria-hidden="true" />
                <span>
                  <span className={styles.privacyTitle}>{t('form.owner.privacy.title')}</span>
                  <span className={styles.privacyBody}>{t('form.owner.privacy.body')}</span>
                </span>
              </p>
            </Section>

            <Section
              className={styles.addressCard}
              icon={<EnvironmentOutlined />}
              title={t('form.address.title')}
            >
              <div className={styles.pairRow}>
                <TextField
                  control={control}
                  name="address"
                  label={t('form.address.address.label')}
                  placeholder={t('form.address.address.placeholder')}
                />
                <SelectField
                  control={control}
                  name="provinceCode"
                  label={t('form.address.province.label')}
                  required
                  showSearch
                  options={provinces.options}
                  loading={provinces.isLoading}
                  disabled={readOnly || provinces.isLoading || provinces.isError}
                  placeholder={
                    provinces.isLoading
                      ? t('form.address.province.loading')
                      : t('form.address.province.placeholder')
                  }
                  help={
                    <>
                      {t('form.address.province.help')}{' '}
                      <Link href={ROUTES.MANAGE.SHOP_BRANCHES} className={styles.helpLink}>
                        {t('form.address.province.branchLink')}
                      </Link>
                    </>
                  }
                />
              </div>
              <div className={styles.pairRow}>
                <TextField
                  control={control}
                  name="taxCode"
                  label={t('form.address.taxCode.label')}
                  placeholder={t('form.address.taxCode.placeholder')}
                />
                <TextField
                  control={control}
                  name="businessLicenseNo"
                  label={t('form.address.businessLicenseNo.label')}
                  placeholder={t('form.address.businessLicenseNo.placeholder')}
                />
              </div>
            </Section>

            <Section
              className={styles.bankCard}
              icon={<BankOutlined />}
              title={t('form.bank.title')}
              hint={t('form.bank.hint')}
            >
              <div className={styles.pairRow}>
                <TextField
                  control={control}
                  name="bankName"
                  label={t('form.bank.bankName.label')}
                  placeholder={t('form.bank.bankName.placeholder')}
                />
                <TextField
                  control={control}
                  name="bankAccountNo"
                  label={t('form.bank.accountNo.label')}
                  placeholder={t('form.bank.accountNo.placeholder')}
                />
              </div>
              <TextField
                control={control}
                name="bankAccountName"
                label={t('form.bank.accountName.label')}
                placeholder={t('form.bank.accountName.placeholder')}
              />
            </Section>
          </div>
        </fieldset>

      </form>
    </Form>
  );
}

function Section({
  className,
  icon,
  title,
  hint,
  children,
}: {
  className?: string;
  icon: ReactNode;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx(styles.card, className)}>
      <header className={styles.cardHeader}>
        <span className={styles.cardIcon} aria-hidden="true">
          {icon}
        </span>
        <h2 className={styles.cardTitle}>{title}</h2>
      </header>
      {hint ? <p className={styles.cardHint}>{hint}</p> : null}
      {children}
    </section>
  );
}
