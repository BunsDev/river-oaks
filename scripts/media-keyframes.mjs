// Keyframe times (ms) of the video track in an MP4 (sync-sample table) or a WebM (SimpleBlock and
// BlockGroup keyframes), read without a decoder. A seek decodes from the keyframe before its target,
// so the spacing bounds how long a viewer's seek freezes the film (#368 soak, 2026-10-16).
export function keyframeTimes(buf, kind) {
  return kind === 'mp4' ? mp4Keyframes(buf) : webmKeyframes(buf);
}

function boxes(buf, start, end) {
  const out = [];
  for (let p = start; p + 8 <= end;) {
    let size = buf.readUInt32BE(p), header = 8;
    if (size === 1) { size = Number(buf.readBigUInt64BE(p + 8)); header = 16; } else if (size === 0) size = end - p;
    out.push({ type: buf.toString('latin1', p + 4, p + 8), start: p + header, end: p + size });
    p += size;
  }
  return out;
}
const child = (buf, box, type) => boxes(buf, box.start, box.end).find(b => b.type === type);

function mp4Keyframes(buf) {
  const moov = boxes(buf, 0, buf.length).find(b => b.type === 'moov');
  for (const trak of boxes(buf, moov.start, moov.end).filter(b => b.type === 'trak')) {
    const mdia = child(buf, trak, 'mdia'), hdlr = child(buf, mdia, 'hdlr');
    if (buf.toString('latin1', hdlr.start + 8, hdlr.start + 12) !== 'vide') continue;
    const mdhd = child(buf, mdia, 'mdhd'), timescale = buf.readUInt32BE(mdhd.start + (buf[mdhd.start] === 1 ? 20 : 12));
    const stbl = child(buf, child(buf, mdia, 'minf'), 'stbl'), stts = child(buf, stbl, 'stts'), stss = child(buf, stbl, 'stss');
    const times = [];
    for (let i = 0, t = 0, n = buf.readUInt32BE(stts.start + 4); i < n; i++) {
      const count = buf.readUInt32BE(stts.start + 8 + i * 8), delta = buf.readUInt32BE(stts.start + 12 + i * 8);
      for (let k = 0; k < count; k++, t += delta) times.push(t);
    }
    const sync = stss ? Array.from({ length: buf.readUInt32BE(stss.start + 4) }, (_, i) => buf.readUInt32BE(stss.start + 8 + i * 4)) : times.map((_, i) => i + 1);
    return sync.map(n => times[n - 1] * 1000 / timescale);
  }
  throw new Error('no video track');
}

// EBML variable-length integers: an ID keeps its marker bit; a size drops it (all ones = unknown).
function vint(buf, p, marker) {
  const first = buf[p]; let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  let value = marker ? first : first & ((0x80 >> (len - 1)) - 1);
  for (let i = 1; i < len; i++) value = value * 256 + buf[p + i];
  return { value, len, unknown: !marker && value === 2 ** (7 * len) - 1 };
}
const MASTERS = new Set([0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0x1f43b675, 0xa0]);
const uint = (buf, start, end) => { let v = 0; for (let p = start; p < end; p++) v = v * 256 + buf[p]; return v; };

function webmKeyframes(buf) {
  let scale = 1e6, video = null, cluster = 0;
  const blocks = [];
  const walk = (start, end, group) => {
    for (let p = start; p < end;) {
      const id = vint(buf, p, true), size = vint(buf, p + id.len, false), body = p + id.len + size.len;
      const stop = size.unknown ? end : Math.min(end, body + size.value);
      if (id.value === 0xa0) { const g = { ref: false }; walk(body, stop, g); if (g.block) blocks.push({ ...g.block, key: !g.ref }); }
      else if (MASTERS.has(id.value)) walk(body, stop, group);
      else if (id.value === 0x2ad7b1) scale = uint(buf, body, stop);
      else if (id.value === 0xd7) group && (group.track = uint(buf, body, stop));
      else if (id.value === 0x83 && uint(buf, body, stop) === 1) video = 'pending';
      else if (id.value === 0xe7) cluster = uint(buf, body, stop);
      else if (id.value === 0xa3 || id.value === 0xa1) {
        const track = vint(buf, body, false), rel = buf.readInt16BE(body + track.len), flags = buf[body + track.len + 2];
        const block = { track: track.value, time: cluster + rel };
        if (id.value === 0xa3) blocks.push({ ...block, key: Boolean(flags & 0x80) }); else group.block = block;
      } else if (id.value === 0xfb) group && (group.ref = true);
      if (id.value === 0xae && video === 'pending') { video = trackOf(buf, body, stop); }
      p = stop;
    }
  };
  walk(0, buf.length, null);
  return blocks.filter(b => b.key && b.track === video).map(b => b.time * scale / 1e6);
}
// The TrackNumber of a TrackEntry whose TrackType is video.
function trackOf(buf, start, end) {
  for (let p = start; p < end;) {
    const id = vint(buf, p, true), size = vint(buf, p + id.len, false), body = p + id.len + size.len;
    if (id.value === 0xd7) return uint(buf, body, body + size.value);
    p = body + size.value;
  }
  return null;
}
