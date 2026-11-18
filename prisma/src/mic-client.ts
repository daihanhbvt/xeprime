/**
 * Client HTTP của MIC Open API — ADR 0088.
 *
 * Dùng chung cho worker (cấp hợp đồng) và API (tải GCN PDF), nên sống cạnh `insurance-issue.ts`
 * ở `@xeprime/prisma` và chỉ dùng `fetch` của Node — không kéo SDK hay runtime Nest nào vào.
 *
 * ## Ba luật an toàn
 *
 *  1. **Không bao giờ ghi thân lỗi 401.** MIC trả NGUYÊN chuỗi Bearer token trong thân của lỗi 401
 *     (đo trên sandbox 10/11/2026). Client làm mới token và thử lại MỘT lần; thân lỗi không đi ra
 *     khỏi hàm này.
 *  2. **Token chỉ ở bộ nhớ.** Không cache ra đĩa/DB; làm mới trước khi hết hạn 5 phút.
 *  3. **MIC chặn theo IP.** Chỉ máy chủ có IP đã whitelist gọi được (staging hiện tại). Máy dev dùng
 *     `INSURANCE_PARTNER=mic_mock`.
 */

/** Cấu hình — đọc từ env `MIC_*` ở app, truyền vào đây (package dùng chung không đọc env). */
export interface MicConfig {
  baseUrl: string;
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
  /** Sandbox ⇒ mọi hợp đồng là THỬ NGHIỆM (số GCN mang tiền tố `TEST-`, cờ `is_test`). */
  sandbox: boolean;
  timeoutMs?: number;
}

/**
 * Đọc bộ `MIC_*` từ một bảng env — MỘT cách đọc cho API và worker (hai tiến trình chung file env).
 * `null` khi thiếu bất kỳ biến bắt buộc nào. `MIC_SANDBOX` mặc định `true`: quên khai thì hợp đồng
 * được đánh dấu THỬ NGHIỆM, không bao giờ ngược lại.
 */
export function readMicConfig(env: Record<string, string | undefined>): MicConfig | null {
  const get = (key: string) => env[key]?.trim() || '';
  const config = {
    baseUrl: get('MIC_BASE_URL'),
    username: get('MIC_USERNAME'),
    password: get('MIC_PASSWORD'),
    clientId: get('MIC_CLIENT_ID'),
    clientSecret: get('MIC_CLIENT_SECRET'),
  };
  if (Object.values(config).some((v) => v.length === 0)) return null;
  return { ...config, sandbox: get('MIC_SANDBOX').toLowerCase() !== 'false' };
}

/** Phong bì phản hồi của MIC: `code = "00"` là thành công. */
export interface MicEnvelope<T = unknown> {
  code: string | null;
  message: string | null;
  data: T | null;
}

export interface MicResponse<T = unknown> {
  status: number;
  body: MicEnvelope<T>;
}

/** Lỗi mạng / hết thời gian chờ / HTTP 5xx — thử lại thường là đủ. */
export class MicUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MicUnavailableError';
  }
}

/** Kết quả tra cứu theo `id_tras` — các trường dùng tới. */
export interface MicLookup {
  so_hd?: string | null;
  so_id?: string | number | null;
  ttrang?: string | null;
  ttoan?: number | null;
  ngay_hl?: string | null;
  gio_hl?: string | null;
  ngay_kt?: string | null;
  gio_kt?: string | null;
}

/** Phản hồi tính phí `phi_vcx` — `total_fee` đã gồm VAT (đo sandbox 17/11/2026). */
export interface MicPremium {
  insurance_fee?: number | null;
  vat_fee?: number | null;
  total_fee?: number | null;
}

/** Phản hồi cấp hợp đồng `gcn_vcx`. */
export interface MicIssued {
  contact_number?: string | null;
  id_number?: string | number | null;
  total_fee?: number | null;
}

const TOKEN_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 30_000;
export const MIC_SUCCESS_CODE = '00';

export const MIC_PATH = {
  TOKEN: '/api/e/v1/get-token',
  UPLOAD_FILE: '/api/e/file/v1/open-api/upload-file',
  VALIDATE: '/api/e/xel_chuyen/v1/gcn_vcx_validate',
  ISSUE: '/api/e/xel_chuyen/v1/gcn_vcx',
  /** Tính phí VCX theo chuyến — thân phẳng, PHẢI có giờ bắt đầu và ngày/giờ kết thúc (ADR 0097). */
  PREMIUM: '/api/e/xel_chuyen/v1/phi_vcx',
  LOOKUP: '/api/e/tracuu/v2/id_trans',
  DOWNLOAD_CERTIFICATE: '/api/e/portal-file/v1/file/download-gcn-by-so-id',
} as const;

export class MicClient {
  private token: { value: string; merchant: string; expiresAt: number } | null = null;
  private pendingToken: Promise<void> | null = null;

