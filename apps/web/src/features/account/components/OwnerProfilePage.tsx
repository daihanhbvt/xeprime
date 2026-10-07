'use client';

import { ExportOutlined } from '@ant-design/icons';
import { Alert, App, Avatar, Button, Form, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  PERMISSION,
  STOREFRONT_KIND,
  TENANT_STATUS,
  storefrontIdentity,
  type TenantStatus,
} from '@xeprime/types';

import { EmptyState } from '@/components/feedback/EmptyState';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { SectionCard } from '@/components/layout/SectionCard';
import { SectionNav, type SectionNavItem } from '@/components/layout/SectionNav';
import {
  ACCOUNT_SECTION,
  accountSectionDomId,
  accountSectionOf,
  shopPath,
  type AccountSection,
} from '@/constants/routes';
import { SellerTaxSection } from '@/features/seller-profile/components/SellerTaxSection';
import { ShopLegalFields } from '@/features/shop/components/ShopLegalFields';
import { ShopProfileChecklist } from '@/features/shop/components/ShopProfileChecklist';
import { ShopStatusBanner } from '@/features/shop/components/ShopStatusBanner';
import { useMyShop, useUpdateShopProfile } from '@/features/shop/hooks/use-shop';
import { toShopProfileBody, useShopProfileForm } from '@/features/shop/shop-profile-form';
import type { MyShop } from '@/features/shop/types';
import { SubscriptionWorkspace } from '@/features/subscription/components/SubscriptionWorkspace';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';
import { useScrollToSection } from '@/hooks/use-scroll-to-section';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useErrorMessage } from '@/i18n/use-error-message';
import { initialOf } from '@/lib/initials';

import { useMyProfile } from '../hooks/use-account';
import type { UserProfile } from '../types';
import { AccountSecuritySections } from './AccountSecuritySections';
import { AccountTrackBadge } from './AccountTrackBadge';
import { OwnerInfoForm } from './OwnerInfoForm';
import styles from './OwnerProfilePage.module.css';

/** `id` của form địa chỉ nhận xe. */
const ADDRESS_FORM_ID = 'owner-address-form';

/**
 * HỒ SƠ CHỦ XE — trang tài khoản của CHỦ xe tuyến hoa hồng ở site partner (06/10/2026).
 *
 * ## Vì sao gộp
 *
 * Trước đợt này chủ xe cá nhân có HAI hồ sơ: "Hồ sơ chủ xe" (`/registration` — thực chất là form
 * gian hàng, chữ toàn "gian hàng", menu nằm dưới nhóm "Gian hàng") và "Tài khoản & bảo mật" (tên,
 * ảnh, đăng nhập). Với một người cho thuê xe của chính mình, "gian hàng" và "con người" là MỘT —
 * mặt tiền công khai của họ là hồ sơ một con người (`STOREFRONT_KIND.PERSONAL`), ảnh của nó là ảnh
 * đại diện của họ (`storefrontAvatar`). Hai trang buộc họ đoán sửa tên ở đâu, ảnh ở đâu.
 *
 * Nay: một trang, bảy section, theo thứ tự người ta cần chúng:
 *
 *   1. Thông tin chủ xe       — ảnh (bắt buộc), họ tên, lời giới thiệu: TOÀN BỘ thứ khách thấy về
 *                                họ, một nút lưu (`OwnerInfoForm`).
 *   2. Địa chỉ nhận xe        — chi nhánh mặc định (`tenants`). Không có ô MST/GPKD: đó là giấy
 *                                tờ của người bán có pháp nhân, không phải của chủ xe cá nhân.
 *   3. Thông tin khai thuế    — loại chủ thể, tên pháp lý, CCCD/MST (`SellerTaxSection`; trước
 *                                07/10/2026 là trang `/tax`).
 *   4. Gói dịch vụ            — gói đang dùng + phễu nâng cấp lên gian hàng (`SubscriptionWorkspace`;
 *                                trước là trang `/subscription`).
 *   5–7. Đăng nhập · Mật khẩu · Xoá tài khoản (`AccountSecuritySections`, chung với tuyến gói).
 *
 * Cùng VAI với trang Cửa hàng của tuyến gói — danh tính trên chợ · địa chỉ & pháp lý · gói — để
 * người nâng gói (hay hết gói) tìm thấy cùng thứ ở cùng chỗ. Tiền (số dư, tài khoản nhận tiền, thuế
 * đã khấu trừ) KHÔNG ở đây: nó ở "Số dư & rút tiền", cũng như ở tuyến gói.
 *
 * ## MỘT danh tính — tên, SĐT, email, ảnh là của TÀI KHOẢN (ADR 0054)
 *
 * Với chủ xe cá nhân, khách thấy đúng tài khoản của họ: họ tên, SĐT đăng nhập ĐÃ XÁC THỰC, email
 * đã xác thực, ảnh đại diện (`storefrontIdentity`, cùng hàm API dùng ở chợ/chuyến/hợp đồng). Trang
 * này vì thế KHÔNG có ô tên/SĐT/email thứ hai — SĐT/email sửa ở "Thông tin đăng nhập".
 *
 * Bộ riêng của gian hàng (`tenants.name/phone/email`, logo, ảnh bìa) vẫn nằm yên trong DB: lên gói
 * là chúng hiện ra ở trang Cửa hàng (`/shop`), hết gói là trang công khai tự đọc lại tài khoản.
 * Không job đồng bộ nào, không có khoảng hở nào giữa lúc đổi tuyến và lúc dữ liệu đổi theo.
 *
 * ## Mỗi khối một nút lưu — cố ý
 *
 * "Thông tin chủ xe" có nút lưu ngay trong khối. Địa chỉ có thanh lưu dính ở đáy khối của nó, chỉ
 * hiện khi có thay đổi — nó nằm trong đúng vùng mà nó lưu, nên không ai bấm nó và tưởng đã lưu họ
 * tên ở khối trên.
 */
