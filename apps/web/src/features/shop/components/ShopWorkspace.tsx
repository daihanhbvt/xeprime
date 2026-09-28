'use client';

import { ExportOutlined, SaveOutlined } from '@ant-design/icons';
import { Alert, Avatar, Button, Form } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import {
  isPackageShopTrack,
  PERMISSION,
  TENANT_ROLE,
  TENANT_STATUS,
  TENANT_STATUS_META,
  type TenantStatus,
} from '@xeprime/types';

import { StatusTag } from '@/components/data-display/StatusTag';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { BankAccountList } from '@/features/bank-accounts/components/BankAccountList';
import { SubscriptionWorkspace } from '@/features/subscription/components/SubscriptionWorkspace';
import { shopPath, shopSectionDomId, SHOP_SECTION, type ShopSection } from '@/constants/routes';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { usePermissions } from '@/hooks/use-permissions';
import { initialOf } from '@/lib/initials';

import { toShopProfileBody, useShopProfileForm } from '../shop-profile-form';
import type { MyShop, UpdateProfileInput } from '../types';
import { ShopDisplayFields } from './ShopDisplayFields';
import { ShopLegalFields } from './ShopLegalFields';
import { ShopOwnerSection } from './ShopOwnerSection';
import { ShopProfileChecklist } from './ShopProfileChecklist';
import { ShopSectionCard } from './ShopSectionCard';
import { ShopSectionNav, type ShopSectionItem } from './ShopSectionNav';
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
   * Khác nhau ở một việc: có mặt ⇒ cuộn tới section đó ngay lần vẽ đầu. Đó là đường mà ba
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
 * TRANG CỬA HÀNG — một trang, năm section (16/09/2026).
 *
 * ## Vì sao gộp
 *
 * Bốn mục sidebar cũ — "Cửa hàng", "Gói & hoá đơn", "Tài khoản & bảo mật", "Hồ sơ người bán" —
 * ba mục trả lời cùng một câu hỏi ("gian hàng của tôi khai gì, trả tiền thế nào"), và mục thứ tư
 * thì nói về một con người chứ không phải gian hàng. Nay: ba câu hỏi đầu vào MỘT trang có mục
 * lục; câu hỏi thứ tư sang `/manage/security`.
 *
 * ## Năm section dựng CÙNG LÚC, `?section=` chỉ cuộn và làm sáng
 *
 * Không phải tab. Nếu mỗi lần chọn là tháo khối cũ ra thì người đang gõ dở hồ sơ mà bấm sang
 * "Gói & hạn mức" để xem hạn sẽ mất sạch thay đổi chưa lưu. `?section=` sống ở URL để reload,
 * Back/Forward và link gửi cho nhau đều rơi đúng chỗ (ADR 0004).
 *
 * ## Một `<form>`, một `<fieldset>` hẹp
 *
 * Thẻ `<form>` bọc cả năm section, nhưng `<fieldset disabled>` chỉ bọc hai nhóm ô THUỘC hồ sơ.
 * Ba section còn lại có điều khiển riêng: nút của AntD mặc định là `type="button"` nên chúng
 * không submit nhầm, còn hai form thật (thêm tài khoản ngân hàng, mua gói) sống trong Modal —
 * portal ra `body`, nên không có `<form>` nào lồng vào `<form>` nào.
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
   * Ba trục quyết định section nào có mặt, và cả ba KHỚP với guard của API:
   *  - "Tài khoản nhận tiền" → `@ShopOwnerOnly()` ở `/shop/bank-accounts`. Quản lý/nhân viên ăn
   *    403 ngay ở lượt GET, nên hiện một khối rỗng cho họ là mời vào một cánh cửa đã khoá.
   *  - "Gói & hạn mức" → `subscription.view`. Mua/gia hạn cần `subscription.purchase`, và
   *    `SubscriptionWorkspace` tự giấu CTA lẫn modal khi thiếu.
   *  - Ba section còn lại đi cùng `tenant.view`, thứ mà trang này đã đòi để vào.
   */
  const { tenant } = useTenantScope();
  const isOwner = tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;
  const canSeePlan = has(PERMISSION.SUBSCRIPTION_VIEW);

  const items: ShopSectionItem[] = [
    { key: SHOP_SECTION.PROFILE, label: tSections('profile') },
    { key: SHOP_SECTION.OWNER, label: tSections('owner') },
    { key: SHOP_SECTION.LEGAL, label: tSections('legal') },
    ...(isOwner ? [{ key: SHOP_SECTION.PAYOUT, label: tSections('payout') }] : []),
    ...(canSeePlan ? [{ key: SHOP_SECTION.PLAN, label: tSections('plan') }] : []),
  ];

  useScrollToSection(section, sectionInUrl);

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
        <ShopSectionNav items={items} active={section} onSelect={onSectionChange} />

        <div className={styles.content}>
          <Form
            component={false}
            layout="vertical"
            size="large"
            colon={false}
            requiredMark={trailingRequiredMark}
          >
            <form id={PROFILE_FORM_ID} onSubmit={submit} noValidate className={styles.form}>
              {/*
                `fieldset[disabled]` khoá mọi ô nhập/nút NATIVE bên trong bằng chính cơ chế của
                trình duyệt. Các ô CHỌN (tỉnh/thành, xã/phường) vẫn phải nhận `disabled` tường
                minh: chúng là combobox dựng bằng div, fieldset không với tới được.

                Nó chỉ bọc HAI nhóm ô của hồ sơ. Ba section còn lại nằm ngoài — chúng có luật
                quyền riêng, và khoá chúng theo trạng thái duyệt hồ sơ là khoá nhầm thứ.
              */}
              <fieldset disabled={readOnly || saving} className={styles.fieldset}>
                <ShopSectionCard
                  id={shopSectionDomId(SHOP_SECTION.PROFILE)}
                  title={tSections('profile')}
                  hint={tSections('profileHint')}
                >
                  <ShopDisplayFields control={control} readOnly={readOnly && hidesDenied} />
                </ShopSectionCard>
              </fieldset>

              <ShopOwnerSection shop={shop} />

              <fieldset disabled={readOnly || saving} className={styles.fieldset}>
                <ShopSectionCard
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
                </ShopSectionCard>
              </fieldset>

              {isOwner ? (
                <BankAccountList
                  scope="shop"
                  id={shopSectionDomId(SHOP_SECTION.PAYOUT)}
                  className={styles.payoutCard}
                  title={tSections('payout')}
                  subtitle={tSections('payoutHint')}
                />
              ) : null}

              {canSeePlan ? (
                <ShopSectionCard id={shopSectionDomId(SHOP_SECTION.PLAN)} title={tSections('plan')}>
                  <SubscriptionWorkspace header={null} />
                </ShopSectionCard>
              ) : null}
            </form>
          </Form>
        </div>
      </div>
    </>
  );
}

