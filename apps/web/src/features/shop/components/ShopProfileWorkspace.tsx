'use client';

import { EnvironmentOutlined, ExportOutlined, SaveOutlined, ShopOutlined } from '@ant-design/icons';
import { Alert, Button, Form } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { TENANT_STATUS, TENANT_STATUS_META, type TenantStatus } from '@xeprime/types';

import { StatusTag } from '@/components/data-display/StatusTag';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { shopPath } from '@/constants/routes';
import { cx } from '@/lib/cx';

import { toShopProfileBody, useShopProfileForm } from '../shop-profile-form';
import type { MyShop, UpdateProfileInput } from '../types';
import { ShopDisplayFields } from './ShopDisplayFields';
import { ShopLegalFields } from './ShopLegalFields';
import { ShopProfileChecklist } from './ShopProfileChecklist';
import { ShopStatusBanner } from './ShopStatusBanner';
import styles from './ShopProfileWorkspace.module.css';

interface ShopProfileWorkspaceProps {
  shop: MyShop;
  /** Quyền `tenant.update`. Thiếu quyền thì chỉ-xem, xem `readOnly`. */
  canEdit: boolean;
  /** Đang lưu: khoá luôn ô nhập, để không ai sửa tiếp thứ vừa gửi đi và tưởng là đã lưu. */
  saving: boolean;
  errorMessage?: string | null;
  onSave: (body: UpdateProfileInput) => void;
}

/**
 * Hồ sơ gian hàng dạng MỘT MÀN — dùng ở tiến trình đăng ký chủ xe (`/account/registration`).
 *
 * Cổng quản lý KHÔNG dùng component này nữa: `/manage/shop` là trang Cửa hàng năm section
 * (`ShopWorkspace`), nơi hồ sơ chỉ là hai trong năm phần. Ở khu tài khoản thì ngược lại — chủ xe
 * tuyến hoa hồng chưa có gì ngoài hồ sơ để khai, và một mục lục năm dòng cho hai khối là thừa.
 *
 * Hai màn DÙNG CHUNG `useShopProfileForm`, `ShopDisplayFields` và `ShopLegalFields`: schema, giá
 * trị khởi tạo và thân request là một. Chỉ bố cục khác nhau, và đó là lý do chúng là hai
 * component chứ không phải một cái mang cờ `variant`.
 *
 * KHÔNG còn ô "chủ gian hàng" và ô ngân hàng (16/09/2026): chủ gian hàng đọc từ tài khoản
 * (`MyShopDto.ownerAccount`), tài khoản nhận tiền sống ở `bank_accounts`. Xem migration
 * `20260916170000_single_source_owner_and_payout`.
 */
export function ShopProfileWorkspace({
  shop,
  canEdit,
  saving,
  errorMessage,
  onSave,
}: ShopProfileWorkspaceProps) {
  const t = useTranslations('Shop');
  const tSections = useTranslations('Shop.sections');

  const { control, handleSubmit, reset, formState } = useShopProfileForm(shop);

  const status = shop.status as TenantStatus;
  /*
   * Chỉ-xem CHỈ vì thiếu quyền. Tới 24/09/2026 hồ sơ còn bị khoá suốt lúc chờ XÁC MINH; nền tảng
   * đã tạm ngừng xác minh gian hàng, nên một phiếu chờ không còn ai xử lý và cái khoá đó thành
   * vĩnh viễn — backend cũng đã gỡ nó (`TenantsService.updateProfile`).
   */
  const readOnly = !canEdit;
  const readOnlyReason = canEdit ? null : t('form.readOnly');

  /**
   * `isDirty` quyết định CẢ HAI nút, và đây là toàn bộ lý do chúng tồn tại:
   *
   * - Chưa sửa gì thì không có gì để lưu → nút Lưu mờ đi. Một nút Lưu lúc nào cũng sáng dạy người
   *   dùng rằng bấm nó là vô hại, và biến "tôi có thay đổi gì chưa nhỉ" thành câu không trả lời được.
   * - Chưa sửa gì thì cũng chẳng có gì để huỷ → nút Huỷ bỏ KHÔNG hiện. Một nút huỷ luôn đứng đó
   *   gợi ý rằng có thứ gì đó đang dở dang.
   */
  const dirty = formState.isDirty && !readOnly;

  const submit = handleSubmit((v) => onSave(toShopProfileBody(v)));

  return (
    <>
      <Form
        component={false}
        layout="vertical"
        size="large"
        colon={false}
        requiredMark={trailingRequiredMark}
      >
        <form onSubmit={submit} noValidate className={styles.form}>
          {/*
            Thanh tiêu đề DÍNH, vì nút Lưu sống trong đó: form này cao hơn một màn hình, nút lưu
            đặt ở cuối là nút mà người dùng phải đi tìm. `top`/`z-index` xử lý ở CSS để nó xếp
            dưới topbar của vỏ quản lý chứ không đè lên.
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
                    <Link
                      href={shopPath.detail(shop.slug)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
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

          <ShopStatusBanner shop={shop} />

          {/*
            Checklist chỉ hiện khi người xem SỬA được hồ sơ — bảng "còn thiếu gì" không có nghĩa
            với người chỉ xem. Không còn gắn với trạng thái xác minh: web đã bỏ luồng đó.
          */}
          {!readOnly ? (
            <ShopProfileChecklist control={control} ownerAccount={shop.ownerAccount} />
          ) : null}

          {errorMessage ? (
            <Alert type="error" showIcon title={errorMessage} className={styles.alert} />
          ) : null}
          {readOnlyReason ? (
            <Alert type="info" showIcon className={styles.alert} title={readOnlyReason} />
          ) : null}
          {/*
            `fieldset[disabled]` khoá mọi ô nhập/nút NATIVE bên trong bằng chính cơ chế của trình
            duyệt. Các ô CHỌN (tỉnh/thành, xã/phường trong `AddressField`) vẫn phải nhận `disabled`
            tường minh: chúng là combobox dựng bằng div, fieldset không với tới được và dropdown
            vẫn mở ra như thường.
          */}
          <fieldset disabled={readOnly || saving} className={styles.fieldset}>
            <div className={styles.grid}>
              <Section
                className={styles.displayCard}
                icon={<ShopOutlined />}
                title={tSections('profile')}
              >
                <ShopDisplayFields control={control} />
              </Section>

              <Section
                className={styles.addressCard}
                icon={<EnvironmentOutlined />}
                title={tSections('legal')}
              >
                <ShopLegalFields control={control} readOnly={readOnly} />
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
