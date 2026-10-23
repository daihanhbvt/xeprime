'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { EyeOutlined, MessageOutlined, PhoneOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useId, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { telHref, zaloHref } from '@xeprime/domain';
import {
  FOLLOW_UP_NOTE_MAX_LENGTH,
  FOLLOW_UP_STATUS_VALUES,
  PERMISSION,
  type FollowUpLostReason,
  type FollowUpStatus,
} from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { CheckboxField } from '@/components/form/CheckboxField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import {
  WorkDrawerFacts,
  WorkDrawerFooter,
  WorkDrawerPager,
  WorkDrawerTitle,
  type WorkDrawerFact,
} from '@/components/overlay/WorkDrawer';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { FOLLOW_UP_STATUS_COLOR } from '../constants';
import {
  useFollowUpAssignees,
  useRevealFollowUpContact,
  useUpdateFollowUp,
} from '../hooks/use-follow-ups';
import type { FollowUp } from '../types';
import styles from './FollowUps.module.css';

interface FollowUpFormValues {
  status: FollowUpStatus;
  note: string;
  markContacted: boolean;
  assigneeUserId: string | null;
}

/**
 * Panel chăm sóc MỘT khách mất đơn — hình làm việc chung (`WorkDrawer`): chuyến không thành bên
 * trái, kết quả chăm sóc bên phải. Bản ghi lấy từ trang danh sách đang lọc (không có endpoint chi
 * tiết riêng — mọi thứ cần đã có trong dòng).
 */
export function FollowUpDrawer({
  item,
  previousId,
  nextId,
  onNavigate,
  onClose,
  onSaved,
}: {
  item: FollowUp | null;
  previousId: string | null;
  nextId: string | null;
  onNavigate: (id: string) => void;
  onClose: () => void;
  /** Lưu xong: bản ghi MỚI từ server — panel ở lại đúng khách đó để người dùng thấy cái vừa ghi. */
  onSaved: (updated: FollowUp) => void;
}) {
  const t = useTranslations('AdminFollowUps');
  const { has } = usePermissions();
  const canManage = has(PERMISSION.PLATFORM_SALES_FOLLOWUP_MANAGE);
  const formId = useId();
  const update = useUpdateFollowUp();

  const status = item?.followUpStatus as FollowUpStatus | undefined;

  return (
    <DetailDrawer
      open={Boolean(item)}
      onClose={onClose}
      size="lg"
      closeAtEnd
      ariaLabel={item ? t('drawer.ariaLabel', { name: item.customerName }) : t('drawer.title')}
      title={
        <WorkDrawerTitle
          label={t('drawer.title')}
          code={item?.customerName}
          status={
            status ? (
              <Tag color={FOLLOW_UP_STATUS_COLOR[status]}>{t(`status.${status}`)}</Tag>
            ) : null
          }
        />
      }
      extra={
        <WorkDrawerPager
          previousId={previousId}
          nextId={nextId}
          onNavigate={onNavigate}
          previousLabel={t('drawer.previous')}
          nextLabel={t('drawer.next')}
        />
      }
      footer={
        item ? (
          canManage ? (
            <WorkDrawerFooter
              hint={t('form.hint')}
              actions={
                <Button type="primary" htmlType="submit" form={formId} loading={update.isPending}>
                  {t('form.save')}
                </Button>
              }
            />
          ) : (
            <WorkDrawerFooter hint={t('drawer.readOnly')} />
          )
        ) : null
      }
    >
      {item ? (
        // `key` ép remount khi đổi mục: liên hệ đã bỏ che và giá trị form của mục trước không rớt sang mục sau.
        <div key={item.id} className={styles.body}>
          {/* Hàng trên chia đôi: chuyến không thành · liên hệ khách — màn hẹp tự xếp chồng. */}
          <div className={styles.topRow}>
            <FollowUpRecord item={item} />
            <ContactCard item={item} />
          </div>
          {canManage ? (
            <FollowUpForm formId={formId} item={item} update={update} onSaved={onSaved} />
          ) : (
            <ReadOnlyResult item={item} />
          )}
        </div>
      ) : null}
    </DetailDrawer>
  );
}

