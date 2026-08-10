import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, type Permission } from '@xeprime/types';

import NewVehiclePage from './page';

/**
 * `/manage/vehicles/new` — tạo xe, hình thái **wizard năm bước** (Figma `60:7` → `60:490`).
 *
 * Khẳng định trên HỢP ĐỒNG NGHIỆP VỤ: quyền nào mở được trang, payload nào rời khỏi form, đi
 * đâu sau khi thành công. KHÔNG khẳng định trên cấu trúc DOM của AntD hay tên class sinh tự động.
 */

/* ------------------------------------------------------------------ hạ tầng mock */

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/manage/vehicles/new',
  useSearchParams: () => new URLSearchParams(),
}));

const create = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: undefined as unknown,
}));

vi.mock('@/features/vehicles/hooks/use-vehicle-mutations', () => ({
  useCreateVehicle: () => create,
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

/** Upload thật cần presign + R2; form chỉ cần biết hàm tồn tại. */
vi.mock('@/services/upload', () => ({
  presignVehicleImage: vi.fn(),
  uploadImage: vi.fn(),
  validateImageFile: () => null,
}));

/* ------------------------------------------------------------------ tiện ích */

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>([PERMISSION.VEHICLE_CREATE, ...permissions]);
}

function revokeAll() {
  perms.granted = new Set<string>();
}

function renderPage() {
  return render(
    <App>
      <NewVehiclePage />
    </App>,
  );
}

/** Điền các trường bắt buộc để lưu (cột "Save Req" của ma trận Figma `65:4844`) — đều ở bước 1. */
function fillRequired({ code = 'XE-001', name = 'Toyota Vios 2023' } = {}) {
  fireEvent.change(screen.getByLabelText(/Mã xe/), { target: { value: code } });
  fireEvent.change(screen.getByLabelText(/Tên xe/), { target: { value: name } });
}

const next = () => fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }));

/**
 * Đưa wizard tới bước 5 (Xác nhận & gửi duyệt) — nơi duy nhất có nút gửi thật.
 *
 * Chờ **tiêu đề của bước kế tiếp**, không chờ nút "Tiếp tục": nút đó có mặt ở cả bốn bước đầu
 * nên `findByRole` trả về ngay lập tức và vòng lặp chạy hết trước khi wizard kịp chuyển bước.
 */
async function goToLastStep() {
  const headings = [
    '2. Chi tiết kỹ thuật xe',
    '3. Thiết lập giá thuê & chính sách',
    '4. Hình ảnh, tiện ích & mô tả xe',
    '5. Xác nhận thông tin hồ sơ xe',
  ];
  for (const heading of headings) {
    next();
     
    await screen.findByText(heading);
  }
}

/**
 * Gửi qua "Lưu nháp".
 *
 * Nhánh "Lưu & Gửi duyệt" gọi TIẾP `submitVehiclePublic` (một lời gọi mạng thứ hai) nên nó có
 * test riêng; các test payload dùng nhánh nháp để chỉ còn đúng một lời gọi cần soi.
 */
function submitForm() {
  fireEvent.click(screen.getByRole('button', { name: /Lưu nháp/ }));
}

/** Điền bước 1 rồi đi thẳng tới bước cuối và gửi. */
async function fillAndSubmit(over?: { code?: string; name?: string }) {
  fillRequired(over);
  await goToLastStep();
  submitForm();
}

/** Payload của lần `mutate` gần nhất. */
function lastPayload(): Record<string, unknown> {
  const calls = create.mutate.mock.calls;
  return calls[calls.length - 1]![0] as Record<string, unknown>;
}

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  create.mutate.mockReset();
  create.isPending = false;
  create.isError = false;
  create.error = undefined;
  grant();
});

afterEach(cleanup);

/* ------------------------------------------------------------------ quyền */

