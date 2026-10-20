import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_TYPE } from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';

import {
  localizeCatalog,
  localizeCatalogItem,
  type CatalogItem,
  type CatalogItemAdmin,
} from '../types';
import { CatalogItemFormModal } from './CatalogItemFormModal';

/**
 * Nhãn danh mục hai ngôn ngữ (ADR 0012): admin nhập bản tiếng Anh ở form danh mục; giao diện chọn
 * bản theo ngôn ngữ ở MỘT chỗ (`localizeCatalog`), mục chưa dịch giữ nhãn gốc.
 */

const mutations = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock('../use-admin-catalog', () => ({
  useCreateCatalogItem: () => ({ mutate: mutations.create, isPending: false }),
  useUpdateCatalogItem: () => ({ mutate: mutations.update, isPending: false }),
}));

function feature(overrides: Partial<CatalogItemAdmin> = {}): CatalogItemAdmin {
  return {
    id: 'cat-usb',
    type: CATALOG_TYPE.VEHICLE_FEATURE,
    key: 'usb',
    label: 'Cổng USB',
    labelEn: 'USB port',
    description: 'Sạc điện thoại',
    descriptionEn: null,
    iconUrl: null,
    showOnHome: false,
    showcaseImageUrl: null,
    showcaseExamples: null,
    sortOrder: 0,
    active: true,
    vehicleTypes: ['car'],
    usageCount: 3,
    ...overrides,
  };
}

beforeEach(() => {
  mutations.create.mockReset();
  mutations.update.mockReset();
});
afterEach(cleanup);

describe('localizeCatalog', () => {
  it('tiếng Anh: dùng bản dịch; mục chưa dịch (tên hãng) giữ nhãn gốc', () => {
    const usb = feature();
    const brand: CatalogItem = {
      ...feature(),
      type: CATALOG_TYPE.VEHICLE_BRAND,
      key: 'toyota',
      label: 'Toyota',
      labelEn: null,
    };

    expect(localizeCatalogItem(usb, 'en').label).toBe('USB port');
    // Dòng phụ chưa dịch ⇒ giữ bản gốc, không để trống.
    expect(localizeCatalogItem(usb, 'en').description).toBe('Sạc điện thoại');
    expect(localizeCatalogItem(brand, 'en').label).toBe('Toyota');
    // Tiếng Việt: không đụng gì.
    expect(localizeCatalogItem(usb, 'vi')).toBe(usb);

    const map = localizeCatalog(
      { vehicle_brand: [brand], body_type: [], fuel_type: [], vehicle_feature: [usb] },
      'en',
    );
    expect(map.vehicle_feature[0]?.label).toBe('USB port');
    expect(map.vehicle_brand[0]?.label).toBe('Toyota');
  });
});

describe('CatalogItemFormModal — bản tiếng Anh', () => {
  function renderForm(item: CatalogItemAdmin | null) {
    return renderWithIntl(
      <App>
        <CatalogItemFormModal
          open
          type={CATALOG_TYPE.VEHICLE_FEATURE}
          item={item}
          onClose={vi.fn()}
        />
      </App>,
    );
  }

  it('thêm mới: gửi kèm tên tiếng Anh đã cắt khoảng trắng', async () => {
    renderForm(null);
    fireEvent.change(screen.getByLabelText('Mã'), { target: { value: 'wireless_charging' } });
    fireEvent.change(screen.getByLabelText('Tên hiển thị'), { target: { value: 'Sạc không dây' } });
    fireEvent.change(screen.getByLabelText('Tên tiếng Anh'), {
      target: { value: '  Wireless charging ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    await waitFor(() => expect(mutations.create).toHaveBeenCalled());
    expect(mutations.create.mock.calls[0]?.[0]).toMatchObject({
      key: 'wireless_charging',
      label: 'Sạc không dây',
      labelEn: 'Wireless charging',
      descriptionEn: null,
    });
  });

  it('sửa: xoá trống tên tiếng Anh ⇒ gửi null (gỡ bản dịch, dùng lại tên gốc)', async () => {
    renderForm(feature());
    const labelEn = screen.getByLabelText('Tên tiếng Anh') as HTMLInputElement;
    expect(labelEn.value).toBe('USB port');
    fireEvent.change(labelEn, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(mutations.update).toHaveBeenCalled());
    expect(mutations.update.mock.calls[0]?.[0]).toMatchObject({ id: 'cat-usb', labelEn: null });
  });
});
