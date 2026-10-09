import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriverLicence, DriverLicenceOverview } from '../types';
import { DriverLicenceVerifier } from './DriverLicenceVerifier';

/**
 * Bộ xác thực bằng lái (ADR 0057) — màn hình do TRẠNG THÁI SERVER quyết.
 *
 * Bộ này khoá năm lời hứa với khách: thấy đúng việc phải làm ở mỗi trạng thái; bị từ chối thì
 * biết VÌ SAO và chụp lại thế nào; chỉ thấy nút "nhờ xem lại" khi server cho phép; bằng hợp lệ
 * nhưng không đủ cho CHUYẾN này thì được nói rõ; và ảnh chọn sai được báo trước khi gửi. Chọn ảnh
 * xong là gửi luôn, và tiến trình hiện NGAY TRONG khung đang đứng — không đổi bố cục.
 */

const query = vi.hoisted(() => ({
  data: undefined as DriverLicenceOverview | undefined,
  isPending: false,
  isError: false,
  refetch: vi.fn(),
}));
const review = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const submit = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
}));
const prepare = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock('../hooks/use-driver-licence', () => ({
  useDriverLicence: () => query,
  useDriverLicenceImage: () => ({ data: undefined }),
  useRequestDriverLicenceReview: () => review,
  useSubmitDriverLicence: () => submit,
}));
vi.mock('../prepare-licence-image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../prepare-licence-image')>()),
  prepareLicenceImage: (...a: unknown[]) => prepare.fn(...a),
}));

const BASE: DriverLicence = {
  id: 'L1',
  status: 'verified',
  kind: 'vn',
  licenceNumber: '790123456789',
  fullName: 'NGUYỄN VĂN AN',
  dateOfBirth: '1990-04-12',
  classes: ['B2'],
  issuedOn: '2021-03-15',
  expiresOn: '2031-03-15',
  noExpiry: false,
  issuingCountry: 'VN',
  coversCar: true,
  coversMotorbike: false,
  rejectionReason: null,
  reviewNote: null,
  qualityIssues: [],
  canRequestReview: false,
  reviewRequestedAt: null,
  decisionSource: 'auto',
  decidedAt: '2026-10-01T00:00:00.000Z',
  submittedAt: '2026-10-01T00:00:00.000Z',
};

function renderVerifier(trip?: { vehicleType: string; lastDayKey: string }) {
  return render(
    <App>
      <DriverLicenceVerifier trip={trip} />
    </App>,
  );
}

beforeEach(() => {
  query.data = { verified: null, latest: null };
  query.isPending = false;
  query.isError = false;
  review.mutate.mockReset();
  submit.mutate.mockReset();
  submit.isPending = false;
  prepare.fn.mockReset();
});

afterEach(cleanup);

