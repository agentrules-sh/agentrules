export function toPosixPath(pathValue: string) {
  return pathValue.split("\\").join("/");
}

export function encodeUtf8(value: string) {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "utf8"));
  }
  return new TextEncoder().encode(value);
}

export function decodeUtf8(payload: ArrayBuffer | ArrayBufferView) {
  const bytes = toUint8Array(payload);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("utf8");
  }
  return new TextDecoder("utf-8", { fatal: false, ignoreBOM: false }).decode(
    bytes
  );
}

export function toUint8Array(payload: ArrayBuffer | ArrayBufferView) {
  if (payload instanceof Uint8Array) {
    return payload;
  }
  if (ArrayBuffer.isView(payload)) {
    return new Uint8Array(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength
    );
  }
  return new Uint8Array(payload);
}
