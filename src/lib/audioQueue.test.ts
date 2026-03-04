// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AudioQueue } from "./audioQueue";

let mockPlay: ReturnType<typeof vi.fn>;
let mockPause: ReturnType<typeof vi.fn>;
let capturedOnended: (() => void) | null;
let capturedOnerror: (() => void) | null;

beforeEach(() => {
  mockPlay = vi.fn(() => Promise.resolve());
  mockPause = vi.fn();
  capturedOnended = null;
  capturedOnerror = null;

  vi.stubGlobal(
    "Audio",
    class MockAudio {
      src = "";
      play = mockPlay;
      pause = mockPause;
      set onended(fn: (() => void) | null) {
        capturedOnended = fn;
      }
      set onerror(fn: (() => void) | null) {
        capturedOnerror = fn;
      }
    },
  );

  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:mock-url"),
    revokeObjectURL: vi.fn(),
  });
});

describe("AudioQueue", () => {
  it("starts with empty queue and not playing", () => {
    const queue = new AudioQueue({ fetchAudio: vi.fn() });
    expect(queue.pending).toBe(0);
    expect(queue.isPlaying).toBe(false);
  });

  it("processes a single enqueued item", async () => {
    const mockFetch = vi.fn(() => Promise.resolve(new ArrayBuffer(8)));
    const queue = new AudioQueue({ fetchAudio: mockFetch });

    queue.enqueue("Hello");

    // Wait for fetch to be called
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledWith("Hello"));
    expect(mockPlay).toHaveBeenCalledTimes(1);

    // Simulate audio ended
    capturedOnended!();

    await vi.waitFor(() => expect(queue.isPlaying).toBe(false));
  });

  it("processes items sequentially", async () => {
    const callOrder: string[] = [];
    const mockFetch = vi.fn((text: string) => {
      callOrder.push(text);
      return Promise.resolve(new ArrayBuffer(8));
    });
    const queue = new AudioQueue({ fetchAudio: mockFetch });

    queue.enqueue("First");
    queue.enqueue("Second");

    // First item fetched
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledWith("First"));
    expect(queue.pending).toBe(1);

    // Complete first
    capturedOnended!();

    // Second item fetched
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledWith("Second"));

    // Complete second
    capturedOnended!();
    await vi.waitFor(() => expect(queue.isPlaying).toBe(false));

    expect(callOrder).toEqual(["First", "Second"]);
  });

  it("skips items that fail to fetch", async () => {
    let callCount = 0;
    const mockFetch = vi.fn(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("Network error"));
      return Promise.resolve(new ArrayBuffer(8));
    });
    const queue = new AudioQueue({ fetchAudio: mockFetch });

    queue.enqueue("Fail");
    queue.enqueue("Succeed");

    // First fails, second should be fetched
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    // Complete second
    capturedOnended!();
    await vi.waitFor(() => expect(queue.isPlaying).toBe(false));
  });

  it("handles playback error gracefully", async () => {
    const mockFetch = vi.fn(() => Promise.resolve(new ArrayBuffer(8)));
    const queue = new AudioQueue({ fetchAudio: mockFetch });

    queue.enqueue("Error item");
    queue.enqueue("Next item");

    await vi.waitFor(() => expect(mockPlay).toHaveBeenCalledTimes(1));

    // Simulate playback error
    capturedOnerror!();

    // Next item should still be processed
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    capturedOnended!();
    await vi.waitFor(() => expect(queue.isPlaying).toBe(false));
  });

  it("clear stops current audio and empties queue", async () => {
    const mockFetch = vi.fn(() => Promise.resolve(new ArrayBuffer(8)));
    const queue = new AudioQueue({ fetchAudio: mockFetch });

    queue.enqueue("One");
    queue.enqueue("Two");
    queue.enqueue("Three");

    await vi.waitFor(() => expect(mockPlay).toHaveBeenCalledTimes(1));

    queue.clear();
    expect(queue.pending).toBe(0);
    expect(mockPause).toHaveBeenCalledTimes(1);
  });
});
