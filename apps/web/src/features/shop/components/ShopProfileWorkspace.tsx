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
import { Alert, App, Button, Form, Modal } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import {
  canSubmitShopVerification,
  SHOP_VERIFICATION,
  TENANT_STATUS,
  TENANT_STATUS_META,
  toLocalVnPhone,
  type ShopVerification,
  type TenantStatus,
} from '@xeprime/types';
import { guessAddressLine } from '@xeprime/domain';
import { shopProfileSchema, type ShopProfileValues } from '@xeprime/validators';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ImageUploadField } from '@/components/form/ImageUploadField';
import { AddressField } from '@/components/form/AddressField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { shopPath } from '@/constants/routes';
import { useWorkspace } from '@/hooks/use-workspace';
import { cx } from '@/lib/cx';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { presignShopMedia } from '@/services/upload';
import type { MyShop, UpdateProfileInput } from '../types';
import { ShopProfileChecklist } from './ShopProfileChecklist';
import { ShopStatusBanner } from './ShopStatusBanner';
import styles from './ShopProfileWorkspace.module.css';

interface ShopProfileWorkspaceProps {
  shop: MyShop;
  /** Quyền `tenant.update`. Thiếu quyền và "đang chờ duyệt" đều dẫn tới chỉ-xem, xem `readOnly`. */
  canEdit: boolean;
  /** Quyền `tenant.submit_review` — đổi TRẠNG THÁI hồ sơ, không phải "lưu". */
  canSubmit: boolean;
  /** Đang gửi: khoá luôn ô nhập, để không ai sửa tiếp thứ vừa gửi đi và tưởng là đã lưu. */
  saving: boolean;
  /** Đang gửi duyệt (gồm cả bước lưu nốt thay đổi còn dở trước khi gửi). */
  submitting: boolean;
  errorMessage?: string | null;
  onSave: (body: UpdateProfileInput) => void;
  /**
   * Gửi duyệt.
   *
   * `pendingChanges` khác `null` nghĩa là form còn thay đổi CHƯA LƯU: trang phải lưu trước rồi
   * mới gửi. Hồ sơ đi duyệt là bản ĐÃ LƯU (backend snapshot từ DB), nên gửi thẳng sẽ đưa cho
   * người duyệt đúng bản cũ mà người gửi vừa sửa xong và tưởng đã gửi đi.
   */
  onSubmitReview: (pendingChanges: UpdateProfileInput | null) => void;
}

/** Tên bảy trường địa chỉ trong `shopProfileSchema` — hằng số ngoài component, định danh ổn định. */
const ADDRESS_FIELD_NAMES = {
  provinceCode: 'provinceCode',
  wardCode: 'wardCode',
  addressLine: 'addressLine',
} as const;

/** Bốn trường GHIM — tách riêng vì không phải form nào cũng lưu toạ độ (xem `AddressPinNames`). */
const ADDRESS_PIN_NAMES = {
  placeId: 'placeId',
  latitude: 'latitude',
  longitude: 'longitude',
  locationSource: 'locationSource',
} as const;

