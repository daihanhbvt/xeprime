'use client';

import { ExportOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Alert, Avatar, Button, Form } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import {
  FEATURE_STATE,
  isFeatureVisible,
  isPackageShopTrack,
  PERMISSION,
  PLAN_FEATURE,
  TENANT_STATUS,
  TENANT_STATUS_META,
  type TenantStatus,
} from '@xeprime/types';

import { StatusTag } from '@/components/data-display/StatusTag';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { BranchesView } from '@/features/branches/components/BranchesView';
import { ShopPlanSection } from '@/features/subscription/components/ShopPlanSection';
import { shopPath, shopSectionDomId, SHOP_SECTION, type ShopSection } from '@/constants/routes';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { useFeatureStates } from '@/hooks/use-feature';
import { usePermissions } from '@/hooks/use-permissions';
import { useScrollToSection } from '@/hooks/use-scroll-to-section';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { initialOf } from '@/lib/initials';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';

import {
  SHOP_PROFILE_GROUP,
  SHOP_PROFILE_GROUP_FIELDS,
  toShopProfilePatch,
  toShopProfileValues,
  useShopProfileForm,
  type ShopProfileGroup,
} from '../shop-profile-form';
import type { MyShop, UpdateProfileInput } from '../types';
import { ShopDisplayCard, ShopDisplayDialog } from './ShopDisplayCard';
import { ShopLegalCard, ShopLegalDialog } from './ShopLegalCard';
import { ShopOwnerSection } from './ShopOwnerSection';
import { ShopProfileChecklist } from './ShopProfileChecklist';
import { ShopStatusBanner } from './ShopStatusBanner';
import { ShopTaxCard } from './ShopTaxCard';
import { ShopWelcomeBanner } from './ShopWelcomeBanner';
import styles from './ShopWorkspace.module.css';

export interface ShopWorkspaceProps {
  shop: MyShop;
  /** Quyền `tenant.update`. Thiếu quyền thì chỉ-xem. */
  canEdit: boolean;
  saving: boolean;
  /** Section đang mở, đọc từ `?section=` (đã phân giải, không bao giờ là giá trị lạ). */
  section: ShopSection;
  /**
   * `?section=` CÓ MẶT trong URL hay đây chỉ là giá trị mặc định.
   *
   * Có mặt ⇒ cuộn tới section đó ngay lần vẽ đầu - đường mà các redirect cũ đi vào
   * (`/manage/subscription` → `?section=plan`, `/shop/branches` → `?section=branches`) và đường một
   * link chia sẻ đi vào. Mặc định thì KHÔNG cuộn: người mở trang trần phải thấy đầu trang.
   */
  sectionInUrl: boolean;
  /**
   * Gian hàng VỪA thanh toán gói xong - `?welcome=1` và đúng là gian hàng tuyến gói (ADR 0040).
   * Route đã kiểm cả hai vế.
   */
  welcome?: boolean;
  /** Gian hàng đã có xe nào chưa - chỉ dùng cho dải chào mừng; route chỉ hỏi khi `welcome`. */
  hasVehicle?: boolean;
  /** Lưu MỘT nhóm ô của hồ sơ; promise từ chối khi server từ chối (hộp thoại giữ nguyên). */
  onSave: (body: UpdateProfileInput) => Promise<unknown>;
}

/**
 * TRANG THÔNG TIN CỬA HÀNG - design `23999:111044` (06/11/2026).
 *
 * ## Bố cục
 *
 *   Logo · tên · trạng thái                               [vai người xem] [Xem gian hàng]
 *   ┌ Chủ gian hàng ┐┌ Địa chỉ & pháp lý ┐┌ Khai thuế ┐   ┌ Thông tin hiển thị ┐
 *   ┌ Chi nhánh ──────────────────────────────────────┐   │ ảnh bìa · logo      │
 *   ┌ Gói & hạn mức ──────────────────────────────────┐   │ tên · SĐT · email   │
 *   ┌ Hoá đơn và thanh toán ──────────────────────────┐   └ giới thiệu ─────────┘
 *
 * Mục lục trái của bản cũ đã bỏ (design không còn): trang giờ là các THẺ ngắn, mỗi thẻ một tiêu đề.
 * `?section=` vẫn sống - các redirect và link cũ cuộn tới đúng thẻ (`shopSectionDomId`).
 *
 * ## MỘT form, lưu THEO NHÓM
 *
 * Các thẻ chỉ ĐỌC; sửa trong hộp thoại, và "Cập nhật" của hộp thoại lưu NGAY đúng nhóm ô của nó
 * (`toShopProfilePatch` - người dùng chốt 06/11/2026). Cả trang dùng chung một form hồ sơ để danh
 * sách "Hoàn thiện hồ sơ" và bản xem trước ảnh đọc giá trị đang sửa. Đóng hộp thoại = trả nhóm ô đó
 * về bản đã lưu. Logo / ảnh bìa là ngoại lệ có chủ đích: đổi ảnh là xem trước trên thẻ, cặp
 * "Hủy · Lưu thay đổi" dưới thẻ mới lưu.
 *
 * "Thông tin khai thuế" lưu vào hồ sơ NGƯỜI BÁN (endpoint khác) bằng form riêng (`ShopTaxCard`).
 */
