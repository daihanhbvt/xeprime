'use client';

import { SearchOutlined, WarningFilled } from '@ant-design/icons';
import { normalizeCatalogSearch } from '@xeprime/types';
import { Input, Select } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { cx } from '@/lib/cx';

import styles from './CatalogBrandList.module.css';

export interface CatalogBrandEntry {
  key: string;
  label: string;
  iconUrl: string | null;
  /** Hãng đang tắt trong danh mục — vẫn quản lý mẫu được, chỉ hiện mờ. */
  active: boolean;
  total: number;
  missingSpecs: number;
}

/**
 * Cột HÃNG của màn quản trị mẫu xe: mỗi hãng một dòng kèm số mẫu và số mẫu còn thiếu thông số.
 *
 * Trả lời câu hỏi mà bảng phẳng cũ không trả lời được — "hãng nào có những mẫu nào" — trước khi
 * người quản trị phải bấm vào bất cứ đâu. Màn hẹp (dưới 960px) thay cột bằng một ô chọn đặt trên
 * bảng: một cột 260px cạnh bảng ở màn điện thoại là bảng không còn chỗ.
 */
export function CatalogBrandList({
  brands,
  selectedKey,
  onSelect,
  loading,
  error,
}: {
  brands: readonly CatalogBrandEntry[];
  selectedKey: string | null;
  onSelect: (brandKey: string) => void;
  loading: boolean;
  error: { onRetry: () => void } | null;
}) {
  const t = useTranslations('AdminCatalog.models');
  const tCommon = useTranslations('Common');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = normalizeCatalogSearch(query);
    return needle
      ? brands.filter((b) => normalizeCatalogSearch(b.label).includes(needle))
      : brands;
  }, [brands, query]);

  const selectOptions = useMemo(
    () =>
      brands.map((b) => ({
        value: b.key,
        label: `${b.label} · ${t('brandModelCount', { count: b.total })}`,
      })),
    [brands, t],
  );

  let body;
  if (loading && brands.length === 0) {
    body = <LoadingState variant="inline" label={tCommon('states.loading')} />;
  } else if (error && brands.length === 0) {
    body = <EmptyState variant="error" title={t('brandsLoadError')} onRetry={error.onRetry} />;
  } else if (visible.length === 0) {
    body = <p className={styles.noMatch}>{t('brandNoMatch')}</p>;
  } else {
    body = (
      <ul className={styles.list}>
        {visible.map((brand) => {
          const selected = brand.key === selectedKey;
          return (
            <li key={brand.key}>
              <button
                type="button"
                className={cx(
                  styles.item,
                  selected && styles.selected,
                  !brand.active && styles.inactive,
                )}
                aria-current={selected ? 'true' : undefined}
                title={brand.active ? undefined : t('brandInactive')}
                onClick={() => onSelect(brand.key)}
              >
                <BrandLogo brand={brand} />
                <span className={styles.text}>
                  <span className={styles.name}>{brand.label}</span>
                  <span className={styles.count}>
                    {t('brandModelCount', { count: brand.total })}
                  </span>
                </span>
                {brand.missingSpecs > 0 ? (
                  <span
                    className={styles.warning}
                    aria-label={t('brandMissingBadge', { count: brand.missingSpecs })}
                    title={t('brandMissingBadge', { count: brand.missingSpecs })}
                  >
                    <WarningFilled aria-hidden />
                    {brand.missingSpecs}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      <nav className={styles.column} aria-label={t('brandsTitle')}>
        <div className={styles.header}>
          <span className={styles.title}>{t('brandsTitle')}</span>
          <Input
            allowClear
            prefix={<SearchOutlined aria-hidden />}
            placeholder={t('brandSearch')}
            aria-label={t('brandSearchAria')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {body}
      </nav>

      <div className={styles.compact}>
        <Select
          className={styles.compactSelect}
          value={selectedKey ?? undefined}
          onChange={onSelect}
          options={selectOptions}
          placeholder={t('brandPicker')}
          aria-label={t('brandPicker')}
          loading={loading}
          showSearch
          optionFilterProp="label"
        />
      </div>
    </>
  );
}

/** Logo hãng nếu danh mục có ảnh, không thì chữ cái đầu — ô vuông cố định để tên hãng thẳng hàng. */
function BrandLogo({ brand }: { brand: CatalogBrandEntry }) {
  return (
    <span className={styles.logo} aria-hidden>
      {brand.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo hãng là ảnh tĩnh nhỏ do admin khai, có thể là URL ngoài
        <img src={brand.iconUrl} alt="" className={styles.logoImg} loading="lazy" />
      ) : (
        brand.label.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
