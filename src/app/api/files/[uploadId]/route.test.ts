import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";
import { NextRequest } from "next/server";

const uploadFindUnique = vi.fn();
vi.mock("@/lib/db/client", () => ({
  db: { upload: { findUnique: (...a: unknown[]) => uploadFindUnique(...a) } },
}));

const getCurrentSessionUser = vi.fn();
vi.mock("@/lib/auth/require-auth", () => ({
  getCurrentSessionUser: () => getCurrentSessionUser(),
}));

const streamFromDrive = vi.fn();
vi.mock("@/lib/storage/google-drive", () => ({
  streamFromDrive: (...a: unknown[]) => streamFromDrive(...a),
}));

const { GET } = await import("./route");

const AVATAR = {
  id: "up_1",
  url: "/api/files/up_1",
  context: "AVATAR",
  provider: "GOOGLE_DRIVE",
  driveFileId: "drive_1",
  uploaderId: "user_1",
  uploader: { id: "user_1" },
  name: "me.png",
  fileType: "image/png",
  sizeBytes: 4,
};

function req(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/files/up_1", { headers });
}

beforeEach(() => {
  uploadFindUnique.mockReset().mockResolvedValue(AVATAR);
  getCurrentSessionUser.mockReset().mockResolvedValue(null);
  streamFromDrive.mockReset().mockResolvedValue({
    stream: Readable.from([Buffer.from("abcd")]),
    status: 200,
    contentLength: "4",
  });
});

describe("GET /api/files/[uploadId]", () => {
  it("streams from Drive with a private, long-lived browser cache", async () => {
    const res = await GET(req(), { params: { uploadId: "up_1" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(res.headers.get("etag")).toBe('"up_1"');
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(await res.text()).toBe("abcd");
  });

  it("answers a cached revalidation with 304 without calling Drive", async () => {
    const res = await GET(req({ "if-none-match": '"up_1"' }), { params: { uploadId: "up_1" } });
    expect(res.status).toBe(304);
    expect(streamFromDrive).not.toHaveBeenCalled();
  });

  it("forwards Range and passes a partial response through", async () => {
    streamFromDrive.mockResolvedValue({
      stream: Readable.from([Buffer.from("ab")]),
      status: 206,
      contentRange: "bytes 0-1/4",
      contentLength: "2",
    });
    const res = await GET(req({ range: "bytes=0-1" }), { params: { uploadId: "up_1" } });
    expect(streamFromDrive).toHaveBeenCalledWith("drive_1", { range: "bytes=0-1" });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-1/4");
  });

  it("still enforces access on private files before touching Drive", async () => {
    uploadFindUnique.mockResolvedValue({ ...AVATAR, context: "CERTIFICATE" });
    const res = await GET(req(), { params: { uploadId: "up_1" } });
    expect(res.status).toBe(403);
    expect(streamFromDrive).not.toHaveBeenCalled();
  });
});