  constructor(private readonly config: MicConfig) {}

  get sandbox(): boolean {
    return this.config.sandbox;
  }

  /** Gọi một endpoint đã xác thực. 401 ⇒ làm mới token và thử lại MỘT lần. */
  async call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    opts: { timeoutMs?: number } = {},
  ): Promise<MicResponse<T>> {
    await this.ensureToken();
    let res = await this.send<T>(method, path, body, true, opts.timeoutMs);
    if (res.status === 401) {
      this.token = null;
      await this.ensureToken();
      res = await this.send<T>(method, path, body, true, opts.timeoutMs);
    }
    if (res.status === 401) {
      throw new MicUnavailableError('MIC từ chối token (401) sau khi làm mới');
    }
    return res;
  }

  /** Tra cứu hợp đồng theo mã giao dịch — `null` khi MIC chưa có hợp đồng nào cho mã đó. */
  async lookup(idTras: string): Promise<MicLookup | null> {
    const res = await this.call<MicLookup>(
      'GET',
      `${MIC_PATH.LOOKUP}?id_trans=${encodeURIComponent(idTras)}`,
    );
    if (res.status >= 500) throw new MicUnavailableError(`Tra cứu MIC lỗi HTTP ${res.status}`);
    const data = res.body.data;
    if (res.body.code !== MIC_SUCCESS_CODE || !data || !data.so_hd) return null;
    return data;
  }

  /** Gửi một ảnh xe gắn vào mã giao dịch (`refer = id_tras`). */
  async uploadPhoto(refer: string, fileExtension: string, base64: string): Promise<MicResponse> {
    return this.call('POST', MIC_PATH.UPLOAD_FILE, { refer, fileExtension, fileBase64: base64 });
  }

  /** Tải GCN PDF theo mã hợp đồng nội bộ (`so_id`). `null` khi MIC không trả file. */
  async downloadCertificate(soId: string): Promise<Buffer | null> {
    const res = await this.call<{ data?: string } | string>('POST', MIC_PATH.DOWNLOAD_CERTIFICATE, {
      soId,
    });
    if (res.status >= 500) throw new MicUnavailableError(`Tải GCN lỗi HTTP ${res.status}`);
    const data = res.body.data;
    const b64 = typeof data === 'string' ? data : (data?.data ?? null);
    if (res.body.code !== MIC_SUCCESS_CODE || !b64) return null;
    return Buffer.from(b64, 'base64');
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  private async ensureToken(): Promise<void> {
    if (this.token && this.token.expiresAt - TOKEN_SKEW_MS > Date.now()) return;
    // Nhiều lời gọi song song chỉ xin MỘT token.
    this.pendingToken ??= this.fetchToken().finally(() => {
      this.pendingToken = null;
    });
    await this.pendingToken;
  }

  private async fetchToken(): Promise<void> {
    const res = await this.send<{ access_token?: string; merchant?: string; expires_in?: number }>(
      'POST',
      MIC_PATH.TOKEN,
      {
        username: this.config.username,
        password: this.config.password,
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
      },
      false,
    );
    const data = res.body.data;
    if (res.status !== 200 || res.body.code !== MIC_SUCCESS_CODE || !data?.access_token) {
      // Không chép `message` của MIC vào lỗi: thân phản hồi token là vùng nhạy cảm.
      throw new MicUnavailableError(`Không lấy được token MIC (HTTP ${res.status})`);
    }
    this.token = {
      value: data.access_token,
      merchant: data.merchant ?? '',
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
  }

  private async send<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    authed: boolean,
    timeoutMs?: number,
  ): Promise<MicResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json;charset=UTF-8',
      Accept: 'application/json',
    };
    if (authed && this.token) {
      headers.Authorization = `Bearer ${this.token.value}`;
      headers.merchant = this.token.merchant;
    }
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl.replace(/\/+$/, '')}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs ?? this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.name : 'unknown';
      throw new MicUnavailableError(`Không gọi được MIC (${reason}) ${path}`);
    }
    // 401: KHÔNG đọc thân — nó chứa token. Trả phong bì rỗng để caller làm mới token.
    if (response.status === 401) {
      await response.body?.cancel();
      return { status: 401, body: { code: null, message: null, data: null } };
    }
    const text = await response.text();
    let parsed: Partial<MicEnvelope<T>> = {};
    try {
      parsed = text ? (JSON.parse(text) as Partial<MicEnvelope<T>>) : {};
    } catch {
      parsed = { message: `Phản hồi không phải JSON (HTTP ${response.status})` };
    }
    return {
      status: response.status,
      body: {
        code: typeof parsed.code === 'string' ? parsed.code : null,
        message: typeof parsed.message === 'string' ? parsed.message : null,
        data: (parsed.data ?? null) as T | null,
      },
    };
  }
}
