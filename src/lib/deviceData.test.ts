import { describe, expect, it } from "vitest";
import { ACCOUNT_KEYS, MAX_VAULTS, OWNER_KEY, settleDeviceData, SIGNED_OUT_NOTICE_KEY, VAULT_PREFIX } from "./deviceData";
import { PROGRESS_KEY } from "./soloProgress";

const STATS = "crossword-clash-solo-stats";
const REPLAYS = "crossword-clash:replay-shares";

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}
const account = (id: string) => ({ id, account: true });
const guest = { id: "anon", account: false };

describe("settleDeviceData", () => {
  it("leaves a guest's device alone", () => {
    const store = memory({ [STATS]: "guest" });
    expect(settleDeviceData(store, guest)).toBe("none");
    expect(settleDeviceData(store, null)).toBe("none");
    expect(store.data.get(STATS)).toBe("guest");
  });

  it("an account adopts the guest's data when it signs in, with no page load", () => {
    const store = memory({ [STATS]: "guest" });
    expect(settleDeviceData(store, account("a"))).toBe("none");
    expect(store.data.get(OWNER_KEY)).toBe("a");
    expect(store.data.get(STATS)).toBe("guest");
    expect(settleDeviceData(store, account("a"))).toBe("none");
  });

  it("puts the account's data away when it leaves, and says so once", () => {
    const store = memory({ [STATS]: "mine", "crossword-clash:language": "es" });
    settleDeviceData(store, account("a"));
    expect(settleDeviceData(store, null)).toBe("menu");
    for (const key of ACCOUNT_KEYS) expect(store.getItem(key)).toBeNull();
    expect(store.data.get(`${VAULT_PREFIX}a:${STATS}`)).toBe("mine");
    expect(store.data.get(SIGNED_OUT_NOTICE_KEY)).toBe("1");
    expect(store.data.get("crossword-clash:language")).toBe("es");
    // The anonymous session that follows changes nothing more.
    expect(settleDeviceData(store, guest)).toBe("none");
  });

  it("brings the data back when the account returns", () => {
    const store = memory({ [STATS]: "mine" });
    settleDeviceData(store, account("a"));
    settleDeviceData(store, null);
    expect(settleDeviceData(store, account("a"))).toBe("reload");
    expect(store.data.get(STATS)).toBe("mine");
    expect(store.data.has(`${VAULT_PREFIX}a:${STATS}`)).toBe(false);
    expect(store.data.has(SIGNED_OUT_NOTICE_KEY)).toBe(false);
    expect(settleDeviceData(store, account("a"))).toBe("none");
  });

  it("keeps what the guest did in between, and offers their finishes to the account again", () => {
    const rec = (key: string, updatedAt: number) => ({ key, version: 2, cells: { "0,0": { letter: "A", correct: true } }, elapsedMs: 1, updatedAt, filled: 1, total: 9 });
    const store = memory({
      [STATS]: "mine",
      [PROGRESS_KEY]: JSON.stringify({ p1: rec("p1", 10), p2: rec("p2", 10) }),
      [REPLAYS]: JSON.stringify({ k1: { id: "a" } }),
      "crossword-clash:solves-uploaded": JSON.stringify(["a", "b"]),
    });
    settleDeviceData(store, account("a"));
    settleDeviceData(store, null);
    store.setItem(STATS, "guest");
    store.setItem(PROGRESS_KEY, JSON.stringify({ p2: rec("p2", 20), p3: rec("p3", 20) }));
    store.setItem(REPLAYS, JSON.stringify({ k2: { id: "b" } }));
    expect(settleDeviceData(store, account("a"))).toBe("reload");
    expect(store.data.get(STATS)).toBe("guest");
    const progress = JSON.parse(store.data.get(PROGRESS_KEY)!);
    expect(Object.keys(progress).sort()).toEqual(["p1", "p2", "p3"]);
    expect(progress.p2.updatedAt).toBe(20);
    expect(Object.keys(JSON.parse(store.data.get(REPLAYS)!)).sort()).toEqual(["k1", "k2"]);
    expect(JSON.parse(store.data.get("crossword-clash:solves-uploaded")!)).toEqual(["b"]);
  });

  it("keeps two accounts apart", () => {
    const store = memory({ [STATS]: "a's" });
    settleDeviceData(store, account("a"));
    settleDeviceData(store, null);
    store.setItem(STATS, "b's");
    settleDeviceData(store, account("b"));
    expect(settleDeviceData(store, account("a"))).toBe("reload");
    expect(store.data.get(STATS)).toBe("a's");
    expect(store.data.get(`${VAULT_PREFIX}b:${STATS}`)).toBe("b's");
  });

  it("removes a deleted account's data instead of keeping it", () => {
    const store = memory({ [STATS]: "mine" });
    settleDeviceData(store, account("a"));
    expect(settleDeviceData(store, null, { discard: true })).toBe("menu");
    expect([...store.data.keys()].filter((k) => k.startsWith(VAULT_PREFIX) || k === STATS || k === SIGNED_OUT_NOTICE_KEY)).toEqual([]);
  });

  it("keeps at most a few accounts' data, dropping the oldest", () => {
    const store = memory();
    for (let i = 0; i <= MAX_VAULTS; i++) {
      settleDeviceData(store, account(`u${i}`), { now: i });
      store.setItem(STATS, `u${i}`);
      settleDeviceData(store, null, { now: i });
    }
    expect(store.data.has(`${VAULT_PREFIX}u0:${STATS}`)).toBe(false);
    expect(store.data.get(`${VAULT_PREFIX}u${MAX_VAULTS}:${STATS}`)).toBe(`u${MAX_VAULTS}`);
  });
});
