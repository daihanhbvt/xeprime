'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Card, Tabs, Tag } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import {
  API_ERROR_CODE,
  PLAN_GUIDE_VARIANT,
  PLAN_GUIDE_VARIANT_VALUES,
  STATUS_COLOR,
  type PlanGuideVariant,
} from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { adminAppConfigPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/services/api-client';
import {
  useCreatePlanGuideTemplate,
  usePlanGuideTemplate,
  useUpdatePlanGuideTemplate,
} from '../hooks/use-app-config';
import type { PlanGuideLocale, PlanGuideTemplate } from '../types';
import { PlaceholderCheatSheet } from './PlaceholderCheatSheet';
import { TemplatePreviewPane } from './TemplatePreviewPane';
import {
  buildTemplateSchema,
  EMPTY_TEMPLATE_FORM,
  firstVariantWithError,
  formVariantsToList,
  normalizeTemplateCode,
  templateToForm,
  type TemplateFormValues,
} from './template-form';
import styles from './PlanGuideTemplateEditor.module.css';

const BODY_ROWS = 18;

/**
 * Trang soạn MỘT mẫu email hướng dẫn gói (`templateId = null` ⇒ tạo mới).
 *
 * Sửa dùng khoá lạc quan: gửi `expectedVersion` của bản đang mở; người khác lưu trước ⇒ server trả
 * `CONFLICT`, trang KHÔNG tự ghi đè mà hiện lối đi tiếp (tải bản mới nhất).
 */
export function PlanGuideTemplateEditor({ templateId }: { templateId: string | null }) {
  const t = useTranslations('AdminAppConfig');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const query = usePlanGuideTemplate(templateId);

  if (!templateId) return <EditorForm template={null} />;
  if (query.isPending) return <LoadingState variant="page" label={tCommon('states.loading')} />;
  if (query.isError || !query.data) {
    return (
      <EmptyState
        variant="error"
        title={t('editor.loadError')}
        description={errorMessage(query.error)}
        onRetry={() => void query.refetch()}
        retryLabel={tCommon('actions.retry')}
        secondaryAction={
          <Button onClick={() => router.push(adminAppConfigPath.templates())}>
            {t('editor.backToList')}
          </Button>
        }
      />
    );
  }
  return (
    <EditorForm template={query.data} onReload={() => query.refetch().then((r) => r.data ?? null)} />
  );
}

function EditorForm({
  template,
  onReload,
}: {
  template: PlanGuideTemplate | null;
  onReload?: () => Promise<PlanGuideTemplate | null>;
}) {
  const t = useTranslations('AdminAppConfig');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const router = useRouter();
  const create = useCreatePlanGuideTemplate();
  const update = useUpdatePlanGuideTemplate();
  const pending = create.isPending || update.isPending;

  const [variant, setVariant] = useState<PlanGuideVariant>(PLAN_GUIDE_VARIANT.WELCOME);
  const [locale, setLocale] = useState<PlanGuideLocale>('vi');
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);

  const schema = useMemo(() => buildTemplateSchema(t), [t]);
  const { control, handleSubmit, reset, formState } = useForm<TemplateFormValues>({
    resolver: yupResolver(schema),
    defaultValues: template ? templateToForm(template) : EMPTY_TEMPLATE_FORM,
  });

  // Mẫu khác mở trên cùng instance (điều hướng giữa hai id) ⇒ dựng lại form từ bản server.
  const templateKey = template ? `${template.id}:${template.version}` : 'new';
  useEffect(() => {
    if (template) reset(templateToForm(template));
    // `templateKey` là danh tính của bản server; đổi nội dung cùng version không xảy ra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey, reset]);

  const [subject, body] = useWatch({
    control,
    name: [
      `variants.${variant}.${locale === 'vi' ? 'subjectVi' : 'subjectEn'}`,
      `variants.${variant}.${locale === 'vi' ? 'bodyVi' : 'bodyEn'}`,
    ] as const,
  });

  // Chưa lưu mà rời trang ⇒ trình duyệt hỏi lại.
  useEffect(() => {
    if (!formState.isDirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [formState.isDirty]);

  const onSubmit = handleSubmit((values) => {
    if (pending) return;
    const variants = formVariantsToList(values.variants);
    if (!template) {
      create.mutate({ code: values.code, name: values.name, variants }, {
        onSuccess: (created) => {
          message.success(t('editor.created'));
          reset(templateToForm(created));
          router.replace(adminAppConfigPath.template(created.id));
        },
        onError: (err) => message.error(errorMessage(err)),
      });
      return;
    }
    update.mutate(
      { id: template.id, name: values.name, variants, expectedVersion: template.version },
      {
        onSuccess: () => {
          setConflict(false);
          message.success(t('editor.saved'));
        },
        onError: (err) => {
          if (getErrorCode(err) === API_ERROR_CODE.CONFLICT) setConflict(true);
          else message.error(errorMessage(err));
        },
      },
    );
  }, (errors) => {
    // Lỗi nằm ở tab đang ẩn ⇒ mở tab đó, không để người soạn đoán.
    const failed = firstVariantWithError(errors.variants);
    if (failed && !errors.variants?.[variant]) setVariant(failed);
  });

  const reloadLatest = async () => {
    if (!onReload) return;
    setReloading(true);
    try {
      const latest = await onReload();
      if (latest) reset(templateToForm(latest));
      setConflict(false);
    } finally {
      setReloading(false);
    }
  };

  const localeFields = (v: PlanGuideVariant, lc: PlanGuideLocale) => (
    <div className={styles.localeFields}>
      <TextField
        control={control}
        name={`variants.${v}.${lc === 'vi' ? 'subjectVi' : 'subjectEn'}`}
        required
        label={t('editor.subject')}
        disabled={pending}
      />
      <TextAreaField
        control={control}
        name={`variants.${v}.${lc === 'vi' ? 'bodyVi' : 'bodyEn'}`}
        required
        rows={BODY_ROWS}
        showCount={false}
        label={t('editor.body')}
      />
    </div>
  );

  return (
    <div>
      <ManagePageHeader
        title={
          template ? t('editor.editTitle', { name: template.name }) : t('editor.createTitle')
        }
        subtitle={
          template
            ? t('editor.versionMeta', {
                updatedAt: fmt.dateTime(template.updatedAt),
              })
            : undefined
        }
        onBack={() => router.push(adminAppConfigPath.templates())}
        extra={
          template?.isActive ? (
            <Tag color={STATUS_COLOR.SUCCESS}>{t('editor.activeBadge')}</Tag>
          ) : undefined
        }
      />

      {conflict ? (
        <Alert
          className={styles.conflict}
          type="warning"
          showIcon
          message={t('editor.conflictTitle')}
          description={t('editor.conflictBody')}
          action={
            <Button size="small" loading={reloading} onClick={() => void reloadLatest()}>
              {t('editor.conflictReload')}
            </Button>
          }
        />
      ) : null}

      <div className={styles.layout}>
        <form onSubmit={onSubmit} noValidate className={styles.main}>
          <Card>
            <div className={styles.identity}>
              <TextField
                control={control}
                name="code"
                required
                label={t('editor.code')}
                help={t('editor.codeHelp')}
                normalize={normalizeTemplateCode}
                disabled={Boolean(template) || pending}
              />
              <TextField
                control={control}
                name="name"
                required
                label={t('editor.name')}
                disabled={pending}
              />
            </div>
            <p className={styles.hint}>{t('editor.variantHelp')}</p>
            <Tabs
              activeKey={variant}
              onChange={(key) => setVariant(key as PlanGuideVariant)}
              items={PLAN_GUIDE_VARIANT_VALUES.map((v) => ({
                key: v,
                label: (
                  <span className={formState.errors.variants?.[v] ? styles.tabError : undefined}>
                    {t(`variant.${v}`)}
                  </span>
                ),
                children: (
                  <Tabs
                    size="small"
                    activeKey={locale}
                    onChange={(key) => setLocale(key as PlanGuideLocale)}
                    items={[
                      { key: 'vi', label: t('editor.locale.vi'), children: localeFields(v, 'vi') },
                      { key: 'en', label: t('editor.locale.en'), children: localeFields(v, 'en') },
                    ]}
                  />
                ),
              }))}
            />
          </Card>
          <div className={styles.footer}>
            {formState.isDirty ? <span className={styles.dirty}>{t('editor.unsaved')}</span> : <span />}
            <Button
              type="primary"
              htmlType="submit"
              loading={pending}
              disabled={Boolean(template) && !formState.isDirty}
            >
              {template ? t('editor.save') : t('editor.create')}
            </Button>
          </div>
        </form>

        <aside className={styles.side}>
          <TemplatePreviewPane
            templateId={template?.id ?? null}
            variant={variant}
            locale={locale}
            onLocaleChange={setLocale}
            subject={subject}
            body={body}
          />
          <PlaceholderCheatSheet />
        </aside>
      </div>
    </div>
  );
}
