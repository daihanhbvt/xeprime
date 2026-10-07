'use client';

import { ExportOutlined, SaveOutlined } from '@ant-design/icons';
import { Alert, Avatar, Button, Form } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  isPackageShopTrack,
  PERMISSION,
  TENANT_STATUS,
  TENANT_STATUS_META,
  type TenantStatus,
} from '@xeprime/types';

import { StatusTag } from '@/components/data-display/StatusTag';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { SectionCard } from '@/components/layout/SectionCard';
import { SectionNav, type SectionNavItem } from '@/components/layout/SectionNav';
import { SellerTaxSection } from '@/features/seller-profile/components/SellerTaxSection';
import { SubscriptionWorkspace } from '@/features/subscription/components/SubscriptionWorkspace';
import { shopPath, shopSectionDomId, SHOP_SECTION, type ShopSection } from '@/constants/routes';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { usePermissions } from '@/hooks/use-permissions';
import { useScrollToSection } from '@/hooks/use-scroll-to-section';
import { initialOf } from '@/lib/initials';

import { toShopProfileBody, useShopProfileForm } from '../shop-profile-form';
import type { MyShop, UpdateProfileInput } from '../types';
import { ShopDisplayFields } from './ShopDisplayFields';
import { ShopLegalFields } from './ShopLegalFields';
import { ShopOwnerSection } from './ShopOwnerSection';
import { ShopProfileChecklist } from './ShopProfileChecklist';
import { ShopStatusBanner } from './ShopStatusBanner';
import { ShopWelcomeBanner } from './ShopWelcomeBanner';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import styles from './ShopWorkspace.module.css';

/** `id` của thẻ `<form>` — nút Lưu sống ở tiêu đề, NGOÀI form, nên nó submit bằng thuộc tính `form`. */
const PROFILE_FORM_ID = 'shop-profile-form';

export interface ShopWorkspaceProps {
  shop: MyShop;
  /** Quyền `tenant.update`. Thiếu quyền thì chỉ-xem. */
  canEdit: boolean;
  saving: boolean;
  errorMessage?: string | null;
  /** Section đang mở, đọc từ `?section=` (đã phân giải, không bao giờ là giá trị lạ). */
  section: ShopSection;
  /**
   * `?section=` CÓ MẶT trong URL hay đây chỉ là giá trị mặc định.
   *
   * Khác nhau ở một việc: có mặt ⇒ cuộn tới section đó ngay lần vẽ đầu. Đó là đường mà các
   * redirect cũ đi vào (`/manage/subscription` → `?section=plan`) và cũng là đường một link chia
   * sẻ đi vào. Mặc định thì KHÔNG cuộn — người mở `/manage/shop` trần phải thấy đầu trang, chứ
   * không phải một cú nhảy ngay khi trang vừa hiện.
   */
  sectionInUrl: boolean;
  /**
   * Gian hàng VỪA thanh toán gói xong — `?welcome=1` và đúng là gian hàng tuyến gói (ADR 0040).
   *
   * Route đã kiểm cả hai vế: nó không bao giờ `true` cho một chủ xe tuyến hoa hồng nhận được
   * link `?welcome=1` của người khác.
   */
  welcome?: boolean;
  /** Gian hàng đã có xe nào chưa — chỉ dùng cho dải chào mừng; route chỉ hỏi khi `welcome`. */
  hasVehicle?: boolean;
  onSectionChange: (section: ShopSection) => void;
  onSave: (body: UpdateProfileInput) => void;
}

