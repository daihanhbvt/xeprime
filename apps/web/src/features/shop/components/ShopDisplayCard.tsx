'use client';

import { CloseOutlined, EditOutlined, PictureOutlined, ShopOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import type { Control } from 'react-hook-form';
import { toLocalVnPhone } from '@xeprime/types';
import type { ShopProfileWithContactValues } from '@xeprime/validators';

import { RichText } from '@/components/data-display/RichText';
import { DialogForm } from '@/components/form/DialogForm';
import { RichTextField } from '@/components/form/RichTextField';
import { TextField } from '@/components/form/TextField';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { DialogHeading } from '@/components/overlay/DialogHeading';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { SHOP_LOGO_TRIGGER_ID, SHOP_SECTION, shopSectionDomId } from '@/constants/routes';
import { initialOf } from '@/lib/initials';

import type { MyShop } from '../types';
import { ShopMediaButton } from './ShopMediaButton';
import cardStyles from '@/components/layout/InfoCard.module.css';
import styles from './ShopDisplayCard.module.css';

/** Trần chữ của giới thiệu - cùng con số server đếm trên chữ thuần (`SHOP_BIO_TEXT_MAX_LENGTH`). */
const BIO_MAX_LENGTH = 2000;

/**
 * Thẻ "Thông tin hiển thị" ở cột phải - design `23999:111472`: ảnh bìa + logo chồng lên, cặp nút
 * đổi ảnh, rồi bốn dòng khách nhìn thấy trên chợ (tên · SĐT · email · giới thiệu có định dạng) và
 * nút "Chỉnh sửa thông tin".
 *
 * Ảnh là BẢN XEM TRƯỚC của form trang (`logoUrl`/`coverUrl` đang sửa): đổi ảnh chưa lưu gì, cặp
 * "Hủy · Lưu thay đổi" dưới thẻ mới lưu (người dùng chốt 06/11/2026). Phần chữ đọc từ bản ĐÃ LƯU -
 * nó chỉ đổi qua hộp thoại, và hộp thoại lưu ngay khi bấm "Cập nhật".
 */
export function ShopDisplayCard({
  shop,
  logoUrl,
  coverUrl,
  canEdit,
  mediaDirty,
  saving,
  onEdit,
  onMediaChange,
  onMediaCancel,
  onMediaSave,
}: {
  shop: MyShop;
  logoUrl: string | null;
  coverUrl: string | null;
  canEdit: boolean;
  mediaDirty: boolean;
  saving: boolean;
  onEdit: () => void;
  onMediaChange: (field: 'logoUrl' | 'coverUrl', url: string | null) => void;
  onMediaCancel: () => void;
  onMediaSave: () => void;
}) {
  const t = useTranslations('Shop.info.display');
  const tShop = useTranslations('Shop.form.display');
  const tCommon = useTranslations('Common');
  const empty = tCommon('labels.notAvailable');
  const profile = shop.profile;

  return (
    <div className={styles.column}>
      <section
        id={shopSectionDomId(SHOP_SECTION.PROFILE)}
        className={styles.card}
        aria-labelledby="shop-display-title"
        tabIndex={-1}
      >
        <span className={styles.glow} aria-hidden="true" />
        <header className={styles.head}>
          <h2 id="shop-display-title" className={styles.title}>
            {t('title')}
          </h2>
          <p className={styles.hint}>{t('hint')}</p>
        </header>

        <div className={styles.media}>
          <div className={styles.cover}>
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- ảnh trên R2, không qua next/image
              <img src={coverUrl} alt={tShop('cover.label')} className={styles.coverImage} />
            ) : (
              <span className={styles.coverEmpty}>
                <PictureOutlined aria-hidden />
              </span>
            )}
            {canEdit && coverUrl ? (
              <RemoveButton
                label={t('removeCover')}
                onClick={() => onMediaChange('coverUrl', null)}
              />
            ) : null}
          </div>
          <div className={styles.logoRow}>
            <span className={styles.logo}>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- ảnh trên R2, không qua next/image
                <img src={logoUrl} alt={tShop('logo.label')} className={styles.logoImage} />
              ) : (
                <span className={styles.logoEmpty}>{initialOf(shop.name)}</span>
              )}
              {canEdit && logoUrl ? (
                <RemoveButton
                  label={t('removeLogo')}
                  onClick={() => onMediaChange('logoUrl', null)}
                />
              ) : null}
            </span>
            <span className={styles.mediaHint}>{t('mediaHint')}</span>
          </div>
        </div>

        {canEdit ? (
          <div className={styles.mediaActions}>
            <ShopMediaButton
              id={SHOP_LOGO_TRIGGER_ID}
              icon={<ShopOutlined aria-hidden />}
              label={t('changeLogo')}
              disabled={saving}
              onUploaded={(url) => onMediaChange('logoUrl', url)}
            />
            <ShopMediaButton
              icon={<PictureOutlined aria-hidden />}
              label={t('changeCover')}
              disabled={saving}
              onUploaded={(url) => onMediaChange('coverUrl', url)}
            />
          </div>
        ) : null}

        <hr className={styles.divider} />

        <dl className={styles.facts}>
          <Fact label={t('displayName')} value={shop.name} empty={empty} />
          <Fact
            label={t('phone')}
            value={shop.phone ? toLocalVnPhone(shop.phone) : null}
            empty={empty}
          />
          <Fact label={t('email')} value={shop.email} empty={empty} />
          <div className={styles.fact}>
            <dt className={styles.factLabel}>{t('bio')}</dt>
            <dd className={styles.factValue}>
              {profile.bioHtml || profile.bio ? (
                <RichText html={profile.bioHtml} text={profile.bio} />
              ) : (
                <span className={styles.factEmpty}>{empty}</span>
              )}
            </dd>
          </div>
        </dl>

        {canEdit ? (
          <Button block icon={<EditOutlined aria-hidden />} onClick={onEdit}>
            {t('edit')}
          </Button>
        ) : null}
      </section>

      {/*
        Chỉ hiện khi đổi ảnh mà chưa lưu: một cặp nút luôn đứng đó gợi ý rằng có gì đang dở dang,
        và một nút Lưu luôn sáng dạy người dùng bấm nó là vô hại.
      */}
      {canEdit && mediaDirty ? (
        <div className={styles.actions}>
          <Button size="large" onClick={onMediaCancel} disabled={saving}>
            {tCommon('actions.cancel')}
          </Button>
          <Button size="large" type="primary" loading={saving} onClick={onMediaSave}>
            {tCommon('actions.saveChanges')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Fact({
  label,
  value,
  empty,
}: {
  label: string;
  value: string | null | undefined;
  empty: string;
}) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>
        {value ? value : <span className={styles.factEmpty}>{empty}</span>}
      </dd>
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Tooltip title={label}>
      <button type="button" className={styles.remove} aria-label={label} onClick={onClick}>
        <CloseOutlined aria-hidden />
      </button>
    </Tooltip>
  );
}

/** Hộp "Chỉnh sửa thông tin hiển thị" - design `24047:78679`: ba ô một hàng + editor giới thiệu. */
export function ShopDisplayDialog({
  open,
  control,
  saving,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  control: Control<ShopProfileWithContactValues>;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('Shop.info.display');
  const tShop = useTranslations('Shop.form.display');
  const tCommon = useTranslations('Common');

  return (
    <ResponsiveDialog
      open={open}
      size="lg"
      title={<DialogHeading title={t('dialogTitle')} hint={tShop('contactHint')} />}
      ariaLabel={t('dialogTitle')}
      okText={tCommon('actions.update')}
      cancelText={tCommon('actions.cancel')}
      confirmLoading={saving}
      onOk={onSubmit}
      onClose={onCancel}
    >
      <DialogForm
        labelPosition="top"
        requiredMark={trailingRequiredMark}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <fieldset disabled={saving} className={cardStyles.fieldset}>
          <div className={styles.dialogRow}>
            <TextField
              control={control}
              name="displayName"
              label={t('displayName')}
              required
              placeholder={tShop('displayName.placeholder')}
            />
            <TextField
              control={control}
              name="phone"
              type="tel"
              label={t('phoneField')}
              placeholder={tShop('phone.placeholder')}
              autoComplete="tel"
            />
            <TextField
              control={control}
              name="email"
              type="email"
              label={t('email')}
              placeholder={tShop('email.placeholder')}
              autoComplete="email"
            />
          </div>
          <RichTextField
            control={control}
            name="bioHtml"
            label={t('bio')}
            placeholder={t('bioPlaceholder')}
            maxLength={BIO_MAX_LENGTH}
            disabled={saving}
          />
        </fieldset>
      </DialogForm>
    </ResponsiveDialog>
  );
}
