const MAX_DATA_URI_BYTES = 50 * 1024 * 1024;

function resolveAssetUri(uri, assetDict) {
  if (typeof uri !== "string") return null;

  const dict = assetDict && typeof assetDict === "object" ? assetDict : {};

  if (uri.startsWith("__asset:")) {
    const index = uri.slice("__asset:".length);
    return {
      data: dict[index] || null,
      type: "asset-index",
      metadata: { index },
    };
  }

  if (uri.startsWith("embeded://")) {
    const path = uri.slice("embeded://".length);
    return {
      data: dict[path] || null,
      type: "embedded",
      metadata: { path },
    };
  }

  if (uri.startsWith("embedded://")) {
    const path = uri.slice("embedded://".length);
    return {
      data: dict[path] || null,
      type: "embedded",
      metadata: { path },
    };
  }

  if (uri === "ccdefault:") {
    return {
      data: null,
      type: "ccdefault",
      metadata: {},
    };
  }

  if (uri.startsWith("data:")) {
    const match = /^data:([^;,]+);base64,(.+)$/.exec(uri);
    if (!match) return null;

    const mime = match[1];
    const payload = match[2];
    if (payload.length * 0.75 > MAX_DATA_URI_BYTES) {
      console.warn("[uri-resolver] data URI payload exceeds 50MB limit");
      return null;
    }

    return {
      data: Buffer.from(payload, "base64"),
      type: "data-uri",
      metadata: { mime },
    };
  }

  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    return {
      data: null,
      type: "remote",
      metadata: { url: uri },
    };
  }

  return null;
}

function guessMimeExt(mime) {
  const table = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
  };

  return table[mime] || ".bin";
}

module.exports = { resolveAssetUri, guessMimeExt };