describe('DriverLicenceVerifier', () => {
  it('chưa nộp: lời mời, chụp ảnh (điện thoại) / kéo thả (máy tính), giấy tờ được chấp nhận', () => {
    renderVerifier();
    expect(screen.getByText('Xác thực bằng lái xe')).toBeTruthy();
    expect(screen.getByText('Kéo thả hoặc bấm để chọn ảnh')).toBeTruthy();
    // Khung chọn là MỘT nút: kéo thả / bấm (chuột) và chạm để chụp (cảm ứng) — CSS chọn câu hiện.
    expect(screen.getByRole('button', { name: /Chạm để chụp mặt trước bằng lái/ })).toBeTruthy();
    // Dòng "Khi chọn ảnh, bạn đồng ý…" đã bỏ.
    expect(screen.queryByText(/bạn đồng ý/)).toBeNull();
    expect(screen.getByText(/Giấy phép lái xe quốc tế \(IDP\)/)).toBeTruthy();
    // Mục "Để được xác thực ngay" đã bỏ, không còn bước "Gửi để xác thực".
    expect(screen.queryByText(/Để được xác thực ngay/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Gửi để xác thực/ })).toBeNull();
  });

  it('đã xác thực: hiện thông tin trên bằng và loại xe lái được', () => {
    query.data = { verified: BASE, latest: BASE };
    renderVerifier();
    expect(screen.getByText('Bằng lái đã được xác thực')).toBeTruthy();
    expect(screen.getByText('NGUYỄN VĂN AN')).toBeTruthy();
    expect(screen.getByText('790123456789')).toBeTruthy();
    expect(screen.getByText('Ô tô')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cập nhật bằng mới' })).toBeTruthy();
  });

  it('đang đọc ảnh: tiến trình nằm TRONG khung cũ (lời mời + giấy tờ chấp nhận vẫn còn)', () => {
    query.data = { verified: null, latest: { ...BASE, status: 'processing' } };
    renderVerifier();
    expect(screen.getByText('Đang xác thực bằng lái')).toBeTruthy();
    expect(screen.getByText('Đọc thông tin trên bằng')).toBeTruthy();
    expect(screen.getByText('Xác thực bằng lái xe')).toBeTruthy();
    expect(screen.getByText(/Giấy phép lái xe quốc tế \(IDP\)/)).toBeTruthy();
    // Đang đọc thì không cho chọn ảnh khác chen ngang.
    expect(screen.queryByText('Kéo thả hoặc bấm để chọn ảnh')).toBeNull();
  });

  it('đang tải ảnh lên: cũng là tiến trình tại chỗ, bước tải lên đang chạy', () => {
    submit.isPending = true;
    renderVerifier();
    expect(screen.getByText('Đang xác thực bằng lái')).toBeTruthy();
    expect(screen.getByText('Tải ảnh lên')).toBeTruthy();
    expect(screen.getByText('Xác thực bằng lái xe')).toBeTruthy();
  });

  it('bị máy từ chối vì ảnh mờ: lý do + mẹo chụp lại + nút nhờ xem lại', () => {
    query.data = {
      verified: null,
      latest: {
        ...BASE,
        status: 'rejected',
        rejectionReason: 'unreadable',
        qualityIssues: ['glare'],
        canRequestReview: true,
      },
    };
    renderVerifier();
    expect(screen.getByText('Chưa xác thực được bằng lái')).toBeTruthy();
    expect(screen.getByText('Ảnh chưa đủ rõ để đọc thông tin trên bằng.')).toBeTruthy();
    expect(screen.getByText(/Ảnh bị loá/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /nhờ XePrime kiểm tra/ }));
    expect(review.mutate).toHaveBeenCalledWith('L1', expect.anything());
  });

  it('bằng nước ngoài đã xác thực: nói rõ chủ xe đối chiếu hạng và hạn khi giao xe', () => {
    const foreign: DriverLicence = {
      ...BASE,
      kind: 'foreign',
      licenceNumber: 'D1234567',
      classes: [],
      expiresOn: null,
      coversMotorbike: true,
    };
    query.data = { verified: foreign, latest: foreign };
    renderVerifier();
    expect(screen.getByText(/chủ xe đối chiếu hạng và thời hạn trên bằng gốc/)).toBeTruthy();
  });

  it('máy từ chối vì HẾT HẠN: hiện ngày máy đọc được + được nhờ xem lại (máy có thể đọc lệch)', () => {
    query.data = {
      verified: null,
      latest: {
        ...BASE,
        status: 'rejected',
        rejectionReason: 'expired',
        expiresOn: '2026-10-05',
        canRequestReview: true,
      },
    };
    renderVerifier();
    expect(screen.getByText('Bằng lái đã hết hạn ngày 05/10/2026.')).toBeTruthy();
    expect(screen.getByText(/Máy có thể đọc nhầm/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /nhờ XePrime kiểm tra/ })).toBeTruthy();
  });

  it('người duyệt đã từ chối vì hết hạn: không còn nút, không mời nhờ kiểm tra', () => {
    query.data = {
      verified: null,
      latest: {
        ...BASE,
        status: 'rejected',
        rejectionReason: 'expired',
        expiresOn: '2024-05-20',
        decisionSource: 'manual',
        canRequestReview: false,
      },
    };
    renderVerifier();
    expect(screen.getByText('Bằng lái đã hết hạn ngày 20/05/2024.')).toBeTruthy();
    expect(screen.queryByText(/Máy có thể đọc nhầm/)).toBeNull();
    expect(screen.queryByRole('button', { name: /nhờ XePrime kiểm tra/ })).toBeNull();
  });

  it('chờ duyệt: báo đang chờ và cho gửi ảnh khác', () => {
    query.data = { verified: null, latest: { ...BASE, status: 'pending_review' } };
    renderVerifier();
    expect(screen.getByText('Đang chờ XePrime xác thực')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi ảnh khác' }));
    expect(screen.getByText('Kéo thả hoặc bấm để chọn ảnh')).toBeTruthy();
  });

  it('bằng hợp lệ nhưng hết hạn trước ngày trả xe: nói rõ ngày hết hạn, mời cập nhật', () => {
    query.data = { verified: BASE, latest: BASE };
    renderVerifier({ vehicleType: 'car', lastDayKey: '2031-03-20' });
    expect(screen.getByText(/hết hạn ngày 15\/03\/2031, trước khi chuyến kết thúc/)).toBeTruthy();
    expect(screen.getByText('Kéo thả hoặc bấm để chọn ảnh')).toBeTruthy();
  });

  it('bằng ô tô đặt xe máy: báo hạng không phù hợp', () => {
    query.data = { verified: BASE, latest: BASE };
    renderVerifier({ vehicleType: 'motorbike', lastDayKey: '2027-01-01' });
    expect(screen.getByText(/không lái được xe máy/)).toBeTruthy();
  });

  it('ảnh quá nhỏ: báo ngay, KHÔNG gửi', async () => {
    const { PrepareImageError } = await import('../prepare-licence-image');
    prepare.fn.mockRejectedValue(new PrepareImageError('tooSmall'));
    const { container } = renderVerifier();
    const input = container.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
    });

    expect(await screen.findByText(/Ảnh quá nhỏ để đọc rõ chữ/)).toBeTruthy();
    expect(submit.mutate).not.toHaveBeenCalled();
  });

  it('bị từ chối rồi chọn ảnh MỚI: lý do cũ ẩn ngay, chỉ còn lời mời trong lúc ảnh mới được đọc', async () => {
    prepare.fn.mockResolvedValue(new File(['y'], 'driver-licence.jpg', { type: 'image/jpeg' }));
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:new'), revokeObjectURL: vi.fn() });
    query.data = {
      verified: null,
      latest: { ...BASE, status: 'rejected', rejectionReason: 'not_a_licence' },
    };
    const { container } = renderVerifier();
    expect(screen.getByText('Chưa xác thực được bằng lái')).toBeTruthy();

    const input = container.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'b.jpg', { type: 'image/jpeg' })] },
    });

    await waitFor(() => expect(screen.queryByText('Chưa xác thực được bằng lái')).toBeNull());
    expect(screen.getByText('Xác thực bằng lái xe')).toBeTruthy();
  });

  it('chọn ảnh xong là GỬI NGAY — không có bước xem trước / bấm gửi', async () => {
    const prepared = new File(['y'], 'driver-licence.jpg', { type: 'image/jpeg' });
    prepare.fn.mockResolvedValue(prepared);
    const createObjectURL = vi.fn(() => 'blob:preview');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    const { container } = renderVerifier();
    const input = container.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.heic', { type: 'image/heic' })] },
    });

    await waitFor(() =>
      expect(submit.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ file: prepared }),
        expect.anything(),
      ),
    );
  });

  it('chụp bằng camera (ô chọn có capture) cũng gửi ngay', async () => {
    const prepared = new File(['y'], 'driver-licence.jpg', { type: 'image/jpeg' });
    prepare.fn.mockResolvedValue(prepared);
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:cam'), revokeObjectURL: vi.fn() });

    const { container } = renderVerifier();
    const camera = container.querySelector('input[type="file"][capture]') as HTMLInputElement;
    fireEvent.change(camera, {
      target: { files: [new File(['x'], 'cam.jpg', { type: 'image/jpeg' })] },
    });

    await waitFor(() => expect(submit.mutate).toHaveBeenCalledTimes(1));
  });
});
