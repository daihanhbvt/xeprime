import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SERVICE_TYPE } from '@xeprime/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ListingServiceSelector } from './ListingServiceSelector';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams('routeType=inter_city&from=search'),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => '/listings/vehicle-1',
  useSearchParams: () => nav.params,
}));

const ALL_SERVICES = [
  SERVICE_TYPE.SELF_DRIVE,
  SERVICE_TYPE.WITH_DRIVER,
  SERVICE_TYPE.LONG_TERM,
];

beforeEach(() => {
  nav.replace.mockReset();
  nav.params = new URLSearchParams('routeType=inter_city&from=search');
});

afterEach(cleanup);

describe('ListingServiceSelector', () => {
  it('hiển thị từng dịch vụ thành badge riêng và đánh dấu badge đang chọn', () => {
    render(<ListingServiceSelector services={ALL_SERVICES} active={SERVICE_TYPE.SELF_DRIVE} />);

    expect(screen.getByRole('button', { name: 'Tự lái' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Có tài xế' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thuê dài hạn' })).toBeTruthy();
  });

  it('đổi dịch vụ và xoá lộ trình khi lựa chọn không phải xe có tài xế', () => {
    render(<ListingServiceSelector services={ALL_SERVICES} active={SERVICE_TYPE.SELF_DRIVE} />);

    fireEvent.click(screen.getByRole('button', { name: 'Thuê dài hạn' }));

    expect(nav.replace).toHaveBeenCalledWith(
      '/listings/vehicle-1?from=search&serviceType=long_term',
      { scroll: false },
    );
  });

  it('dịch vụ duy nhất vẫn hiện rõ dưới dạng label, không giả làm nút có thể bấm', () => {
    render(
      <ListingServiceSelector
        services={[SERVICE_TYPE.WITH_DRIVER]}
        active={SERVICE_TYPE.WITH_DRIVER}
      />,
    );

    expect(screen.getByText('Có tài xế')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Có tài xế' })).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
