import { describe, expect, it } from "bun:test";
import type { BundledFile } from "../types";
import {
  decodeBundledFile,
  isLikelyText,
  toUtf8String,
  verifyBundledFileChecksum,
} from "./bundle";

const TEXT_FILE: BundledFile = {
  path: "notes.md",
  size: 5,
  checksum: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  contents: "hello",
};

describe("bundled file helpers", () => {
  it("decodes utf-8 payloads and validates checksums", async () => {
    const payload = decodeBundledFile(TEXT_FILE);
    expect(toUtf8String(payload)).toBe("hello");
    await expect(
      verifyBundledFileChecksum(TEXT_FILE, payload)
    ).resolves.toBeUndefined();
  });

  it("detects binary content with isLikelyText", () => {
    const textPayload = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
    const binaryPayload = new Uint8Array([0xff, 0x00, 0x10]);

    expect(isLikelyText(textPayload)).toBeTrue();
    expect(isLikelyText(binaryPayload)).toBeFalse();
  });
});