/**
 * TRANG CỬA HÀNG — một trang nhiều section (16/09/2026; sắp lại 07/10/2026).
 *
 * ## Vì sao gộp
 *
 * Bốn mục sidebar cũ — "Cửa hàng", "Gói & hoá đơn", "Tài khoản & bảo mật", "Hồ sơ người bán" —
 * ba mục trả lời cùng một câu hỏi ("gian hàng của tôi khai gì, trả tiền thế nào"), và mục thứ tư
 * thì nói về một con người chứ không phải gian hàng. Nay: ba câu hỏi đầu vào MỘT trang có mục
 * lục; câu hỏi thứ tư sang `/manage/security`.
 *
 * 07/10/2026: "Tài khoản nhận tiền" rời trang này về "Số dư & rút tiền" (rút tiền và nơi tiền về là
 * một việc), và "Thông tin khai thuế" vào thay — hồ sơ NGƯỜI BÁN, nguồn duy nhất của mã số thuế mà
 * hợp đồng và báo cáo thuế đọc (ô MST cũ ở "Địa chỉ & pháp lý" ghi vào một bản sao không ai tính
 * thuế từ đó). Trang này và "Hồ sơ chủ xe" nay cùng một vai và cùng thứ tự: danh tính trên chợ ·
 * địa chỉ & pháp lý · khai thuế · gói.
 *
 * ## Các section dựng CÙNG LÚC, `?section=` chỉ cuộn và làm sáng
 *
 * Không phải tab. Nếu mỗi lần chọn là tháo khối cũ ra thì người đang gõ dở hồ sơ mà bấm sang
 * "Gói & hạn mức" để xem hạn sẽ mất sạch thay đổi chưa lưu. `?section=` sống ở URL để reload,
 * Back/Forward và link gửi cho nhau đều rơi đúng chỗ (ADR 0004).
 *
 * ## Một `<form>`, một `<fieldset>` hẹp
 *
 * Thẻ `<form>` của hồ sơ bọc BA section đầu (hiển thị · chủ gian hàng · địa chỉ & pháp lý), và
 * `<fieldset disabled>` chỉ bọc hai nhóm ô THUỘC hồ sơ. "Thông tin khai thuế" có `<form>` RIÊNG
 * (lưu vào hồ sơ người bán, nút lưu riêng) nên đứng NGOÀI — một `<form>` lồng trong `<form>` là
 * HTML hỏng. "Gói & hạn mức" cũng đứng ngoài: form thật của nó (mua gói) sống trong Modal.
 *
 * ## Nút Lưu ở tiêu đề
 *
 * Vì nó chỉ có nghĩa khi biết form CÓ THAY ĐỔI HAY CHƯA, và `isDirty` thì thuộc về form. Nút nằm
 * ngoài `<form>` trong DOM nên nó submit bằng `form={PROFILE_FORM_ID}` — cách chuẩn của HTML,
 * không phải một `onClick` gọi lén `handleSubmit`.
 */
