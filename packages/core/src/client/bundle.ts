import type { BundledFile } from "../preset";
import { decodeUtf8, encodeUtf8, toUint8Array } from "../utils/encoding";

export function decodeBundledFile(file: BundledFile): Uint8Array {
  return encodeUtf8(file.contents);
}

export async function verifyBundledFileChecksum(
  file: BundledFile,
  payload: ArrayBuffer | ArrayBufferView
) {
  const bytes = toUint8Array(payload);
  const computed = await sha256Hex(bytes);
  if (computed !== file.checksum) {
    throw new Error(
      `Checksum mismatch for ${file.path}. Expected ${file.checksum}, received ${computed}.`
    );
  }
}

export function isLikelyText(payload: ArrayBuffer | ArrayBufferView) {
  const bytes = toUint8Array(payload);
  const sample = bytes.subarray(0, Math.min(bytes.length, 128));
  for (const byte of sample) {
    if (byte === 0) {
      return false;
    }
    if (byte < 0x09) {
      return false;
    }
    if (byte > 0x0d && byte < 0x20) {
      return false;
    }
  }
  return true;
}

export function toUtf8String(payload: ArrayBuffer | ArrayBufferView) {
  return decodeUtf8(payload);
}

async function sha256Hex(payload: Uint8Array) {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) {
    throw new Error("SHA-256 hashing requires Web Crypto API support.");
  }
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
