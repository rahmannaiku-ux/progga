import { describe, it, expect } from "vitest";
import { FakeChatProvider } from "./fake-provider";

describe("FakeChatProvider", () => {
  it("issueToken creates the room and adds the caller as a member", async () => {
    const provider = new FakeChatProvider();
    const result = await provider.issueToken("room_1", { id: "u1", name: "A", avatarUrl: null, role: "student" });
    expect(result.userId).toBe("u1");
    expect(provider.__isMember("room_1", "u1")).toBe(true);
  });

  it("a banned user cannot obtain a new token", async () => {
    const provider = new FakeChatProvider();
    await provider.issueToken("room_1", { id: "u1", name: "A", avatarUrl: null, role: "student" });
    await provider.banUser({ roomId: "room_1", targetUserId: "u1" });
    expect(provider.__isBanned("room_1", "u1")).toBe(true);
    expect(provider.__isMember("room_1", "u1")).toBe(false);
    await expect(provider.issueToken("room_1", { id: "u1", name: "A", avatarUrl: null, role: "student" })).rejects.toThrow();
  });

  it("pin/unpin and announcement round-trip", async () => {
    const provider = new FakeChatProvider();
    await provider.setAnnouncement("room_1", "Exam starts at 9pm");
    expect(provider.__state("room_1").announcement).toBe("Exam starts at 9pm");
    await provider.pinMessage("room_1", "msg_1");
    expect(provider.__state("room_1").pinned.has("msg_1")).toBe(true);
    await provider.unpinMessage("room_1", "msg_1");
    expect(provider.__state("room_1").pinned.has("msg_1")).toBe(false);
  });

  it("closeRoom freezes and marks the room closed", async () => {
    const provider = new FakeChatProvider();
    await provider.ensureRoom("room_1");
    await provider.closeRoom("room_1");
    const state = provider.__state("room_1");
    expect(state.frozen).toBe(true);
    expect(state.closed).toBe(true);
  });

  it("membership is isolated per room", async () => {
    const provider = new FakeChatProvider();
    await provider.issueToken("room_1", { id: "u1", name: "A", avatarUrl: null, role: "student" });
    expect(provider.__isMember("room_2", "u1")).toBe(false);
  });
});