export function ShopWorkspace({
  shop,
  canEdit,
  saving,
  section,
  sectionInUrl,
  welcome = false,
  hasVehicle = false,
  onSave,
}: ShopWorkspaceProps) {
  const t = useTranslations('Shop');
  const domainLabel = useDomainLabel();
  const { has } = usePermissions();
  const { tenant } = useTenantScope();
  const form = useShopProfileForm(shop);
  const [editing, setEditing] = useState<ShopProfileGroup | null>(null);

  const status = shop.status as TenantStatus;
  // Phiên hỗ trợ gian hàng (ADR 0050 §12): hồ sơ chỉ đọc - không nút sửa, không lời giải thích quyền.
  const hidesDenied = useSupportHides(SUPPORT_HIDDEN_AREA.DENIED_ACTIONS);
  const readOnlyReason = canEdit || hidesDenied ? null : t('form.readOnly');

  /*
   * Các trục quyết định thẻ nào có mặt, và mỗi trục KHỚP với guard của API:
   *  - "Thông tin khai thuế" → `seller_profile.view` (`GET /seller-profile`); sửa cần
   *    `seller_profile.manage` (thẻ tự ẩn bút chì). Vắng trong phiên hỗ trợ (ADR 0050 §10).
   *  - "Gói & hạn mức" + "Hoá đơn" → `subscription.view`. Mua/gia hạn cần `subscription.purchase`.
   *  - Chi nhánh → `branches.view` + cờ gói `branches` (`hidden` ⇒ vắng hẳn, `read_only` ⇒ vẫn
   *    xem/sửa, chỉ khoá thêm mới). Cờ vắng trong cache ⇒ `enabled`.
   */
  const supportHidesLegal = useSupportHides(SUPPORT_HIDDEN_AREA.SHOP_LEGAL);
  const canSeeTax = has(PERMISSION.SELLER_PROFILE_VIEW) && !supportHidesLegal;
  const canSeePlan = has(PERMISSION.SUBSCRIPTION_VIEW);
  const featureStates = useFeatureStates();
  const canSeeBranches =
    has(PERMISSION.BRANCH_VIEW) &&
    isFeatureVisible(featureStates[PLAN_FEATURE.BRANCHES] ?? FEATURE_STATE.ENABLED);

  useScrollToSection(shopSectionDomId(section), sectionInUrl);

  const [logoUrl, coverUrl] = useWatch({ control: form.control, name: ['logoUrl', 'coverUrl'] });
  const dirty = form.formState.dirtyFields;
  const mediaDirty = Boolean(dirty.logoUrl || dirty.coverUrl);

  /** Trả các ô của MỘT nhóm về bản đã lưu - đóng hộp thoại, hoặc "Hủy" của ảnh. */
  function resetGroup(group: ShopProfileGroup) {
    const saved = toShopProfileValues(shop);
    for (const field of SHOP_PROFILE_GROUP_FIELDS[group]) {
      form.resetField(field, { defaultValue: saved[field] });
    }
  }

  async function saveGroup(group: ShopProfileGroup) {
    // Enter vẫn gửi form khi nút đang quay - không gửi lượt thứ hai trong lúc lượt đầu đang bay.
    if (saving) return;
    const valid = await form.trigger([...SHOP_PROFILE_GROUP_FIELDS[group]]);
    if (!valid) return;
    const values = form.getValues();
    try {
      await onSave(toShopProfilePatch(values, group));
    } catch {
      // Câu lỗi do nơi gọi báo; giữ nguyên hộp thoại + giá trị đang sửa để sửa và gửi lại.
      return;
    }
    // Ghi bản vừa lưu làm mốc "chưa sửa" của nhóm - nhóm khác đang sửa dở không bị đụng.
    for (const field of SHOP_PROFILE_GROUP_FIELDS[group]) {
      form.resetField(field, { defaultValue: values[field] });
    }
    setEditing(null);
  }

  function closeDialog() {
    if (editing) resetGroup(editing);
    setEditing(null);
  }

  const roleKey = tenant?.roleKey;

  return (
    <>
      <header className={styles.header}>
        <div className={styles.identity}>
          {/* LOGO gian hàng - danh tính nổi bật của trang là gian hàng, không phải một người. */}
          <Avatar
            className={styles.logo}
            size={54}
            shape="square"
            src={shop.profile.logoUrl ?? undefined}
          >
            {initialOf(shop.name)}
          </Avatar>
          <div className={styles.headText}>
            <h1 className={styles.shopName}>
              {shop.name}
              <StatusTag
                value={status}
                meta={TENANT_STATUS_META}
                group="tenantStatus"
                appearance="pill"
              />
            </h1>
            <p className={styles.subtitle}>{t('page.subtitle')}</p>
          </div>
        </div>

        <div className={styles.actions}>
          {roleKey ? (
            <span className={styles.roleChip}>
              <SafetyCertificateOutlined aria-hidden />
              {domainLabel('tenantRole', roleKey)}
            </span>
          ) : null}
          {/* Chỉ shop đang hoạt động mới có trang công khai - link tới 404 là hành động giả. */}
          {status === TENANT_STATUS.ACTIVE ? (
            <Link href={shopPath.detail(shop.slug)} target="_blank" rel="noopener noreferrer">
              <Button size="large" icon={<ExportOutlined />}>
                {t('page.viewPublicPage')}
              </Button>
            </Link>
          ) : null}
        </div>
      </header>

      {/*
        Dải CHÀO MỪNG đứng TRƯỚC dải trạng thái: người vừa trả tiền cần biết việc còn lại của mình
        trước khi đọc bất cứ tin gì khác. Nó tự im lặng khi không còn gì để nói.
      */}
      {welcome ? (
        <ShopWelcomeBanner missingLogo={!shop.profile.logoUrl} hasVehicle={hasVehicle} />
      ) : null}
      <ShopStatusBanner shop={shop} />
      {readOnlyReason ? (
        <Alert type="info" showIcon className={styles.alert} title={readOnlyReason} />
      ) : null}

      {/* Form AntD bao cả trang để mọi `Form.Item` trong hộp thoại dùng chung layout + dấu bắt buộc. */}
      <Form component={false} layout="vertical" colon={false} requiredMark={trailingRequiredMark}>
        <div className={styles.layout}>
          <div className={styles.main}>
            <div className={styles.topCards}>
              <ShopOwnerSection shop={shop} />
              <ShopLegalCard
                shop={shop}
                onEdit={canEdit ? () => setEditing(SHOP_PROFILE_GROUP.LEGAL) : undefined}
              />
              {canSeeTax ? <ShopTaxCard /> : null}
            </div>

            {canSeeBranches ? (
              <BranchesView variant="section" sectionId={shopSectionDomId(SHOP_SECTION.BRANCHES)} />
            ) : null}

            {canSeePlan ? <ShopPlanSection id={shopSectionDomId(SHOP_SECTION.PLAN)} /> : null}
          </div>

          <aside className={styles.aside}>
            <ShopDisplayCard
              shop={shop}
              logoUrl={logoUrl ?? null}
              coverUrl={coverUrl ?? null}
              canEdit={canEdit}
              mediaDirty={mediaDirty}
              saving={saving}
              onEdit={() => setEditing(SHOP_PROFILE_GROUP.DISPLAY)}
              onMediaChange={(field, url) =>
                form.setValue(field, url, { shouldDirty: true, shouldValidate: true })
              }
              onMediaCancel={() => resetGroup(SHOP_PROFILE_GROUP.MEDIA)}
              onMediaSave={() => void saveGroup(SHOP_PROFILE_GROUP.MEDIA)}
            />
            {/*
              "Hoàn thiện hồ sơ" - design không vẽ; giữ dưới thẻ hiển thị vì nó nói đúng những gì
              thẻ đó còn thiếu. Chỉ cho người SỬA được; tự ẩn khi đủ. Gian hàng tuyến gói: LOGO là
              mục chặn (`submitForPublicReview` từ chối thật - ADR 0040 điều 7).
            */}
            {canEdit ? (
              <ShopProfileChecklist
                control={form.control}
                ownerAccount={shop.ownerAccount}
                logoRequired={isPackageShopTrack(tenant)}
              />
            ) : null}
          </aside>
        </div>

        {canEdit ? (
          <>
            <ShopLegalDialog
              open={editing === SHOP_PROFILE_GROUP.LEGAL}
              control={form.control}
              saving={saving}
              onCancel={closeDialog}
              onSubmit={() => void saveGroup(SHOP_PROFILE_GROUP.LEGAL)}
            />
            <ShopDisplayDialog
              open={editing === SHOP_PROFILE_GROUP.DISPLAY}
              control={form.control}
              saving={saving}
              onCancel={closeDialog}
              onSubmit={() => void saveGroup(SHOP_PROFILE_GROUP.DISPLAY)}
            />
          </>
        ) : null}
      </Form>
    </>
  );
}
