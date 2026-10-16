'use client';

import { DesktopOutlined, MobileOutlined, TabletOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useTranslations } from 'next-intl';
import { appWallClockToIso, toAppTz, type Dayjs } from '@/lib/datetime';
import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { DateTimeField } from '@/components/form/DateTimeField';
import { ImageUploadField } from '@/components/form/ImageUploadField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { presignBannerImage } from '@/services/upload';
import { BANNER_PLACEMENT, isBannerPlacement, type BannerPlacement } from '@xeprime/types';
import {
  bannerRatioValidator,
  bannerSlotsFor,
  formatBannerSize,
  type BannerRatioIssue,
  type BannerSlot,
} from '../banner-media';
import { useBannerSaveErrorMessage, useCreateBanner, useUpdateBanner } from '../use-admin-banners';
import type { AdminBanner } from '../types';
import styles from './BannerFormModal.module.css';

/** Cùng biên với `CreateBannerDto` ở API. */
const TITLE_MAX = 150;
const ALT_MAX = 255;

type FormErrorsT = ReturnType<typeof useTranslations<'AdminBanners.form.errors'>>;
type CommonT = ReturnType<typeof useTranslations<'Common'>>;

function buildSchema(t: FormErrorsT, tCommon: CommonT) {
  return yup.object({
    title: yup
      .string()
      .trim()
      .required(t('titleRequired'))
      .max(TITLE_MAX, tCommon('validation.maxLength', { max: TITLE_MAX })),
    imageUrl: yup
      .string()
      .nullable()
      .defined()
      .test('required', t('imageRequired'), (v) => Boolean(v)),
    tabletImageUrl: yup.string().nullable().defined(),
    mobileImageUrl: yup.string().nullable().defined(),
    altText: yup
      .string()
      .trim()
      .required(t('altRequired'))
      .max(ALT_MAX, tCommon('validation.maxLength', { max: ALT_MAX })),
    linkUrl: yup
      .string()
      .trim()
      .defined()
      .test('safe-url', t('linkInvalid'), (v) => (!v ? true : /^(https?:\/\/|\/)\S+$/.test(v))),
    active: yup.boolean().default(true),
    startsAt: yup.mixed<Dayjs>().nullable().defined(),
    endsAt: yup
      .mixed<Dayjs>()
      .nullable()
      .defined()
      .test('after-start', t('endBeforeStart'), (value, ctx) => {
        const start = ctx.parent.startsAt as Dayjs | null;
        return !value || !start || value.isAfter(start);
      }),
  });
}

type FormValues = yup.InferType<ReturnType<typeof buildSchema>>;

function formValuesFromBanner(banner: AdminBanner | null): FormValues {
  if (!banner) {
    return {
      title: '',
      imageUrl: null,
      tabletImageUrl: null,
      mobileImageUrl: null,
      altText: '',
      linkUrl: '',
      active: true,
      startsAt: null,
      endsAt: null,
    };
  }

  return {
    title: banner.title,
    imageUrl: banner.imageUrl,
    tabletImageUrl: banner.tabletImageUrl,
    mobileImageUrl: banner.mobileImageUrl,
    altText: banner.altText,
    linkUrl: banner.linkUrl ?? '',
    active: banner.active,
    // Mốc UTC từ API → giờ VN cho ô chọn; chiều gửi đi dùng `appWallClockToIso`.
    startsAt: banner.startsAt ? toAppTz(banner.startsAt) : null,
    endsAt: banner.endsAt ? toAppTz(banner.endsAt) : null,
  };
}

/**
 * Tạo/sửa banner trang chủ. Ảnh upload theo pattern R2 chung (presign → PUT thẳng); alt bắt
 * buộc vì banner là nội dung marketing hiện với mọi khách. Lịch để trống = hiển thị vô hạn.
 *
 * Banner tự mang thông điệp, không chữ nào đè lên ảnh; riêng ảnh PC bị thẻ tìm kiếm trang chủ đè
 * lên phần dưới — form nhắc admin giữ chữ và chủ thể ở phần trên ảnh.
 */
