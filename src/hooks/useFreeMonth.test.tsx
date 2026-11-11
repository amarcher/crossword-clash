// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

const store = { rows: null as unknown[] | null };
vi.mock("../lib/entitlements", () => ({
  subscribeEntitlements: () => () => {},
  getEntitlementState: () => (store.rows ? STATE : null),
}));
const STATE = { userId: "u1", status: "ready", get rows() { return store.rows ?? []; } };
const native = { available: false, prices: [] as { plan: "annual" | "monthly"; priceString: string; price: number; freeMonth: boolean }[] };
vi.mock("../lib/nativePurchase", () => ({
  nativePurchaseAvailable: () => native.available,
  fetchNativePrices: async () => native.prices,
}));

import { useFreeMonth } from "./useFreeMonth";

afterEach(() => {
  cleanup();
  store.rows = null;
  native.available = false;
  native.prices = [];
});

describe("useFreeMonth", () => {
  it("is free on the web for a visitor with no entitlement row, signed in or not", () => {
    expect(renderHook(() => useFreeMonth()).result.current).toEqual({ annual: true, monthly: true });
    store.rows = [];
    expect(renderHook(() => useFreeMonth()).result.current).toEqual({ annual: true, monthly: true });
  });

  it("is not free on the web once the account has held any entitlement, lapsed included", () => {
    store.rows = [{ product: "plus", source: "stripe", status: "expired" }];
    expect(renderHook(() => useFreeMonth()).result.current).toEqual({ annual: false, monthly: false });
  });

  it("follows the store per plan in the apps, and promises nothing before the offering answers", async () => {
    native.available = true;
    native.prices = [
      { plan: "annual", priceString: "$24.99", price: 24.99, freeMonth: true },
      { plan: "monthly", priceString: "$3.99", price: 3.99, freeMonth: false },
    ];
    const { result } = renderHook(() => useFreeMonth());
    expect(result.current).toEqual({ annual: false, monthly: false });
    await waitFor(() => expect(result.current).toEqual({ annual: true, monthly: false }));
  });
});