/** Giá trị form → thân request. Dùng cho CẢ hai đường ra: lưu, và lưu-rồi-gửi-duyệt. */
function toBody(v: ShopProfileValues): UpdateProfileInput {
  return {
    displayName: v.displayName,
    bio: v.bio,
    // Chỉ gửi MÃ + phần chi tiết — tên tỉnh/xã và chuỗi hiển thị do server ghép. Backend
    // chuyển tiếp cả cụm cho chi nhánh mặc định (writer duy nhất của địa chỉ vận hành).
    provinceCode: v.provinceCode,
    wardCode: v.wardCode,
    addressLine: v.addressLine,
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
  };
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
    provinceCode: shop.defaultBranch?.provinceCode ?? p.provinceCode ?? '',
    wardCode: shop.defaultBranch?.wardCode ?? p.wardCode ?? '',
    /*
     * Hồ sơ CŨ chưa có phần "số nhà, đường" tách riêng: đoán từ chuỗi hiển thị bằng cách cắt
     * các cụm trông như đơn vị hành chính. Chỉ là GỢI Ý — chủ shop nhìn và sửa trước khi lưu.
     */
    addressLine: guessAddressLine(shop.defaultBranch?.address ?? p.address),
    placeId: null,
    latitude: null,
    longitude: null,
    locationSource: null,
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
  canSubmit,
  saving,
  submitting,
  errorMessage,
  onSave,
  onSubmitReview,
}: ShopProfileWorkspaceProps) {
  const t = useTranslations('Shop');
  const { paths, isManage } = useWorkspace();
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const resolver = useValidationResolver<ShopProfileValues>(shopProfileSchema, 'Shop.validation');
  // `values` (không phải `defaultValues`): sau khi lưu, query trả hồ sơ mới và form phải theo —
  // nếu không, "Huỷ bỏ" mời người dùng hoàn tác thứ đã lưu xong rồi.
  const { control, handleSubmit, reset, formState, getValues } =
    useForm<ShopProfileValues>({
      resolver,
      values: toValues(shop),
    });

  const status = shop.status as TenantStatus;
  /*
   * Backend cũng từ chối ghi khi đang chờ XÁC MINH (`SHOP_VERIFICATION_PENDING`). Khoá ở đây để
   * người dùng biết TRƯỚC khi gõ, chứ không phải sau khi bấm Lưu.
   *
   * Điều kiện đọc từ trục xác minh, không từ `tenants.status`: từ ADR 0036 cột đó không còn mang
   * nghĩa "đang chờ duyệt", nên hỏi nó là hỏi nhầm chỗ và ô nhập sẽ mở ra đúng lúc phải khoá.
   */
  const pendingReview = shop.verification === SHOP_VERIFICATION.PENDING;
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

  /** Hồ sơ ở chặng "chưa gửi / bị trả về" — chỉ khi đó checklist và nút Gửi xác minh mới có nghĩa. */
  const submittable = canSubmitShopVerification(shop.verification as ShopVerification);

  const submit = handleSubmit((v) => onSave(toBody(v)));

  /**
   * Bấm "Gửi duyệt" chạy VALIDATE TRƯỚC, rồi mới hỏi xác nhận.
   *
   * Trước đây nút này bỏ qua form hoàn toàn: nó sáng ngay cả khi họ tên và SĐT chủ gian hàng còn
   * trống, và người duyệt nhận một hồ sơ không liên hệ được với ai. Thứ tự ở đây là có chủ ý —
   * hỏi "gửi nhé?" rồi mới báo "thiếu 2 mục" là bắt người dùng đi qua một hộp thoại vô ích.
   *
   * Hồ sơ thiếu thì `shouldFocusError` của RHF đã tự đưa con trỏ tới ô sai ĐẦU TIÊN; câu thông
   * báo lo phần còn lại, vì ô đang sáng chỉ là một trong số chúng.
   */
  const openSubmitConfirm = handleSubmit(
    () => setConfirmOpen(true),
    (errors) => {
      message.warning(t('status.incomplete', { count: Object.keys(errors).length }));
    },
  );

  const confirmSubmitReview = () => {
    setConfirmOpen(false);
    onSubmitReview(dirty ? toBody(getValues()) : null);
  };

  return (
    <>
      {/* Hộp xác nhận nằm NGOÀI `<form>`: nút OK của nó là hành động riêng, không phải submit form. */}
      <Modal
        open={confirmOpen}
        title={t('status.submitConfirm.title')}
        okText={t('status.submitConfirm.ok')}
        cancelText={tCommon('actions.cancel')}
        confirmLoading={submitting}
        onCancel={() => setConfirmOpen(false)}
        onOk={confirmSubmitReview}
      >
        <p>
          {dirty
            ? t('status.submitConfirm.descriptionWithSave')
            : t('status.submitConfirm.description')}
        </p>
      </Modal>

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

        <ShopStatusBanner
          shop={shop}
          canSubmit={canSubmit}
          submitting={submitting}
          onSubmit={openSubmitConfirm}
        />

        {/*
          Checklist chỉ ở chặng chưa gửi / bị trả về. Hồ sơ đang chờ duyệt hay đã hoạt động thì
          nó không còn nói gì mới — người dùng đâu sửa được nữa.
        */}
        {submittable ? <ShopProfileChecklist control={control} /> : null}

        {errorMessage ? (
          <Alert type="error" showIcon title={errorMessage} className={styles.alert} />
        ) : null}
        {readOnlyReason ? (
          <Alert type="info" showIcon className={styles.alert} title={readOnlyReason} />
        ) : null}
        {/*
          `fieldset[disabled]` khoá mọi ô nhập/nút NATIVE bên trong bằng chính cơ chế của trình
          duyệt. Các ô CHỌN (tỉnh/thành, xã/phường trong `AddressField`) vẫn phải nhận `disabled`
          tường minh: chúng là combobox dựng bằng div, fieldset không với tới được và dropdown vẫn
          mở ra như thường.
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
              {/*
                Đổi địa chỉ ở đây là đổi địa chỉ của CHI NHÁNH MẶC ĐỊNH — tức là dời vị trí công
                khai của mọi xe thuộc chi nhánh đó trên marketplace.
              */}
              <AddressField
                control={control}
                names={ADDRESS_FIELD_NAMES}
                pin={ADDRESS_PIN_NAMES}
                required
                wardRequired={false}
                disabled={readOnly}
                notice={
                  <p className={styles.addressNotice}>
                    {t('form.address.province.help')}
                    {/*
                      Link "quản lý chi nhánh" chỉ có nghĩa ở cổng gian hàng. Chủ xe tuyến hoa
                      hồng chỉ có chi nhánh mặc định — chính cái đang sửa ngay tại ô này — và
                      nhiều chi nhánh là tính năng của gói (ADR 0027 điều 1), nên đưa họ tới một
                      màn họ không vào được là hứa suông.
                    */}
                    {isManage ? (
                      <>
                        {' '}
                        <Link href={paths.branches} className={styles.helpLink}>
                          {t('form.address.province.branchLink')}
                        </Link>
                      </>
                    ) : null}
                  </p>
                }
              />
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
    </>
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