function FollowUpRecord({ item }: { item: FollowUp }) {
  const t = useTranslations('AdminFollowUps');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const facts: WorkDrawerFact[] = [
    {
      key: 'reason',
      label: t('table.reason'),
      value: t(`reason.${item.lostReason as FollowUpLostReason}`),
    },
    { key: 'vehicle', label: t('drawer.vehicle'), value: item.vehicleName },
    { key: 'tenant', label: t('drawer.tenant'), value: item.tenantName },
    {
      key: 'period',
      label: t('drawer.period'),
      value:
        item.pickupAt && item.returnAt
          ? `${fmt.shortDateTime(item.pickupAt)} → ${fmt.shortDateTime(item.returnAt)}`
          : null,
    },
    { key: 'bookingCode', label: t('drawer.bookingCode'), value: item.bookingCode },
    { key: 'requestedAt', label: t('drawer.requestedAt'), value: fmt.dateTime(item.requestedAt) },
    { key: 'closedAt', label: t('drawer.closedAt'), value: fmt.dateTime(item.closedAt) },
    {
      key: 'cancelledBy',
      label: t('drawer.cancelledBy'),
      value: item.cancellation ? dl('cancellationParty', item.cancellation.responsibleParty) : null,
    },
    {
      key: 'cancelReason',
      label: t('drawer.cancelReason'),
      value: item.cancellation
        ? dl('cancellationReasonCategory', item.cancellation.reasonCategory)
        : null,
    },
    {
      key: 'cancelNote',
      label: t('drawer.cancelNote'),
      value: item.cancellation?.reason ?? null,
      wide: true,
      multiline: true,
    },
  ].filter((f) => f.value);

  return (
    <section className={styles.card} aria-label={t('drawer.record')}>
      <h3 className={styles.cardTitle}>{t('drawer.record')}</h3>
      {item.rebookedLater ? (
        <Alert type="success" showIcon title={t('drawer.rebookedLater')} />
      ) : null}
      <dl className={styles.facts}>
        {facts.map((f) => (
          <div key={f.key} className={f.wide ? styles.factWide : undefined}>
            <dt className={styles.factLabel}>{f.label}</dt>
            <dd className={styles.factValue}>{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Liên hệ khách: SĐT đã che → "Hiện số để gọi" (mỗi lần mở ghi audit) → Gọi · Zalo · Sao chép.
 * Không gộp "mở số" với "gọi" vào MỘT cú bấm: trình duyệt chặn cửa sổ Zalo mở sau một lời gọi mạng.
 */
function ContactCard({ item }: { item: FollowUp }) {
  const t = useTranslations('AdminFollowUps.contact');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const reveal = useRevealFollowUpContact(item.id);
  const canReveal = has(PERMISSION.PLATFORM_CUSTOMER_PII_VIEW);
  const phone = reveal.data?.customerPhone ?? null;
  const email = reveal.data?.customerEmail ?? null;
  const tel = telHref(phone);
  const zalo = zaloHref(phone);

  return (
    <section className={styles.card} aria-label={t('title')}>
      <h3 className={styles.cardTitle}>{t('title')}</h3>
      <div className={styles.contactName}>{item.customerName}</div>
      <div className={styles.contactPhone}>
        <span className={styles.phoneValue}>{phone ?? item.customerPhoneMasked ?? '—'}</span>
        {phone ? <CopyButton value={phone} label={t('copy')} copiedLabel={t('copied')} /> : null}
      </div>
      {email ? <div className={styles.meta}>{email}</div> : null}
      {phone ? (
        <div className={styles.contactActions}>
          {tel ? (
            <Button type="primary" icon={<PhoneOutlined aria-hidden="true" />} href={tel}>
              {t('call')}
            </Button>
          ) : null}
          {zalo ? (
            <Button
              icon={<MessageOutlined aria-hidden="true" />}
              href={zalo}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('zalo')}
            </Button>
          ) : null}
        </div>
      ) : canReveal ? (
        <div className={styles.contactActions}>
          <Button
            type="primary"
            icon={<EyeOutlined aria-hidden="true" />}
            loading={reveal.isPending}
            onClick={() =>
              reveal.mutate(undefined, { onError: (e) => void message.error(errorMessage(e)) })
            }
          >
            {t('reveal')}
          </Button>
        </div>
      ) : (
        <p className={styles.meta}>{t('noPermission')}</p>
      )}
      {canReveal ? <p className={styles.meta}>{t('audit')}</p> : null}
    </section>
  );
}

/** `withContact` = false ở form sửa: mốc liên hệ đã hiện ngay dưới ô "Đã gọi cho khách". */
function LastUpdateFacts({ item, withContact = true }: { item: FollowUp; withContact?: boolean }) {
  const t = useTranslations('AdminFollowUps.drawer');
  const fmt = useAppFormat();
  const facts: WorkDrawerFact[] = [
    {
      key: 'lastContacted',
      label: t('lastContacted'),
      value: withContact && item.lastContactedAt ? fmt.dateTime(item.lastContactedAt) : null,
    },
    {
      key: 'lastUpdate',
      label: t('lastUpdate'),
      value:
        item.followUpUpdatedAt && item.followUpUpdatedByName
          ? t('lastUpdateValue', {
              name: item.followUpUpdatedByName,
              date: fmt.dateTime(item.followUpUpdatedAt),
            })
          : null,
    },
  ].filter((f) => f.value);
  return <WorkDrawerFacts items={facts} />;
}

function ReadOnlyResult({ item }: { item: FollowUp }) {
  const t = useTranslations('AdminFollowUps');
  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>{t('drawer.side')}</h3>
      <WorkDrawerFacts
        items={[
          {
            key: 'assignee',
            label: t('form.assignee'),
            value: item.assigneeName ?? t('form.unassigned'),
          },
          ...(item.note
            ? [
                {
                  key: 'note',
                  label: t('form.note'),
                  value: item.note,
                  wide: true,
                  multiline: true,
                },
              ]
            : []),
        ]}
      />
      <LastUpdateFacts item={item} />
    </section>
  );
}

function FollowUpForm({
  formId,
  item,
  update,
  onSaved,
}: {
  formId: string;
  item: FollowUp;
  update: ReturnType<typeof useUpdateFollowUp>;
  onSaved: (updated: FollowUp) => void;
}) {
  const t = useTranslations('AdminFollowUps');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const me = useCurrentUser();
  const fmt = useAppFormat();
  const dl = useDomainLabel();

  const schema = useMemo(
    () =>
      yup.object({
        status: yup.mixed<FollowUpStatus>().oneOf(FOLLOW_UP_STATUS_VALUES).required(),
        note: yup
          .string()
          .max(FOLLOW_UP_NOTE_MAX_LENGTH, t('form.noteTooLong', { max: FOLLOW_UP_NOTE_MAX_LENGTH }))
          .defined(),
        markContacted: yup.boolean().defined(),
        assigneeUserId: yup.string().nullable().defined(),
      }),
    [t],
  );

  const { control, handleSubmit, reset } = useForm<FollowUpFormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      status: item.followUpStatus as FollowUpStatus,
      note: item.note ?? '',
      markContacted: Boolean(item.lastContactedAt),
      assigneeUserId: item.assigneeUserId,
    },
  });
  const assignees = useFollowUpAssignees(true);
  const myId = me.data?.id ?? null;
  /*
   * "Tôi" đứng đầu danh sách. Người đang phụ trách mà đã mất quyền (đổi vai) vẫn hiện là một lựa
   * chọn để ô không rơi về trống một cách khó hiểu — lưu lại với người đó thì server từ chối.
   */
  const assigneeOptions = useMemo(() => {
    const list = assignees.data ?? [];
    const options = [...list]
      .sort((a, b) => Number(b.id === myId) - Number(a.id === myId))
      .map((a) => ({
        value: a.id,
        label: t('form.assigneeOption', {
          name: a.id === myId ? t('form.assigneeMe', { name: a.displayName }) : a.displayName,
          role: dl('platformRole', a.roleKey),
        }),
      }));
    if (item.assigneeUserId && !list.some((a) => a.id === item.assigneeUserId)) {
      options.push({ value: item.assigneeUserId, label: item.assigneeName ?? item.assigneeUserId });
    }
    return options;
  }, [assignees.data, item.assigneeUserId, item.assigneeName, myId, t, dl]);

  const onSubmit = handleSubmit((values) => {
    if (update.isPending) return;
    update.mutate(
      {
        id: item.id,
        body: {
          status: values.status,
          note: values.note.trim() || null,
          assigneeUserId: values.assigneeUserId,
          markContacted: values.markContacted,
        },
      },
      {
        onSuccess: (updated) => {
          void message.success(t('form.saved'));
          // Form nhận lại đúng giá trị server vừa lưu — "đã gọi" là TRẠNG THÁI, mốc giờ hiện dưới ô.
          reset({
            status: updated.followUpStatus as FollowUpStatus,
            note: updated.note ?? '',
            markContacted: Boolean(updated.lastContactedAt),
            assigneeUserId: updated.assigneeUserId,
          });
          onSaved(updated);
        },
        onError: (error) => void message.error(errorMessage(error)),
      },
    );
  });

  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>{t('drawer.side')}</h3>
      <form id={formId} className={styles.form} onSubmit={onSubmit} noValidate>
        <Form layout="vertical" component={false}>
          <div className={styles.formGrid}>
            <div className={styles.formCol}>
              <SelectField<FollowUpFormValues>
                control={control}
                name="status"
                label={t('form.status')}
                required
                options={FOLLOW_UP_STATUS_VALUES.map((value) => ({
                  value,
                  label: t(`status.${value}`),
                }))}
              />
              <SelectField<FollowUpFormValues>
                control={control}
                name="assigneeUserId"
                label={t('form.assignee')}
                placeholder={t('form.unassigned')}
                options={assigneeOptions}
                loading={assignees.isPending}
                notFoundContent={t('form.noAssignees')}
                help={t('form.assigneeHelp')}
                allowClear
                showSearch
              />
              <CheckboxField<FollowUpFormValues>
                control={control}
                name="markContacted"
                help={
                  item.lastContactedAt
                    ? t('form.lastContacted', { date: fmt.dateTime(item.lastContactedAt) })
                    : t('form.neverContacted')
                }
              >
                {t('form.markContacted')}
              </CheckboxField>
            </div>
            <div className={styles.formCol}>
              <TextAreaField<FollowUpFormValues>
                control={control}
                name="note"
                label={t('form.note')}
                placeholder={t('form.notePlaceholder')}
                rows={4}
                maxLength={FOLLOW_UP_NOTE_MAX_LENGTH}
                showCount
              />
            </div>
          </div>
        </Form>
      </form>
      <LastUpdateFacts item={item} withContact={false} />
    </section>
  );
}
