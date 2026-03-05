const fs = require("fs");
const path = require("path");

let _decodeMap = null;

function initRPack() {
  if (_decodeMap) return true;
  const mapPath = path.join(__dirname, "..", "rpack_map.bin");
  if (!fs.existsSync(mapPath)) {
    console.error("  ⚠️  rpack_map.bin 없음 — module.risum 디코딩 불가");
    return false;
  }
  const mapData = fs.readFileSync(mapPath);
  if (mapData.length < 512) {
    console.error("  ⚠️  rpack_map.bin 손상 — module.risum 디코딩 불가");
    return false;
  }
  _decodeMap = mapData.subarray(256, 512);
  return true;
}

function decodeRPack(data) {
  if (!_decodeMap) return data;
  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = _decodeMap[data[i]];
  }
  return result;
}

function parseCharx(buf) {
  let unzipSync;
  try {
    ({ unzipSync } = require("fflate"));
  } catch {
    console.error("  ❌ fflate 패키지가 필요합니다. npm install 을 실행하세요.");
    process.exit(1);
  }

  const unzipped = unzipSync(new Uint8Array(buf));
  const result = { card: null, moduleData: null, assets: {} };

  for (const filename in unzipped) {
    if (filename === "card.json") {
      result.card = JSON.parse(Buffer.from(unzipped[filename]).toString("utf-8"));
    } else if (filename === "module.risum") {
      result.moduleData = Buffer.from(unzipped[filename]);
    } else {
      result.assets[filename] = unzipped[filename];
    }
  }

  return result;
}

function parseModuleRisum(buf) {
  if (!initRPack()) return null;

  let pos = 0;

  const magic = buf[pos++];
  if (magic !== 111) {
    console.error(`  ⚠️  module.risum: 잘못된 매직 넘버 (${magic}, 기대: 111)`);
    return null;
  }

  const version = buf[pos++];
  if (version !== 0) {
    console.error(`  ⚠️  module.risum: 지원하지 않는 버전 (${version})`);
    return null;
  }

  const mainLen = buf.readUInt32LE(pos);
  pos += 4;

  if (pos + mainLen > buf.length) {
    console.error("  ⚠️  module.risum: 데이터 크기 불일치");
    return null;
  }

  const mainData = buf.subarray(pos, pos + mainLen);
  const decoded = decodeRPack(mainData);

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(decoded).toString("utf-8"));
  } catch (e) {
    console.error("  ⚠️  module.risum: JSON 파싱 실패 —", e.message);
    return null;
  }

  if (parsed.type !== "risuModule") {
    console.error(`  ⚠️  module.risum: 잘못된 타입 (${parsed.type})`);
    return null;
  }

  return parsed.module;
}

module.exports = {
  parseCharx,
  parseModuleRisum,
};
