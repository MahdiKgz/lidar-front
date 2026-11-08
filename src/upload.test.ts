import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadFile } from './upload';
import { api, putPart, fingerprint, type Session } from './api';
vi.mock('./api', async () => ({ ...await vi.importActual('./api'), api: vi.fn(), putPart: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('localStorage', { setItem: vi.fn(), removeItem: vi.fn() }); });
describe('multipart resume and progress', () => {
  it('skips valid parts and sums resumed bytes with actual in-flight bytes', async () => {
    const file = new File(['abcdef'], 'cloud.laz', { lastModified: 123 });
    const session: Session = { datasetId: 'd', uploadSessionId: 's', fileSize: '6', partSize: 3, totalParts: 2, expiresAt: '', originalFilename: file.name, fingerprint: fingerprint(file) };
    vi.mocked(api).mockImplementation(async (path) => {
      if (path.endsWith('/parts')) return { uploadedParts: [{ partNumber: 1, size: 3, valid: true }] } as never;
      if (path.endsWith('/presign')) return { parts: [{ url: 'temporary' }] } as never;
      return undefined as never;
    });
    vi.mocked(putPart).mockImplementation(async (_url, _blob, _signal, progress) => { progress(1); progress(3); });
    const update = vi.fn(); await uploadFile(file, session, new AbortController().signal, update);
    expect(putPart).toHaveBeenCalledTimes(1);
    expect(update.mock.calls.map(call => call[1])).toContain(4);
    expect(update.mock.calls.at(-1)?.[1]).toBe(6);
    expect(api).toHaveBeenCalledWith('/uploads/s/parts/presign', 'POST', { partNumbers: [2] });
    expect(api).toHaveBeenCalledWith('/uploads/s/complete', 'POST');
    expect(localStorage.removeItem).toHaveBeenCalled();
  });
  it('rejects unsupported files before creating a dataset', async () => {
    await expect(uploadFile(new File(['data'], 'bad.txt'), null, new AbortController().signal, vi.fn())).rejects.toThrow('LAS');
    expect(api).not.toHaveBeenCalled();
  });
  it('rejects a different file on resume', async () => {
    const file = new File(['data'], 'cloud.laz');
    await expect(uploadFile(file, { fingerprint: 'other' } as Session, new AbortController().signal, vi.fn())).rejects.toThrow('همان فایل');
    expect(api).not.toHaveBeenCalled();
  });
});