/**
 * Cuộn tới section đang chọn và đưa TIÊU ĐIỂM vào nó.
 *
 * Tiêu điểm là nửa thường bị quên: cuộn không thôi thì người dùng bàn phím vẫn đứng ở cột điều
 * hướng, và phím Tab tiếp theo đưa họ sang mục kế của mục lục chứ không vào nội dung vừa mở.
 *
 * Lần vẽ ĐẦU chỉ cuộn khi `?section=` thật sự có trong URL. Đó là đường của ba redirect cũ và
 * của một link chia sẻ — cả hai đều hứa "mở ra ở đúng phần này". Người vào `/manage/shop` trần thì
 * không: một cú nhảy ngay khi trang vừa hiện là trang tự ý đưa họ đi đâu đó.
 *
 * Kiểu cuộn khác nhau theo lần: lần đầu nhảy thẳng, vì cuộn mượt từ đầu trang xuống cuối là một
 * đoạn hoạt hình dài không ai xin. Đổi section trong lúc đọc thì mượt — để người dùng thấy mình
 * vừa đi từ đâu tới đâu.
 */
function useScrollToSection(section: ShopSection, scrollOnMount: boolean): void {
  const first = useRef(true);

  useEffect(() => {
    const isFirst = first.current;
    first.current = false;
    if (isFirst && !scrollOnMount) return;

    const el = document.getElementById(shopSectionDomId(section));
    if (!el) return;
    el.scrollIntoView({ behavior: isFirst ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
    // `scrollOnMount` cố ý KHÔNG nằm trong deps: nó chỉ có nghĩa ở lần vẽ đầu, và đưa vào đây
    // sẽ khiến effect chạy lại đúng lúc người dùng bấm mục lục lần đầu (query từ vắng thành có).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);
}
