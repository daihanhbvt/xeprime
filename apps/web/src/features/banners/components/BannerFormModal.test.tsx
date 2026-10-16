import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Control, FieldValues } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BANNER_PLACEMENT, type BannerPlacement } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { AdminBanner } from '../types';
import { BannerFormModal } from './BannerFormModal';

const mutations = vi.hoisted(() => ({
  create: { mutate: vi.fn(), isPending: false },
  update: { mutate: vi.fn(), isPending: false },
}));

vi.mock('antd', async () =>
  (await import('@/test-utils/antd-mock')).asAntdModule({
    App: {
      useApp: () => ({ message: { success: vi.fn(), error: vi.fn() } }),
    },
    Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  }),
);

vi.mock('@ant-design/icons', () => ({
  DesktopOutlined: () => null,
  MobileOutlined: () => null,
  TabletOutlined: () => null,
}));

vi.mock('../use-admin-banners', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../use-admin-banners')>()),
  useCreateBanner: () => mutations.create,
  useUpdateBanner: () => mutations.update,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

// Vỏ AntD có animation/portal không liên quan tới regression này; giữ component form thật bên trong.
vi.mock('@/components/overlay/ResponsiveDialog', () => ({
  ResponsiveDialog: ({
    open,
    children,
    footer,
  }: {
    open: boolean;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog">
        {children}
        {footer}
      </div>
    ) : null,
}));

vi.mock('@/components/form/ImageUploadField', async () => {
  const { useController } = await import('react-hook-form');
  return {
    ImageUploadField: ({
      control,
      name,
      label,
    }: {
      control: unknown;
      name: string;
      label: ReactNode;
    }) => {
      const { field } = useController({
        control: control as Control<FieldValues>,
        name,
      });
      return (
        <div>
          <span>{label}</span>
          {field.value ? <img src={String(field.value)} alt={`Ảnh ${name}`} /> : null}
        </div>
      );
    },
  };
});

vi.mock('@/components/form/TextField', async () => {
  const { useController } = await import('react-hook-form');
  return {
    TextField: ({ control, name, label }: { control: unknown; name: string; label: ReactNode }) => {
      const { field } = useController({
        control: control as Control<FieldValues>,
        name,
      });
      return (
        <label>
          {label}
          <input {...field} value={field.value == null ? '' : String(field.value)} />
        </label>
      );
    },
  };
});

vi.mock('@/components/form/DateTimeField', () => ({ DateTimeField: () => null }));
vi.mock('@/components/form/SwitchField', () => ({ SwitchField: () => null }));

const oldBanner: AdminBanner = {
  id: 'old-banner',
  title: 'Banner cũ',
  imageUrl: 'https://example.com/desktop.jpg',
  tabletImageUrl: 'https://example.com/tablet.jpg',
  mobileImageUrl: 'https://example.com/mobile.jpg',
  altText: 'Nội dung cũ',
  linkUrl: '/old',
  placement: BANNER_PLACEMENT.HERO,
  sortOrder: 0,
  active: true,
  startsAt: null,
  endsAt: null,
  visibleNow: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function modal(
  open: boolean,
  banner: AdminBanner | null,
  placement: BannerPlacement = BANNER_PLACEMENT.HERO,
) {
  return <BannerFormModal open={open} placement={placement} banner={banner} onClose={vi.fn()} />;
}

beforeEach(() => {
  mutations.create.mutate.mockReset();
  mutations.update.mutate.mockReset();
});

describe('BannerFormModal', () => {
  it('mở phiên tạo mới không giữ thông tin và ảnh của phiên sửa trước', async () => {
    const view = renderWithIntl(modal(true, oldBanner));

    expect((screen.getByLabelText('Tên banner') as HTMLInputElement).value).toBe('Banner cũ');
    expect(screen.getByAltText('Ảnh imageUrl')).toBeTruthy();
    expect(screen.getByAltText('Ảnh tabletImageUrl')).toBeTruthy();
    expect(screen.getByAltText('Ảnh mobileImageUrl')).toBeTruthy();

    view.rerender(modal(false, oldBanner));
    view.rerender(modal(true, null));

    await waitFor(() =>
      expect((screen.getByLabelText('Tên banner') as HTMLInputElement).value).toBe(''),
    );
    expect(screen.queryByAltText('Ảnh imageUrl')).toBeNull();
    expect(screen.queryByAltText('Ảnh tabletImageUrl')).toBeNull();
    expect(screen.queryByAltText('Ảnh mobileImageUrl')).toBeNull();
    expect((screen.getByLabelText('Mô tả ảnh (alt)') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Đường dẫn khi bấm') as HTMLInputElement).value).toBe('');
  });

  /**
   * Banner khuyến mãi: không có ô tablet (tablet hiện như máy tính), và lượt SỬA không gửi lại vị
   * trí — vị trí đặt lúc tạo, API không cho đổi.
   */
  it('banner khuyến mãi: không có ô tablet; sửa không gửi vị trí và luôn bỏ ảnh tablet', async () => {
    const promo: AdminBanner = {
      ...oldBanner,
      id: 'promo-banner',
      placement: BANNER_PLACEMENT.PROMO,
      tabletImageUrl: null,
    };
    const view = renderWithIntl(modal(true, null, BANNER_PLACEMENT.PROMO));
    // Hộp thoại giả không vẽ tiêu đề — câu giới thiệu là dấu hiệu form đang ở vị trí khuyến mãi.
    expect(screen.getByText(/Tạo banner khuyến mãi cho giữa trang chủ/)).toBeTruthy();
    expect(screen.queryByText('Tablet')).toBeNull();
    expect(screen.getByText('Mobile')).toBeTruthy();

    view.rerender(modal(false, null, BANNER_PLACEMENT.PROMO));
    view.rerender(modal(true, promo, BANNER_PLACEMENT.HERO));
    await waitFor(() =>
      expect((screen.getByLabelText('Tên banner') as HTMLInputElement).value).toBe('Banner cũ'),
    );
    // Banner đang sửa giữ vị trí của CHÍNH nó, không theo tab đang mở.
    expect(screen.queryByText('Tablet')).toBeNull();

    fireEvent.submit(screen.getByRole('dialog').querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(mutations.update.mutate).toHaveBeenCalled());
    const [body] = mutations.update.mutate.mock.calls[0] as [Record<string, unknown>];
    expect(body).not.toHaveProperty('placement');
    expect(body.tabletImageUrl).toBeNull();
  });
});
