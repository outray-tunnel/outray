const FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/** Validate the complete JPEG marker/scan structure without decoding its pixels. */
export function isValidJpeg(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let offset = 2;
  let frameComponents: Set<number> | undefined;
  let hasScan = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return false;
    const marker = bytes[offset++]!;
    if (marker === 0xd9) {
      return offset === bytes.length && !!frameComponents && hasScan;
    }
    // SOI, restart markers, and stuffed bytes are not length-prefixed segments.
    if (marker < 0xc0 || marker === 0xc8 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      return false;
    }
    if (offset + 2 > bytes.length) return false;
    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    const end = offset + length;
    if (length < 2 || end > bytes.length) return false;

    if (FRAME_MARKERS.has(marker)) {
      if (frameComponents || length < 8) return false;
      const precision = bytes[offset + 2]!;
      const height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!;
      const width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      const components = bytes[offset + 7]!;
      if (!precision || precision > 16 || !height || !width || !components || length !== 8 + components * 3) {
        return false;
      }
      frameComponents = new Set();
      for (let index = 0; index < components; index += 1) {
        const componentOffset = offset + 8 + index * 3;
        const id = bytes[componentOffset]!;
        const sampling = bytes[componentOffset + 1]!;
        const horizontal = sampling >> 4;
        const vertical = sampling & 0x0f;
        if (frameComponents.has(id) || horizontal < 1 || horizontal > 4 || vertical < 1 || vertical > 4 || bytes[componentOffset + 2]! > 3) {
          return false;
        }
        frameComponents.add(id);
      }
    }

    if (marker !== 0xda) {
      offset = end;
      continue;
    }
    if (!frameComponents || length < 6) return false;
    const scanComponents = bytes[offset + 2]!;
    if (!scanComponents || scanComponents > frameComponents.size || length !== 6 + scanComponents * 2) return false;
    const seen = new Set<number>();
    for (let index = 0; index < scanComponents; index += 1) {
      const componentOffset = offset + 3 + index * 2;
      const id = bytes[componentOffset]!;
      const tables = bytes[componentOffset + 1]!;
      if (!frameComponents.has(id) || seen.has(id) || (tables >> 4) > 3 || (tables & 0x0f) > 3) return false;
      seen.add(id);
    }
    const spectralOffset = offset + 3 + scanComponents * 2;
    if (bytes[spectralOffset]! > 63 || bytes[spectralOffset + 1]! > 63 || (bytes[spectralOffset + 2]! >> 4) > 13 || (bytes[spectralOffset + 2]! & 0x0f) > 13) {
      return false;
    }

    offset = end;
    let dataBytes = 0;
    let foundNextMarker = false;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        dataBytes += 1;
        offset += 1;
        continue;
      }
      const markerOffset = offset;
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) return false;
      const next = bytes[offset]!;
      if (next === 0x00) {
        // FF00 encodes one entropy byte; FF fill bytes require a real marker.
        if (offset !== markerOffset + 1) return false;
        dataBytes += 1;
        offset += 1;
      } else if (next >= 0xd0 && next <= 0xd7) {
        offset += 1;
      } else {
        offset = markerOffset;
        foundNextMarker = true;
        break;
      }
    }
    if (!dataBytes || !foundNextMarker) return false;
    hasScan = true;
  }
  return false;
}

export default { isValidJpeg };
