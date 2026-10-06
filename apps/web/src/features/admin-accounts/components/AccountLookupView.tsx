'use client';

import { SearchOutlined } from '@ant-design/icons';
import { Button, Input, Segmented, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import {
  ACCOUNT_REALM,
  USER_STATUS_META,
  type AccountRealm,
  type UserStatus,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useAccountLookup, useAccountLookupFilters } from '../hooks';
import { ACCOUNT_LOOKUP_MODE, type AccountLookupItem, type AccountLookupMode } from '../types';
import styles from './AccountLookupView.module.css';

/** Màu nhãn realm — mỗi không gian một màu để ba dòng của cùng một SĐT phân biệt được bằng mắt. */
const REALM_TAG_COLOR: Record<AccountRealm, string> = {
  [ACCOUNT_REALM.CUSTOMER]: 'blue',
  [ACCOUNT_REALM.PARTNER]: 'green',
  [ACCOUNT_REALM.PLATFORM]: 'gold',
};

const MIN_TABLE_WIDTH = 900;

/**
 * Tra cứu XUYÊN REALM cho hỗ trợ — ADR 0053 điều 9 (B4).
 *
 * Một số điện thoại có thể là tài khoản khách, tài khoản đối tác và tài khoản quản trị — ba tài khoản,
 * ba mật khẩu. Màn "Khách thuê" và "Đối tác" mỗi màn chỉ thấy realm của nó; đây là nơi duy nhất trả
 * lời "số này là những tài khoản nào", mỗi dòng ghi rõ realm. Chỉ đọc, liên hệ đã che ở server, khớp
 * CHÍNH XÁC — không tìm gần đúng.
 */
export function AccountLookupView() {
  const t = useTranslations('AdminAccounts');
  const dl = useDomainLabel();
  const format = useAppFormat();
  const errorMessage = useErrorMessage();
  const { filters, setFilters } = useAccountLookupFilters();
  const { data, isFetching, isError, error, refetch } = useAccountLookup(filters);

  const [mode, setMode] = useState<AccountLookupMode>(
    filters.email ? ACCOUNT_LOOKUP_MODE.EMAIL : ACCOUNT_LOOKUP_MODE.PHONE,
  );
  const [value, setValue] = useState(filters.phone ?? filters.email ?? '');
  const [missing, setMissing] = useState(false);

  const hasQuery = Boolean(filters.phone || filters.email);

  function submit(event: FormEvent) {
    event.preventDefault();
    const term = value.trim();
    if (!term) {
      setMissing(true);
      return;
    }
    setMissing(false);
    setFilters(
      mode === ACCOUNT_LOOKUP_MODE.PHONE
        ? { phone: term, email: undefined }
        : { email: term, phone: undefined },
    );
    // Tra lại đúng định danh đang hiện (URL không đổi) vẫn phải lấy dữ liệu mới.
    if (term === (filters.phone ?? filters.email)) void refetch();
  }

  function roleOf(row: AccountLookupItem): string {
    if (row.realm === ACCOUNT_REALM.PLATFORM && row.platformRoleKey) {
      return dl('platformRole', row.platformRoleKey);
    }
    if (row.realm === ACCOUNT_REALM.PARTNER && row.tenantRoleKey) {
      const role = dl('tenantRole', row.tenantRoleKey);
      return row.tenantName ? t('roleInTenant', { role, tenant: row.tenantName }) : role;
    }
    return '—';
  }

  const columns: DataTableColumn<AccountLookupItem>[] = [
    {
      title: t('columns.account'),
      key: 'account',
      width: 240,
      render: (_, row) => (
        <EntityIdentity
          kind="person"
          size="sm"
          initialSource={row.displayName}
          name={row.displayName}
          subtitle={row.id}
        />
      ),
    },
    {
      title: t('columns.realm'),
      key: 'realm',
      width: 150,
      render: (_, row) => (
        <Tag color={REALM_TAG_COLOR[row.realm]}>{dl('accountRealm', row.realm)}</Tag>
      ),
    },
    {
      title: t('columns.contact'),
      key: 'contact',
      width: 200,
      render: (_, row) => (
        <div className={styles.contact}>
          <span>{row.phoneMasked ?? '—'}</span>
          <span className={styles.muted}>{row.emailMasked ?? '—'}</span>
        </div>
      ),
    },
    { title: t('columns.role'), key: 'role', width: 200, render: (_, row) => roleOf(row) },
    {
      title: t('columns.status'),
      key: 'status',
      width: 130,
      render: (_, row) => (
        <StatusTag value={row.status as UserStatus} meta={USER_STATUS_META} group="userStatus" />
      ),
    },
    {
      title: t('columns.createdAt'),
      key: 'createdAt',
      width: 130,
      render: (_, row) => format.date(row.createdAt),
    },
  ];

  return (
    <div>
      <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} />

      <form className={styles.form} onSubmit={submit} noValidate>
        <Segmented<AccountLookupMode>
          aria-label={t('form.mode')}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setMissing(false);
          }}
          options={[
            { value: ACCOUNT_LOOKUP_MODE.PHONE, label: t('form.byPhone') },
            { value: ACCOUNT_LOOKUP_MODE.EMAIL, label: t('form.byEmail') },
          ]}
        />
        <Input
          className={styles.input}
          size="large"
          allowClear
          inputMode={mode === ACCOUNT_LOOKUP_MODE.PHONE ? 'tel' : 'email'}
          type={mode === ACCOUNT_LOOKUP_MODE.PHONE ? 'tel' : 'email'}
          aria-label={mode === ACCOUNT_LOOKUP_MODE.PHONE ? t('form.byPhone') : t('form.byEmail')}
          placeholder={
            mode === ACCOUNT_LOOKUP_MODE.PHONE
              ? t('form.phonePlaceholder')
              : t('form.emailPlaceholder')
          }
          status={missing ? 'error' : undefined}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (missing) setMissing(false);
          }}
        />
        <Button
          type="primary"
          size="large"
          htmlType="submit"
          icon={<SearchOutlined />}
          loading={isFetching}
        >
          {t('form.submit')}
        </Button>
      </form>
      {missing ? (
        <p className={styles.error} role="alert">
          {t('form.required')}
        </p>
      ) : null}

      <DataTable<AccountLookupItem>
        label={t('page.tableLabel')}
        columns={columns}
        items={hasQuery ? (data ?? []) : []}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={hasQuery && isFetching}
        error={
          hasQuery && isError
            ? {
                title: t('states.error'),
                description: errorMessage(error),
                onRetry: () => void refetch(),
              }
            : null
        }
        empty={{ title: hasQuery ? t('states.empty') : t('states.idle') }}
      />
    </div>
  );
}