export function BannerFormModal({
  open,
  placement: tabPlacement,
  banner,
  onClose,
}: {
  open: boolean;
  /** Vị trí của banner TẠO MỚI (tab đang mở). Banner đang sửa giữ vị trí của chính nó. */
  placement: BannerPlacement;
  /** null = tạo mới. */
  banner: AdminBanner | null;
  onClose: () => void;
}) {
  const placement = banner && isBannerPlacement(banner.placement) ? banner.placement : tabPlacement;
  const isPromo = placement === BANNER_PLACEMENT.PROMO;
  // Mỗi vị trí một bộ khổ ảnh — banner khuyến mãi không có ô tablet (tablet hiện như máy tính).
  const slots = bannerSlotsFor(placement);
  const t = useTranslations('AdminBanners');
  const tErrors = useTranslations('AdminBanners.form.errors');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const saveErrorMessage = useBannerSaveErrorMessage();
  const create = useCreateBanner();
  const update = useUpdateBanner();
  const isEdit = Boolean(banner);
  const pending = create.isPending || update.isPending;
  const formId = useId();
  const wasOpen = useRef(false);
  const previousBannerId = useRef<string | null>(null);

  const schema = useMemo(() => buildSchema(tErrors, tCommon), [tErrors, tCommon]);
  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: formValuesFromBanner(banner),
  });

  useEffect(() => {
    const bannerId = banner?.id ?? null;
    const openedNow = open && !wasOpen.current;
    const changedBanner = open && previousBannerId.current !== bannerId;

    // React Hook Form chỉ đọc `defaultValues` lúc mount. Reset khi mở lại để phiên tạo mới
    // không giữ URL ảnh hoặc nội dung của phiên tạo/sửa trước đó.
    if (openedNow || changedBanner) reset(formValuesFromBanner(banner));

    wasOpen.current = open;
    previousBannerId.current = bannerId;
  }, [banner, open, reset]);

  const describeRatioIssue = useCallback(
    (issue: BannerRatioIssue) =>
      issue.kind === 'unreadable'
        ? t('media.errors.unreadable')
        : t('media.errors.ratio', {
            slot: issue.slot,
            size: formatBannerSize(issue.expected),
            size2x: formatBannerSize(issue.expected, 2),
            actual: formatBannerSize(issue.actual),
          }),
    [t],
  );

  /** Một validator cho mỗi slot của vị trí — giữ nguyên tham chiếu giữa các lần render. */
  const validators = useMemo(
    () => ({
      desktop: bannerRatioValidator('desktop', slots.desktop, describeRatioIssue),
      tablet: slots.tablet
        ? bannerRatioValidator('tablet', slots.tablet, describeRatioIssue)
        : undefined,
      mobile: slots.mobile
        ? bannerRatioValidator('mobile', slots.mobile, describeRatioIssue)
        : undefined,
    }),
    [describeRatioIssue, slots],
  );

  const sizeHelp = (slot: BannerSlot) => {
    const size = slots[slot];
    return size
      ? t('media.sizeHelp', {
          size: formatBannerSize(size),
          size2x: formatBannerSize(size, 2),
        })
      : null;
  };

  const onSubmit = handleSubmit((values) => {
    const body = {
      title: values.title.trim(),
      // Vị trí chỉ đi kèm lượt TẠO — API không cho đổi vị trí của banner đã có.
      ...(banner ? {} : { placement }),
      // Schema đã chặn null (test 'required') — tới đây chắc chắn có URL.
      imageUrl: values.imageUrl as string,
      tabletImageUrl: slots.tablet ? values.tabletImageUrl || null : null,
      mobileImageUrl: values.mobileImageUrl || null,
      altText: values.altText.trim(),
      linkUrl: values.linkUrl?.trim() || null,
      active: values.active,
      startsAt: values.startsAt ? appWallClockToIso(values.startsAt) : null,
      endsAt: values.endsAt ? appWallClockToIso(values.endsAt) : null,
    };
    const done = {
      onSuccess: () => {
        message.success(isEdit ? t('toast.updated') : t('toast.created'));
        onClose();
      },
      onError: (err: unknown) => message.error(saveErrorMessage(err)),
    };
    if (banner) update.mutate({ id: banner.id, ...body }, done);
    else create.mutate(body, done);
  });

  return (
    <ResponsiveDialog
      title={
        isEdit ? t('form.titleEdit') : isPromo ? t('form.titleCreatePromo') : t('form.titleCreate')
      }
      open={open}
      onClose={onClose}
      size="xl"
      mobileMode="fullscreen"
      confirmLoading={pending}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            {tCommon('actions.cancel')}
          </Button>
          <Button type="primary" htmlType="submit" form={formId} loading={pending}>
            {isEdit ? tCommon('actions.saveChanges') : t('page.create')}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.intro}>
          <div>
            <span className={styles.eyebrow}>
              {isEdit ? t('form.eyebrowEdit') : t('form.eyebrowCreate')}
            </span>
            <p className={styles.introText}>{isPromo ? t('form.introPromo') : t('form.intro')}</p>
          </div>
          <span className={styles.responsiveBadge}>
            {t('form.sizesBadge', { count: Object.keys(slots).length })}
          </span>
        </div>

        <section className={styles.section} aria-labelledby={`${formId}-basic`}>
          <div className={styles.sectionHeading}>
            <div>
              <h3 id={`${formId}-basic`} className={styles.sectionTitle}>
                {t('form.sections.basic.title')}
              </h3>
              <p className={styles.sectionDescription}>{t('form.sections.basic.description')}</p>
            </div>
          </div>
          <div className={styles.singleField}>
            <TextField
              control={control}
              name="title"
              label={t('form.fields.title.label')}
              placeholder={t('form.fields.title.placeholder')}
              help={t('form.fields.title.help')}
              required
            />
          </div>
        </section>

        <section className={styles.section} aria-labelledby={`${formId}-media`}>
          <div className={styles.sectionHeading}>
            <div>
              <h3 id={`${formId}-media`} className={styles.sectionTitle}>
                {t('form.sections.media.title')}
              </h3>
              <p className={styles.sectionDescription}>
                {isPromo ? t('form.mediaDescriptionPromo') : t('form.sections.media.description')}
              </p>
            </div>
          </div>

          {/* Mỗi slot MỘT tỉ lệ chuẩn, đo ảnh thật lúc chọn file — xem banner-media.ts. */}
          <div className={styles.mediaGrid}>
            <div className={`${styles.mediaCard} ${styles.desktopMediaCard}`}>
              <ImageUploadField
                control={control}
                name="imageUrl"
                label={
                  <span className={styles.mediaLabel}>
                    <DesktopOutlined aria-hidden="true" />
                    {t('media.slots.desktop')}
                    <span className={styles.requiredBadge}>{tCommon('labels.required')}</span>
                  </span>
                }
                presign={presignBannerImage}
                validate={validators.desktop}
                help={
                  <>
                    {sizeHelp('desktop')}
                    <span className={styles.helpNote}>
                      {isPromo ? t('media.promoComposition') : t('media.desktopComposition')}
                    </span>
                  </>
                }
                variant="card"
                previewAspectRatio={slots.desktop.width / slots.desktop.height}
                required
              />
            </div>
            {slots.tablet ? (
              <div className={styles.mediaCard}>
                <ImageUploadField
                  control={control}
                  name="tabletImageUrl"
                  label={
                    <span className={styles.mediaLabel}>
                      <TabletOutlined aria-hidden="true" />
                      {t('media.slots.tablet')}
                      <span className={styles.optionalBadge}>{t('media.optional')}</span>
                    </span>
                  }
                  presign={presignBannerImage}
                  validate={validators.tablet}
                  help={sizeHelp('tablet')}
                  variant="card"
                  previewAspectRatio={slots.tablet.width / slots.tablet.height}
                />
              </div>
            ) : null}
            <div className={styles.mediaCard}>
              <ImageUploadField
                control={control}
                name="mobileImageUrl"
                label={
                  <span className={styles.mediaLabel}>
                    <MobileOutlined aria-hidden="true" />
                    {t('media.slots.mobile')}
                    <span className={styles.optionalBadge}>{t('media.optional')}</span>
                  </span>
                }
                presign={presignBannerImage}
                validate={validators.mobile}
                help={sizeHelp('mobile')}
                variant="card"
                previewAspectRatio={
                  slots.mobile ? slots.mobile.width / slots.mobile.height : undefined
                }
              />
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby={`${formId}-content`}>
          <div className={styles.sectionHeading}>
            <div>
              <h3 id={`${formId}-content`} className={styles.sectionTitle}>
                {t('form.sections.content.title')}
              </h3>
              <p className={styles.sectionDescription}>{t('form.sections.content.description')}</p>
            </div>
          </div>
          <div className={styles.fieldGrid}>
            <TextField
              control={control}
              name="altText"
              label={t('form.fields.altText.label')}
              placeholder={t('form.fields.altText.placeholder')}
              help={t('form.fields.altText.help')}
              required
            />
            <TextField
              control={control}
              name="linkUrl"
              label={t('form.fields.linkUrl.label')}
              placeholder={t('form.fields.linkUrl.placeholder')}
              help={t('form.fields.linkUrl.help')}
            />
          </div>
        </section>

        <section className={styles.section} aria-labelledby={`${formId}-visibility`}>
          <div className={styles.sectionHeading}>
            <div>
              <h3 id={`${formId}-visibility`} className={styles.sectionTitle}>
                {t('form.sections.visibility.title')}
              </h3>
              <p className={styles.sectionDescription}>
                {t('form.sections.visibility.description')}
              </p>
            </div>
          </div>
          <div className={styles.scheduleRow}>
            <DateTimeField
              control={control}
              name="startsAt"
              label={t('form.fields.startsAt.label')}
              placeholder={t('form.fields.startsAt.placeholder')}
            />
            <DateTimeField
              control={control}
              name="endsAt"
              label={t('form.fields.endsAt.label')}
              placeholder={t('form.fields.endsAt.placeholder')}
            />
          </div>
          <div className={styles.statusCard}>
            <SwitchField
              control={control}
              name="active"
              label={tCommon('labels.enabled')}
              description={t('form.fields.active.description')}
            />
          </div>
        </section>
      </form>
    </ResponsiveDialog>
  );
}