export function OwnerProfilePage() {
  const t = useTranslations('Account.ownerHub');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();

  const profile = useMyProfile();
  // `PartnerAccountRoute` chỉ dựng trang này khi có `tenant.view` — query không bao giờ bị tắt.
  const shop = useMyShop(has(PERMISSION.TENANT_VIEW));

  const { filters, setFilters } = useUrlFilters((params) => ({
    section: accountSectionOf(params.get('section')),
    // Dẫn xuất, không bao giờ ghi ngược lên URL — chỉ để lần vẽ đầu biết có nên cuộn hay không.
    sectionInUrl: params.has('section'),
  }));

  const failed = profile.isError || shop.isError;

  if (profile.data && shop.data) {
    return (
      <div className={styles.page}>
        <OwnerProfileSections
          profile={profile.data}
          shop={shop.data}
          canEdit={has(PERMISSION.TENANT_UPDATE)}
          section={filters.section}
          sectionInUrl={filters.sectionInUrl}
          // Đổi section không đổi tập dữ liệu nào, chỉ cuộn — không xoá `?page=` của ai.
          onSectionChange={(section) => setFilters({ section }, { resetPage: false })}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('title')} subtitle={t('subtitle')} />
      {failed ? (
        <div className={styles.skeletonCard}>
          <EmptyState
            variant="error"
            title={t('loadError')}
            description={errorMessage(profile.error ?? shop.error)}
            onRetry={() => {
              if (profile.isError) void profile.refetch();
              if (shop.isError) void shop.refetch();
            }}
            retryLabel={tCommon('actions.retry')}
          />
        </div>
      ) : (
        <div className={styles.layout} aria-busy="true">
          <Skeleton active title={false} paragraph={{ rows: 6 }} className={styles.navSkeleton} />
          <div className={styles.content}>
            <div className={styles.skeletonCard}>
              <Skeleton active avatar paragraph={{ rows: 4 }} />
            </div>
            <div className={styles.skeletonCard}>
              <Skeleton active paragraph={{ rows: 5 }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Các section — chỉ dựng khi đã có CẢ hồ sơ lẫn gian hàng, để `useScrollToSection` tìm thấy đích
 * ngay lần vẽ đầu (link `?section=address` từ thông báo, hay `/tax` · `/subscription` cũ chuyển
 * tới `?section=tax` · `?section=plan`, phải rơi đúng chỗ, không phải đầu trang).
 */
function OwnerProfileSections({
  profile,
  shop,
  canEdit,
  section,
  sectionInUrl,
  onSectionChange,
}: {
  profile: UserProfile;
  shop: MyShop;
  canEdit: boolean;
  section: AccountSection;
  sectionInUrl: boolean;
  onSectionChange: (section: AccountSection) => void;
}) {
  const t = useTranslations('Account.ownerHub');
  const tHub = useTranslations('Account.hub');
  const tTax = useTranslations('Account.tax');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { data: user } = useCurrentUser();
  const { has } = usePermissions();
  const updateShop = useUpdateShopProfile();

  /*
   * Hai section mới đi theo đúng quyền mà API của chúng gác — thiếu quyền thì vắng khỏi cả trang lẫn
   * mục lục, không thành một khối "không có quyền" giữa một trang hồ sơ:
   *  - khai thuế → `seller_profile.view` (`GET /seller-profile`);
   *  - gói → `subscription.view`; mua/nâng cấp cần `subscription.purchase` và `SubscriptionWorkspace`
   *    tự giấu lối đó khi thiếu — y như section "Gói & hạn mức" của trang Cửa hàng.
   */
  const canSeeTax = has(PERMISSION.SELLER_PROFILE_VIEW);
  const canSeePlan = has(PERMISSION.SUBSCRIPTION_VIEW);

  const { control, handleSubmit, reset, formState } = useShopProfileForm(shop);
  const readOnly = !canEdit;
  const saving = updateShop.isPending;
  const dirty = formState.isDirty && !readOnly;

  const submit = handleSubmit((values) => {
    // Enter vẫn submit form khi nút Lưu đang quay — chặn lượt thứ hai ở đây.
    if (saving) return;
    /*
     * KHÔNG gửi `bio`: lời giới thiệu sửa ở "Thông tin chủ xe". Form này vẫn nạp nó (schema dùng
     * chung với trang Cửa hàng), và gửi kèm là ghi đè bằng bản cũ một lời giới thiệu vừa lưu ở khối
     * trên. `undefined` rơi khỏi JSON ⇒ endpoint (cập nhật từng phần) không chạm cột đó.
     */
    updateShop.mutate(
      { ...toShopProfileBody(values), bio: undefined },
      {
        onSuccess: () => message.success(t('form.saved')),
        // Câu lỗi tra từ MÃ (ADR 0012), không hiện `message` tiếng Việt của backend.
        onError: (error) => message.error(errorMessage(error)),
      },
    );
  });

  const items: SectionNavItem<AccountSection>[] = [
    { key: ACCOUNT_SECTION.PROFILE, label: t('sections.profile') },
    { key: ACCOUNT_SECTION.ADDRESS, label: t('sections.address') },
    ...(canSeeTax ? [{ key: ACCOUNT_SECTION.TAX, label: tTax('title') }] : []),
    ...(canSeePlan ? [{ key: ACCOUNT_SECTION.PLAN, label: t('sections.plan') }] : []),
    { key: ACCOUNT_SECTION.LOGIN, label: tHub('sections.login') },
    { key: ACCOUNT_SECTION.PASSWORD, label: tHub('sections.password') },
    { key: ACCOUNT_SECTION.DELETE, label: tHub('sections.delete') },
  ];
  /*
   * `?section=tax|plan` mà người xem không có quyền (section đó không dựng) thì rơi về đầu trang, như
   * mọi giá trị lạ — không để mục lục sáng một mục không tồn tại và lệnh cuộn nhắm vào hư không.
   */
  const activeSection = items.some((item) => item.key === section)
    ? section
    : ACCOUNT_SECTION.PROFILE;

  useScrollToSection(accountSectionDomId(activeSection), sectionInUrl && activeSection === section);

  const status = shop.status as TenantStatus;
  /*
   * Thứ khách thấy — CÙNG hàm với API (`storefrontIdentity`), nên thẻ "khách thấy bạn là" và tiêu
   * đề trang không thể nói khác trang công khai. Ảnh tròn, vì đây là ảnh một con người.
   */
  const identity = storefrontIdentity(
    STOREFRONT_KIND.PERSONAL,
    {
      name: shop.name,
      phone: shop.phone ?? null,
      email: shop.email ?? null,
      logoUrl: shop.profile.logoUrl ?? null,
    },
    {
      displayName: profile.displayName,
      phone: profile.phone,
      phoneVerified: profile.phoneVerified,
      email: profile.email,
      emailVerified: profile.emailVerified,
      avatarUrl: profile.avatarUrl,
    },
  );

  return (
    <>
      <header className={styles.header}>
        <div className={styles.identity}>
          <Avatar className={styles.avatar} size={56} src={identity.avatarUrl ?? undefined}>
            {initialOf(identity.name)}
          </Avatar>
          <div className={styles.headText}>
            <h1 className={styles.title}>{identity.name}</h1>
            <div className={styles.meta}>
              {user?.tenant ? <AccountTrackBadge tenant={user.tenant} size="small" /> : null}
              <span className={styles.subtitle}>{t('subtitle')}</span>
            </div>
          </div>
        </div>

        {/* Chỉ trang đang hoạt động mới có bản công khai — link tới 404 là hành động giả. */}
        {status === TENANT_STATUS.ACTIVE ? (
          <Link href={shopPath.detail(shop.slug)} target="_blank" rel="noopener noreferrer">
            <Button icon={<ExportOutlined />}>{t('viewPublicPage')}</Button>
          </Link>
        ) : null}
      </header>

      <ShopStatusBanner shop={shop} />
      {readOnly ? (
        <Alert type="info" showIcon className={styles.alert} title={t('readOnly')} />
      ) : null}

      <div className={styles.layout}>
        <SectionNav
          items={items}
          active={activeSection}
          onSelect={onSectionChange}
          domIdOf={accountSectionDomId}
          title={t('navTitle')}
          ariaLabel={t('navLabel')}
        />

        {/*
          Một `Form` ngữ cảnh (không dựng thẻ <form>) cho cả trang: nhãn nằm TRÊN ô, không dấu hai
          chấm — cùng nhịp với trang Tài khoản & bảo mật. Mỗi khối vẫn giữ <form> riêng của nó.
        */}
        <Form component={false} layout="vertical" colon={false} requiredMark={trailingRequiredMark}>
          <div className={styles.content}>
            {/*
              "Còn thiếu gì" đứng ĐẦU trang, không trong một section: các mục của nó rải khắp các
              khối (ảnh + họ tên ở khối 1, địa chỉ ở khối 2, SĐT ở Đăng nhập). Ảnh là mục BẮT BUỘC —
              với chủ xe cá nhân nó là ảnh khách thấy. Thẻ tự biến mất khi hồ sơ đã đủ.
            */}
            {!readOnly ? (
              <ShopProfileChecklist
                control={control}
                ownerAccount={shop.ownerAccount}
                kind={STOREFRONT_KIND.PERSONAL}
                ownerAvatarUrl={profile.avatarUrl}
                logoRequired
              />
            ) : null}

            <SectionCard
              id={accountSectionDomId(ACCOUNT_SECTION.PROFILE)}
              title={t('sections.profile')}
              hint={t('sections.profileHint')}
            >
              <OwnerInfoForm profile={profile} shop={shop} canEditBio={canEdit} />
            </SectionCard>

            <form id={ADDRESS_FORM_ID} onSubmit={submit} noValidate className={styles.form}>
              {/*
                `fieldset[disabled]` khoá mọi ô NATIVE bên trong; các ô CHỌN (tỉnh/thành) nhận
                `readOnly` tường minh vì chúng là combobox dựng bằng div.
              */}
              <fieldset disabled={readOnly || saving} className={styles.fieldset}>
                <SectionCard
                  id={accountSectionDomId(ACCOUNT_SECTION.ADDRESS)}
                  title={t('sections.address')}
                  hint={t('sections.addressHint')}
                >
                  <ShopLegalFields
                    control={control}
                    readOnly={readOnly}
                    kind={STOREFRONT_KIND.PERSONAL}
                  />
                </SectionCard>
              </fieldset>

              {/*
                Thanh lưu CHỈ có mặt khi có thay đổi — chính nó là tín hiệu "chưa lưu". Dính đáy màn
                hình trong suốt khối địa chỉ mà nó lưu, không bao giờ đứng cạnh khối thông tin chủ xe
                (khối đó có nút lưu riêng). Con TRỰC TIẾP của <form>: `position: sticky` bám vào khối cha.
              */}
              {dirty ? (
                <StickyFormActions
                  submitLabel={t('form.submit')}
                  onCancel={() => reset()}
                  cancelLabel={tCommon('actions.cancel')}
                  submitting={saving}
                />
              ) : null}
            </form>

            {/*
              Mỗi khối dưới đây có <form> RIÊNG (hoặc không có form nào) — không khối nào lồng vào
              form địa chỉ ở trên.
            */}
            {canSeeTax ? <SellerTaxSection id={accountSectionDomId(ACCOUNT_SECTION.TAX)} /> : null}

            {canSeePlan ? (
              <SectionCard
                id={accountSectionDomId(ACCOUNT_SECTION.PLAN)}
                title={t('sections.plan')}
                hint={t('sections.planHint')}
              >
                {/* Nhúng trong `SectionCard` — tiêu đề là của section, nên không có header thứ hai. */}
                <SubscriptionWorkspace />
              </SectionCard>
            ) : null}

            <AccountSecuritySections profile={profile} />
          </div>
        </Form>
      </div>
    </>
  );
}
