import { describe, it, expect, vi, beforeEach } from "vitest";

// Same sandbox limitation as live-access.test.ts: needs vi.mock's module
// hoisting + Next's route-handler runtime, neither of which the
// node:test shim used elsewhere in this change supports. Written
// against the real handler and Prisma field names but UNVERIFIED until
// `npx vitest run` is run for real.

const resolveLiveApiUser = vi.fn();
const assertCanJoinLiveRoom = vi.fn();
const isLiveRoomEnabled = vi.fn().mockResolvedValue(true);
const create = vi.fn();
const findFirst = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();

vi.mock("@/server/live/route-auth", () => ({ resolveLiveApiUser: (...a: unknown[]) => resolveLiveApiUser(...a) }));
vi.mock("@/server/live/live-access", () => ({ assertCanJoinLiveRoom: (...a: unknown[]) => assertCanJoinLiveRoom(...a) }));
vi.mock("@/lib/live/flag", () => ({ isLiveRoomEnabled: (...a: unknown[]) => isLiveRoomEnabled(...a) }));
vi.mock("@/lib/db/client", () => ({
  db: { liveClassAttendance: { create: (...a: unknown[]) => create(...a), findFirst: (...a: unknown[]) => findFirst(...a), update: (...a: unknown[]) => update(...a), updateMany: (...a: unknown[]) => updateMany(...a) } },
}));

const { POST } = await import("./route");

const USER = { id: "user_1", role: "STUDENT" as const };
const LIVE_CLASS = { id: "lc_1", courseId: "course_1", state: "LIVE" as const };

function req(action: string) {
  return new Request("https://example.com/api/live/lc_1/attendance", { method: "POST", body: JSON.stringify({ action }) });
}

beforeEach(() => {
  resolveLiveApiUser.mockReset().mockResolvedValue({ ok: true, user: USER });
  assertCanJoinLiveRoom.mockReset().mockResolvedValue({ ok: true, liveClass: LIVE_CLASS });
  create.mockReset();
  findFirst.mockReset();
  update.mockReset();
  updateMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("POST /api/live/[id]/attendance", () => {
  it("creates a new session on join", async () => {
    create.mockResolvedValue({ id: "sess_1" });
    const res = await POST(req("join"), { params: { id: "lc_1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ sessionId: "sess_1", reconnected: false });
  });

  it("reuses the existing open session on a unique-constraint race instead of erroring", async () => {
    create.mockRejectedValue({ code: "P2002" });
    findFirst.mockResolvedValue({ id: "sess_existing" });
    update.mockResolvedValue({ id: "sess_existing", reconnectCount: 1 });

    const res = await POST(req("join"), { params: { id: "lc_1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ sessionId: "sess_existing", reconnected: true });
    expect(update).toHaveBeenCalledWith({ where: { id: "sess_existing" }, data: { reconnectCount: { increment: 1 } } });
  });

  it("rejects join when not authorized", async () => {
    assertCanJoinLiveRoom.mockResolvedValue({ ok: false, reason: "NOT_ENROLLED" });
    const res = await POST(req("join"), { params: { id: "lc_1" } });
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("closes the caller's own open session on leave without re-checking enrollment", async () => {
    const res = await POST(req("leave"), { params: { id: "lc_1" } });
    expect(res.status).toBe(200);
    expect(assertCanJoinLiveRoom).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: { liveClassId: "lc_1", userId: "user_1", leftAt: null },
      data: expect.objectContaining({ leftAt: expect.any(Date) }),
    });
  });

  it("leave is a safe no-op if already closed", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const res = await POST(req("leave"), { params: { id: "lc_1" } });
    expect(res.status).toBe(200);
  });

  it("rejects an unknown action", async () => {
    const res = await POST(req("loiter"), { params: { id: "lc_1" } });
    expect(res.status).toBe(400);
  });

  it("404s when the flag is off", async () => {
    isLiveRoomEnabled.mockResolvedValueOnce(false);
    const res = await POST(req("join"), { params: { id: "lc_1" } });
    expect(res.status).toBe(404);
  });
});
