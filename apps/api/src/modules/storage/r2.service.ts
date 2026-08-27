import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { newId } from '@xeprime/prisma';

export interface PresignResult {
  /** Key trong bucket — client trả lại khi gửi message có đính kèm. */
  key: string;
  /** URL để client PUT file lên (hết hạn ngắn). */
  uploadUrl: string;
  /** URL công khai của file sau khi upload — lưu vào chat_attachments.file_url. */
  publicUrl: string;
  expiresIn: number;
}

/** Presign PUT vào bucket RIÊNG TƯ — không có publicUrl vì bucket không có URL public. */
export interface PrivatePresignResult {
  uploadUrl: string;
  expiresIn: number;
}

export interface PrivateObjectHead {
  size: number;
  contentType: string | null;
}

/**
 * Cloudflare R2 (tương thích S3) cho đính kèm chat — ADR 0009 §5. Client upload THẲNG lên R2
 * qua presigned PUT (không đẩy nhị phân qua API); Postgres chỉ giữ metadata. Client S3 dựng lười
 * để app vẫn boot khi chat tắt.
 */
@Injectable()
export class R2Service {
  private client: import('@aws-sdk/client-s3').S3Client | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Đủ bộ env R2 chưa — endpoint presign check trước để trả 503 rõ ràng thay vì 500. */
  get enabled(): boolean {
    return [
      'R2_ENDPOINT',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
      'R2_PUBLIC_BASE_URL',
    ].every((key) => Boolean(this.config.get<string>(key)));
  }

  /**
   * Kho tài liệu RIÊNG TƯ đã cấu hình chưa. CỐ Ý không đòi `R2_PUBLIC_BASE_URL` —
   * bucket private không có (và không được có) URL public; thiếu `R2_PRIVATE_BUCKET`
   * thì các endpoint hợp đồng fail-closed 503, KHÔNG rơi về bucket public.
   */
  get privateEnabled(): boolean {
    return ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PRIVATE_BUCKET'].every(
      (key) => Boolean(this.config.get<string>(key)),
    );
  }

  private async getClient(): Promise<import('@aws-sdk/client-s3').S3Client> {
    if (this.client) return this.client;
    const { S3Client } = await import('@aws-sdk/client-s3');
    this.client = new S3Client({
      region: 'auto', // R2 không dùng region — 'auto' theo hướng dẫn Cloudflare.
      endpoint: this.config.getOrThrow<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
      },
    });
    return this.client;
  }

  async presignUpload(params: {
    prefix: string;
    fileName: string;
    contentType: string;
    /** Nếu truyền, Content-Length được KÝ vào URL — file to hơn khai báo là R2 từ chối. */
    contentLength?: number;
  }): Promise<PresignResult> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

    const bucket = this.config.getOrThrow<string>('R2_BUCKET');
    const publicBase = this.config.getOrThrow<string>('R2_PUBLIC_BASE_URL').replace(/\/+$/, '');
    const key = `${params.prefix}/${newId()}-${sanitize(params.fileName)}`;
    const expiresIn = 300;

    const uploadUrl = await getSignedUrl(
      await this.getClient(),
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: params.contentType,
        ...(params.contentLength != null ? { ContentLength: params.contentLength } : {}),
      }),
      { expiresIn },
    );

    return { key, uploadUrl, publicUrl: `${publicBase}/${key}`, expiresIn };
  }

  /**
   * Presign PUT vào bucket RIÊNG TƯ. Khác bản public: `key` do CALLER (server) dựng sẵn —
   * không sinh ở đây vì key phải gắn với bản ghi `vehicle_private_files` đã tạo trước đó;
   * và không có `publicUrl` để trả.
   */
  async presignPrivateUpload(params: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<PrivatePresignResult> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

    const expiresIn = 300;
    const uploadUrl = await getSignedUrl(
      await this.getClient(),
      new PutObjectCommand({
        Bucket: this.privateBucket(),
        Key: params.key,
        ContentType: params.contentType,
        // Content-Length ký vào URL: file to hơn khai báo là R2 từ chối, không chỉ check thiện chí.
        ContentLength: params.contentLength,
      }),
      { expiresIn },
    );
    return { uploadUrl, expiresIn };
  }

  /** HEAD object trong bucket riêng tư — null nếu chưa/không tồn tại. */
  async headPrivateObject(key: string): Promise<PrivateObjectHead | null> {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      const head = await (
        await this.getClient()
      ).send(new HeadObjectCommand({ Bucket: this.privateBucket(), Key: key }));
      return { size: head.ContentLength ?? 0, contentType: head.ContentType ?? null };
    } catch {
      return null;
    }
  }

  /** Đọc N byte đầu của object riêng tư — kiểm chữ ký file (magic bytes) khi hoàn tất upload. */
  async readPrivateObjectPrefix(key: string, byteCount: number): Promise<Uint8Array | null> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      const res = await (
        await this.getClient()
      ).send(
        new GetObjectCommand({
          Bucket: this.privateBucket(),
          Key: key,
          Range: `bytes=0-${byteCount - 1}`,
        }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Signed GET NGẮN HẠN cho tài liệu riêng tư — chỉ gọi SAU khi caller đã kiểm quyền.
   * `Content-Disposition` ký kèm để trình duyệt tải về đúng tên hiển thị đã khử ký tự lạ.
   */
  async presignPrivateDownload(
    key: string,
    displayName: string,
    expiresIn = 120,
  ): Promise<{ downloadUrl: string; expiresIn: number }> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

    const downloadUrl = await getSignedUrl(
      await this.getClient(),
      new GetObjectCommand({
        Bucket: this.privateBucket(),
        Key: key,
        ResponseContentDisposition: `attachment; filename="${sanitize(displayName)}"`,
      }),
      { expiresIn },
    );
    return { downloadUrl, expiresIn };
  }

  private privateBucket(): string {
    return this.config.getOrThrow<string>('R2_PRIVATE_BUCKET');
  }
}

/** Chỉ giữ ký tự an toàn cho key, tránh path traversal / ký tự lạ. */
function sanitize(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '_');
  return cleaned.slice(-120) || 'file';
}