describe('/manage/vehicles/new — quyền truy cập', () => {
  it('không có `vehicles.create`: thay TOÀN BỘ trang bằng màn 403, không dựng form', () => {
    revokeAll();
    renderPage();

    expect(screen.getByText('Không có quyền thêm xe')).toBeTruthy();
    expect(screen.queryByLabelText(/Mã xe/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Tiếp tục/ })).toBeNull();
  });

  it('màn 403 nói rõ quyền còn thiếu và có lối thoát an toàn', () => {
    revokeAll();
    renderPage();

    expect(screen.getByText(new RegExp(PERMISSION.VEHICLE_CREATE))).toBeTruthy();
    expect(screen.getByRole('link', { name: /Về danh sách xe/ })).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ wizard */

describe('/manage/vehicles/new — wizard năm bước', () => {
  it('mở ra ở bước 1: chỉ phần "Thông tin cơ bản" có ô nhập', () => {
    renderPage();

    expect(screen.getByLabelText(/Mã xe/)).toBeTruthy();
    // Trường của các bước sau chưa được dựng.
    expect(screen.queryByLabelText(/Biển số xe/)).toBeNull();
    expect(screen.queryByLabelText(/Giá ngày thường/)).toBeNull();
  });

  it('thanh bước liệt kê đủ năm bước của Figma `193:1590`', () => {
    renderPage();

    for (const label of [
      'Thông tin cơ bản',
      'Chi tiết kỹ thuật',
      'Giá thuê & chính sách',
      'Hình ảnh & mô tả',
      'Xác nhận & gửi duyệt',
    ]) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
  });

  it('bước cuối mới có nút gửi — không thể tạo xe từ bước 1', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: /Lưu nháp/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Tiếp tục/ })).toBeTruthy();
  });

  it('thiếu trường bắt buộc: KHÔNG đi tiếp và hiện lỗi của schema', async () => {
    renderPage();
    next();

    await waitFor(() => expect(screen.getByText('Mã xe là bắt buộc')).toBeTruthy());
    expect(await screen.findByText('Tên xe là bắt buộc')).toBeTruthy();
    // Vẫn đứng ở bước 1.
    expect(screen.getByLabelText(/Mã xe/)).toBeTruthy();
    expect(create.mutate).not.toHaveBeenCalled();
  });

  it('lỗi validate hiện ngay tại field, không phải một hộp lỗi chung', async () => {
    renderPage();
    next();

    const input = await screen.findByLabelText(/Mã xe/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('đi tiếp: bước 2 mở ra, ô nhập của bước 1 đóng lại', async () => {
    renderPage();
    fillRequired();

    next();

    // Wizard mới chỉ dựng bước ĐANG mở (Figma `193:1615`) — không còn hàng tóm tắt tích luỹ.
    expect(await screen.findByLabelText(/Biển số xe/)).toBeTruthy();
    expect(screen.queryByLabelText(/Mã xe/)).toBeNull();
    expect(screen.getByText('2. Chi tiết kỹ thuật xe')).toBeTruthy();
  });

  it('"Chỉnh sửa" ở bước xác nhận quay về đúng bước và GIỮ NGUYÊN giá trị', async () => {
    renderPage();
    fillRequired();
    await goToLastStep();

    // Bước 5 tổng kết bốn phần, mỗi phần một lối "Chỉnh sửa" (Figma `193:2077`).
    fireEvent.click(screen.getAllByRole('button', { name: 'Chỉnh sửa' })[0]!);

    const code = (await screen.findByLabelText(/Mã xe/)) as HTMLInputElement;
    expect(code.value).toBe('XE-001');
  });

  it('"Quay lại bước trước" lùi một bước chứ KHÔNG rời trang', async () => {
    renderPage();
    fillRequired();
    next();
    await screen.findByLabelText(/Biển số xe/);

    fireEvent.click(screen.getByRole('button', { name: 'Quay lại bước trước' }));

    expect(await screen.findByLabelText(/Mã xe/)).toBeTruthy();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('giá trị của bước trước vẫn đi vào payload dù ô nhập đã bị gỡ khỏi DOM', async () => {
    renderPage();
    await fillAndSubmit();

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    expect(lastPayload().code).toBe('XE-001');
    expect(lastPayload().name).toBe('Toyota Vios 2023');
  });
});

/* ------------------------------------------------------------------ giá trị mặc định */

describe('/manage/vehicles/new — giá trị khởi tạo', () => {
  it('select bắt buộc có sẵn giá trị hợp lệ, không rỗng', () => {
    renderPage();

    // Loại xe chuyển từ radio sang dropdown ở Wave 3B-R2 (Figma `193:1636`) — vẫn phải có sẵn
    // giá trị mặc định, nếu không "Tiếp tục" ở bước 1 sẽ chặn người dùng bằng lỗi bắt buộc.
    expect(screen.getByTitle('Ô tô')).toBeTruthy();
    expect(screen.getByTitle('Tự lái')).toBeTruthy();
    expect(screen.getByTitle('Sẵn sàng')).toBeTruthy();
  });

  it('bước xác nhận tổng kết lại thông tin đã nhập', async () => {
    renderPage();
    fillRequired();
    await goToLastStep();

    expect(screen.getByText('5. Xác nhận thông tin hồ sơ xe')).toBeTruthy();
    expect(screen.getByText('Toyota Vios 2023')).toBeTruthy();
    expect(screen.getByText('XE-001')).toBeTruthy();
  });

  it('trường cần cho duyệt công khai có ghi chú đọc được, không chỉ một dấu chấm', async () => {
    renderPage();
    fillRequired();
    next();

    // Bước 2 có "Biển số xe ●".
    expect(await screen.findByText('(cần cho duyệt công khai)')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ payload */

describe('/manage/vehicles/new — payload gửi lên API', () => {
  it('payload hợp lệ mang đúng tên trường của backend', async () => {
    renderPage();
    await fillAndSubmit();

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));

    const payload = lastPayload();
    expect(payload.code).toBe('XE-001');
    expect(payload.name).toBe('Toyota Vios 2023');
    expect(payload.vehicleType).toBe('car');
    expect(payload.serviceType).toBe('self_drive');
    expect(payload.operationStatus).toBe('available');
  });

  it('KHÔNG gửi `tenantId` — tenant lấy từ membership ở backend', async () => {
    renderPage();
    await fillAndSubmit();

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    expect(lastPayload()).not.toHaveProperty('tenantId');
  });

  it('KHÔNG gửi `publicStatus` — trạng thái public do server quyết (ADR 0008)', async () => {
    renderPage();
    await fillAndSubmit();

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    expect(lastPayload()).not.toHaveProperty('publicStatus');
  });

  it('mã và tên được trim trước khi gửi', async () => {
    renderPage();
    await fillAndSubmit({ code: '  XE-002  ', name: '  Kia Seltos  ' });

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    expect(lastPayload().code).toBe('XE-002');
    expect(lastPayload().name).toBe('Kia Seltos');
  });

  it('gọi API ĐÚNG MỘT LẦN cho cả năm bước — wizard không lưu nháp giữa chừng', async () => {
    renderPage();
    await fillAndSubmit();

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
  });
});

/* ------------------------------------------------------------------ gửi form */

describe('/manage/vehicles/new — trạng thái gửi', () => {
  it('đang gửi: nút báo loading', async () => {
    const { rerender } = renderPage();
    fillRequired();
    await goToLastStep();

    // `rerender` giữ nguyên state của wizard (vẫn ở bước cuối); render lại từ đầu sẽ về bước 1.
    create.isPending = true;
    rerender(
      <App>
        <NewVehiclePage />
      </App>,
    );

    const button = screen.getByRole('button', { name: /Lưu nháp/ });
    expect(button.className).toMatch(/loading/);
  });

  it('đang gửi thì bấm lại KHÔNG tạo lời gọi API thứ hai', async () => {
    renderPage();
    await fillAndSubmit();
    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));

    create.isPending = true;
    submitForm();

    await Promise.resolve();
    expect(create.mutate).toHaveBeenCalledTimes(1);
  });

  it('lỗi API hiện ngay trong form, không chỉ là toast thoáng qua', () => {
    create.isError = true;
    create.error = new Error('Mã xe đã tồn tại');
    renderPage();

    expect(screen.getByText('Mã xe đã tồn tại')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ điều hướng */

describe('/manage/vehicles/new — điều hướng', () => {
  it('tạo xong: chuyển sang trang chi tiết của xe VỪA tạo, không quay về danh sách', async () => {
    renderPage();
    await fillAndSubmit();

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    const options = create.mutate.mock.calls[0]![1] as {
      onSuccess: (v: { id: string }) => void;
    };
    options.onSuccess({ id: 'v-new' });

    // `replace` chứ không `push`: quay lui từ chi tiết không được rơi lại vào form đã gửi.
    expect(nav.replace).toHaveBeenCalledWith('/manage/vehicles/v-new');
  });

  it('huỷ ở bước 1: về danh sách xe và KHÔNG gọi API', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ bỏ' }));

    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles');
    expect(create.mutate).not.toHaveBeenCalled();
  });

  it('nút quay lại ở tiêu đề trang cũng về danh sách', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));

    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles');
  });
});
