import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UploadPresign } from '@/services/upload';
import { ImageUploadField } from './ImageUploadField';

/**
 * ImageUploadField: chọn file → validate → uploadImage (presign + PUT) → field nhận publicUrl
 * và hiện preview; file sai MIME/quá trần bị chặn NGAY, không gọi mạng.
 */

const mocks = vi.hoisted(() => ({
  uploadImage: vi.fn(async () => 'https://pub.example.dev/tenants/t1/vehicles/img.jpg'),
  validateImageFile: vi.fn((): string | null => null),
}));

vi.mock('@/services/upload', () => ({
  uploadImage: mocks.uploadImage,
  validateImageFile: mocks.validateImageFile,
}));

// Polyfill matchMedia của AntD nằm ở `vitest.setup.ts` (dùng chung cho mọi test).

// Vitest không bật globals → RTL không tự cleanup giữa các test. `restoreMocks` của config chỉ
// đụng spy (vi.spyOn), KHÔNG xoá lịch sử vi.fn → tự clear để test sau không thấy call của test trước.
afterEach(() => {
  cleanup();
  mocks.validateImageFile.mockReset();
  mocks.validateImageFile.mockReturnValue(null);
  mocks.uploadImage.mockReset();
  mocks.uploadImage.mockResolvedValue('https://pub.example.dev/tenants/t1/vehicles/img.jpg');
});

const fakePresign = async (): Promise<UploadPresign> => ({
  key: 'k',
  uploadUrl: 'https://r2/put',
  publicUrl: 'https://pub.example.dev/tenants/t1/vehicles/img.jpg',
  expiresIn: 300,
});

function Harness() {
  const { control } = useForm<{ mainImageUrl: string | null }>({
    defaultValues: { mainImageUrl: null },
  });
  return (
    <App>
      <ImageUploadField
        control={control}
        name="mainImageUrl"
        label="Ảnh đại diện"
        presign={fakePresign}
      />
    </App>
  );
}

function pickFile(file: File) {
  const input = document.querySelector('input[type="file"]');
  expect(input).toBeTruthy();
  fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
}

describe('ImageUploadField', () => {
  it('chọn file hợp lệ → upload → field nhận publicUrl, preview hiện', async () => {
    render(<Harness />);
    pickFile(new File(['x'], 'xe.jpg', { type: 'image/jpeg' }));

    await waitFor(() => expect(mocks.uploadImage).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const img = screen.getByAltText('Ảnh đã chọn');
      expect(img.getAttribute('src')).toBe('https://pub.example.dev/tenants/t1/vehicles/img.jpg');
    });
    // Có ảnh rồi thì hiện nút xoá.
    expect(screen.getByRole('button', { name: /Xoá ảnh/ })).toBeTruthy();
  });

  it('file sai MIME bị chặn trước khi lên mạng', async () => {
    // mockReturnValue (không Once) — rc-upload có thể gọi beforeUpload nhiều nhịp cho 1 file;
    // restoreMocks của vitest.config trả mock về impl gốc sau mỗi test nên không rò sang test khác.
    mocks.validateImageFile.mockReturnValue('Chỉ nhận ảnh JPG, PNG hoặc WebP');
    render(<Harness />);
    pickFile(new File(['x'], 'anim.gif', { type: 'image/gif' }));

    await waitFor(() => expect(mocks.validateImageFile).toHaveBeenCalled());
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it('giữ file lỗi và cho thử lại mà không bắt người dùng chọn lại', async () => {
    mocks.uploadImage.mockRejectedValueOnce(new Error('Mạng không ổn định'));
    render(<Harness />);
    pickFile(new File(['x'], 'xe.jpg', { type: 'image/jpeg' }));

    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    expect(
      screen
        .getAllByRole('alert')
        .some((alert) => alert.textContent?.includes('Mạng không ổn định')),
    ).toBe(true);
    fireEvent.click(retry);

    await waitFor(() => expect(mocks.uploadImage).toHaveBeenCalledTimes(2));
    expect(await screen.findByAltText('Ảnh đã chọn')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
});
