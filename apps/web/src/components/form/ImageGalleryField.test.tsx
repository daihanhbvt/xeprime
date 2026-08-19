import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UploadPresign } from '@/services/upload';
import { ImageGalleryField } from './ImageGalleryField';

const mocks = vi.hoisted(() => ({
  uploadImage: vi.fn(),
  validateImageFile: vi.fn((): { reason: string } | null => null),
}));

vi.mock('@/services/upload', () => ({
  uploadImage: mocks.uploadImage,
  validateImageFile: mocks.validateImageFile,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const fakePresign = async (): Promise<UploadPresign> => ({
  key: 'k',
  uploadUrl: 'https://r2/put',
  publicUrl: 'https://cdn.test/image.jpg',
  expiresIn: 300,
});

function Harness() {
  const { control } = useForm<{ images: string[] }>({ defaultValues: { images: [] } });
  return (
    <App>
      <ImageGalleryField
        control={control}
        name="images"
        label="Thư viện ảnh"
        presign={fakePresign}
      />
    </App>
  );
}

describe('ImageGalleryField', () => {
  it('giữ ảnh tải thành công khi ảnh khác lỗi và cho retry riêng file lỗi', async () => {
    let failedAttempts = 0;
    mocks.uploadImage.mockImplementation(
      async (file: File, _presign: unknown, onProgress?: (percent: number) => void) => {
        onProgress?.(65);
        if (file.name === 'loi.jpg' && failedAttempts++ === 0) {
          throw new Error('Tải ảnh lỗi');
        }
        return `https://cdn.test/${file.name}`;
      },
    );
    render(<Harness />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          new File(['ok'], 'tot.jpg', { type: 'image/jpeg' }),
          new File(['bad'], 'loi.jpg', { type: 'image/jpeg' }),
        ],
      },
    });

    expect(await screen.findByRole('button', { name: 'Thử lại loi.jpg' })).toBeTruthy();
    expect(screen.getAllByAltText('Ảnh gallery')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại loi.jpg' }));
    await waitFor(() => expect(screen.getAllByAltText('Ảnh gallery')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Thử lại loi.jpg' })).toBeNull();
  });
});