export function ShopWorkspace({
  shop,
  canEdit,
  saving,
  errorMessage,
  section,
  sectionInUrl,
  welcome = false,
  hasVehicle = false,
  onSectionChange,
  onSave,
}: ShopWorkspaceProps) {
  const t = useTranslations('Shop');
  const tSections = useTranslations('Shop.sections');
  const { has } = usePermissions();

  const { control, handleSubmit, reset, formState } = useShopProfileForm(shop);

  const status = shop.status as TenantStatus;
  /*
   * Chỉ-xem CHỈ vì thiếu quyền. Tới 24/09/2026 hồ sơ còn bị khoá suốt lúc chờ XÁC MINH; nền tảng
   * đã tạm ngừng xác minh gian hàng, nên một phiếu chờ không còn ai xử lý và cái khoá đó thành
   * vĩnh viễn — backend cũng đã gỡ nó (`TenantsService.updateProfile`).
   */
  const readOnly = !canEdit;
  // Phiên hỗ trợ gian hàng (ADR 0050 §12): hồ sơ chỉ đọc — không nút Lưu, không lời giải thích quyền.
  const hidesDenied = useSupportHides(SUPPORT_HIDDEN_AREA.DENIED_ACTIONS);
  const readOnlyReason = canEdit || hidesDenied ? null : t('form.readOnly');

  /**
   * `isDirty` quyết định CẢ HAI nút: chưa sửa gì thì không có gì để lưu (nút mờ) và không có gì
   * để huỷ (nút KHÔNG hiện). Một nút Lưu lúc nào cũng sáng dạy người dùng rằng bấm nó là vô hại,
   * và một nút Huỷ luôn đứng đó gợi ý rằng có thứ gì đang dở dang.
   */
  const dirty = formState.isDirty && !readOnly;

  /*
   * Các trục quyết định section nào có mặt, và mỗi trục KHỚP với guard của API:
   *  - "Thông tin khai thuế" → `seller_profile.view` (`GET /seller-profile`); sửa cần
   *    `seller_profile.manage` và `SellerTaxSection` tự chuyển chỉ-xem khi thiếu. Vắng trong phiên
   *    hỗ trợ (ADR 0050 §10): endpoint đó không mở cho phiên, và giấy tờ pháp lý không hiện ở đó.
   *  - "Gói & hạn mức" → `subscription.view`. Mua/gia hạn cần `subscription.purchase`, và
   *    `SubscriptionWorkspace` tự giấu CTA lẫn modal khi thiếu.
   *  - Ba section còn lại đi cùng `tenant.view`, thứ mà trang này đã đòi để vào.
   */
  const { tenant } = useTenantScope();
  const supportHidesLegal = useSupportHides(SUPPORT_HIDDEN_AREA.SHOP_LEGAL);
  const canSeeTax = has(PERMISSION.SELLER_PROFILE_VIEW) && !supportHidesLegal;
  const canSeePlan = has(PERMISSION.SUBSCRIPTION_VIEW);
  const tTax = useTranslations('Account.tax');

  const items: SectionNavItem<ShopSection>[] = [
    { key: SHOP_SECTION.PROFILE, label: tSections('profile') },
    { key: SHOP_SECTION.OWNER, label: tSections('owner') },
    { key: SHOP_SECTION.LEGAL, label: tSections('legal') },
    ...(canSeeTax ? [{ key: SHOP_SECTION.TAX, label: tTax('title') }] : []),
    ...(canSeePlan ? [{ key: SHOP_SECTION.PLAN, label: tSections('plan') }] : []),
  ];

  useScrollToSection(shopSectionDomId(section), sectionInUrl);

  const submit = handleSubmit((v) => onSave(toShopProfileBody(v)));

  return (
    <>
      <header className={styles.header}>
        <div className={styles.identity}>
          {/*
            LOGO gian hàng — hình đại diện DUY NHẤT của trang. Không có avatar cá nhân nào đứng
            cạnh nó: trong cổng quản lý, danh tính nổi bật là của gian hàng.
          */}
          <Avatar
            className={styles.logo}
            size={52}
            shape="square"
            src={shop.profile.logoUrl ?? undefined}
          >
            {initialOf(shop.name)}
          </Avatar>
          <div className={styles.headText}>
            <h1 className={styles.shopName}>
              {shop.name}
              <StatusTag value={status} meta={TENANT_STATUS_META} group="tenantStatus" />
            </h1>
            <p className={styles.subtitle}>{t('page.subtitle')}</p>
          </div>
        </div>

        <div className={styles.actions}>
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

          {readOnly && hidesDenied ? null : (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              htmlType="submit"
              form={PROFILE_FORM_ID}
              loading={saving}
              disabled={!dirty}
            >
              {t('form.submit')}
            </Button>
          )}
        </div>
      </header>

      {/*
        Dải CHÀO MỪNG đứng TRƯỚC dải trạng thái, và đó là thứ tự đúng đúng một lần trong đời gian
        hàng: người vừa trả tiền cần biết việc còn lại của mình trước khi đọc bất cứ tin gì khác.
        Nó tự im lặng khi không còn gì để nói (xem `ShopWelcomeBanner`).
      */}
      {welcome ? (
        <ShopWelcomeBanner missingLogo={!shop.profile.logoUrl} hasVehicle={hasVehicle} />
      ) : null}

      <ShopStatusBanner shop={shop} />

      {errorMessage ? (
        <Alert type="error" showIcon title={errorMessage} className={styles.alert} />
      ) : null}
      {readOnlyReason ? (
        <Alert type="info" showIcon className={styles.alert} title={readOnlyReason} />
      ) : null}

      <div className={styles.layout}>
        <SectionNav
          items={items}
          active={section}
          onSelect={onSectionChange}
          domIdOf={shopSectionDomId}
          title={tSections('navTitle')}
          ariaLabel={tSections('navLabel')}
        />

        <div className={styles.content}>
          <Form
            component={false}
            layout="vertical"
            size="large"
            colon={false}
            requiredMark={trailingRequiredMark}
          >
            <div className={styles.sections}>
              <form id={PROFILE_FORM_ID} onSubmit={submit} noValidate className={styles.form}>
                {/*
                `fieldset[disabled]` khoá mọi ô nhập/nút NATIVE bên trong bằng chính cơ chế của
                trình duyệt. Các ô CHỌN (tỉnh/thành, xã/phường) vẫn phải nhận `disabled` tường
                minh: chúng là combobox dựng bằng div, fieldset không với tới được.

                Nó chỉ bọc HAI nhóm ô của hồ sơ. Khối chủ gian hàng nằm ngoài — nó chỉ đọc, và có
                luật quyền riêng.
              */}
                <fieldset disabled={readOnly || saving} className={styles.fieldset}>
                  <SectionCard
                    id={shopSectionDomId(SHOP_SECTION.PROFILE)}
                    title={tSections('profile')}
                    hint={tSections('profileHint')}
                  >
                    <ShopDisplayFields control={control} readOnly={readOnly && hidesDenied} />
                  </SectionCard>
                </fieldset>

                <ShopOwnerSection shop={shop} />

                <fieldset disabled={readOnly || saving} className={styles.fieldset}>
                  <SectionCard
                    id={shopSectionDomId(SHOP_SECTION.LEGAL)}
                    title={tSections('legal')}
                    hint={tSections('legalHint')}
                  >
                    {/*
                    Checklist đứng trong section pháp lý vì đây là nơi còn ô để điền. Chỉ hiện khi
                    người xem SỬA được hồ sơ — bảng "còn thiếu gì" không có nghĩa với người chỉ xem.
                    Không còn gắn với trạng thái xác minh: web đã bỏ luồng đó (24/09/2026).
                  */}
                    {!readOnly ? (
                      <ShopProfileChecklist
                        control={control}
                        ownerAccount={shop.ownerAccount}
                        /*
                         * Gian hàng tuyến gói: LOGO là mục chặn, không phải gợi ý — thiếu nó là
                         * `submitForPublicReview` từ chối thật (ADR 0040 điều 7). Chủ xe tuyến hoa
                         * hồng không bị cổng đó chạm tới, nên với họ nó vẫn là gợi ý.
                         */
                        logoRequired={isPackageShopTrack(tenant)}
                      />
                    ) : null}
                    <ShopLegalFields control={control} readOnly={readOnly} />
                  </SectionCard>
                </fieldset>
              </form>

              {/* <form> riêng, lưu vào hồ sơ người bán — đứng NGOÀI form hồ sơ ở trên. */}
              {canSeeTax ? <SellerTaxSection id={shopSectionDomId(SHOP_SECTION.TAX)} /> : null}

              {canSeePlan ? (
                <SectionCard id={shopSectionDomId(SHOP_SECTION.PLAN)} title={tSections('plan')}>
                  <SubscriptionWorkspace />
                </SectionCard>
              ) : null}
            </div>
          </Form>
        </div>
      </div>
    </>
  );
}
