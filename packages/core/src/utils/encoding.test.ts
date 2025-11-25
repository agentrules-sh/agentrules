import { describe, expect, it } from "bun:test";
import { decodeUtf8, encodeUtf8, toPosixPath, toUint8Array } from "./encoding";

describe("toPosixPath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(toPosixPath("foo\\bar\\baz")).toBe("foo/bar/baz");
  });

  it("leaves forward slashes unchanged", () => {
    expect(toPosixPath("foo/bar/baz")).toBe("foo/bar/baz");
  });

  it("handles mixed slashes", () => {
    expect(toPosixPath("foo\\bar/baz\\qux")).toBe("foo/bar/baz/qux");
  });

  it("handles empty string", () => {
    expect(toPosixPath("")).toBe("");
  });
});

describe("encodeUtf8", () => {
  it("encodes ASCII string to Uint8Array", () => {
    const result = encodeUtf8("hello");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(5);
    expect(Array.from(result)).toEqual([0x68, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  it("encodes Unicode characters", () => {
    const result = encodeUtf8("héllo 世界");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(9); // multi-byte chars
  });

  it("handles empty string", () => {
    const result = encodeUtf8("");
    expect(result.length).toBe(0);
  });
});

describe("decodeUtf8", () => {
  it("decodes Uint8Array to string", () => {
    const bytes = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]);
    expect(decodeUtf8(bytes)).toBe("hello");
  });

  it("decodes ArrayBuffer", () => {
    const bytes = new Uint8Array([0x68, 0x69]).buffer;
    expect(decodeUtf8(bytes)).toBe("hi");
  });

  it("roundtrips with encodeUtf8", () => {
    const original = "Hello, 世界! 🎉";
    const encoded = encodeUtf8(original);
    const decoded = decodeUtf8(encoded);
    expect(decoded).toBe(original);
  });
});

describe("toUint8Array", () => {
  it("returns Uint8Array unchanged", () => {
    const input = new Uint8Array([1, 2, 3]);
    const result = toUint8Array(input);
    expect(result).toBe(input);
  });

  it("converts ArrayBuffer to Uint8Array", () => {
    const buffer = new ArrayBuffer(3);
    const view = new Uint8Array(buffer);
    view.set([1, 2, 3]);

    const result = toUint8Array(buffer);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([1, 2, 3]);
  });

  it("converts DataView to Uint8Array", () => {
    const buffer = new ArrayBuffer(4);
    const fullView = new Uint8Array(buffer);
    fullView.set([0, 1, 2, 3]);

    const dataView = new DataView(buffer, 1, 2);
    const result = toUint8Array(dataView);
    expect(Array.from(result)).toEqual([1, 2]);
  });
});
