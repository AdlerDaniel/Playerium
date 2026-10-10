// Read only the MP4 metadata atom, including when moov follows the audio payload.
export async function readMP4Metadata(file) {
  const result = {};
  let offset = 0;
  while (offset + 8 <= file.size) {
    const head = new DataView(await file.slice(offset, offset + 16).arrayBuffer());
    let size = head.getUint32(0), header = 8;
    const type = String.fromCharCode(...new Uint8Array(head.buffer, 4, 4));
    if (size === 1) { if (head.byteLength < 16) break; size = Number(head.getBigUint64(8)); header = 16; }
    if (size === 0) size = file.size - offset;
    if (!Number.isSafeInteger(size) || size < header || offset + size > file.size) break;
    if (type === 'moov') {
      if (size > 16 * 1024 * 1024) break;
      const bytes = new Uint8Array(await file.slice(offset + header, offset + size).arrayBuffer());
      const view = new DataView(bytes.buffer);
      const text = (start, end) => new TextDecoder().decode(bytes.subarray(start, end)).replace(/\0+$/, '').trim();
      const walk = (start, end, parent = '', depth = 0) => {
        if (depth > 12) return;
        for (let pos = start; pos + 8 <= end;) {
          let length = view.getUint32(pos), h = 8;
          const name = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
          if (length === 1) { if (pos + 16 > end) break; length = Number(view.getBigUint64(pos + 8)); h = 16; }
          if (!length) length = end - pos;
          if (!Number.isSafeInteger(length) || length < h || pos + length > end) break;
          const begin = pos + h, stop = pos + length;
          if (name === 'data' && begin + 8 <= stop) {
            const payload = begin + 8, format = view.getUint32(begin) & 0xffffff;
            const fields = {'©nam':'title','©ART':'artist','aART':'artist','©day':'year','©gen':'genre'};
            if (fields[parent] && (format === 1 || format === 0)) {
              const value = text(payload, stop);
              if (value && (!result[fields[parent]] || parent === '©ART')) result[fields[parent]] = value;
            } else if (parent === 'trkn' && payload + 4 <= stop) result.trackNo = view.getUint16(payload + 2);
            else if (parent === 'covr' && [13,14].includes(format) && stop - payload <= 8 * 1024 * 1024)
              result.pictureBlob = new Blob([bytes.subarray(payload, stop)], {type: format === 14 ? 'image/png' : 'image/jpeg'});
          } else if (name === 'mdhd') {
            const version = bytes[begin], scalePos = begin + (version === 1 ? 20 : 12), durationPos = scalePos + 4;
            if (durationPos + (version === 1 ? 8 : 4) <= stop) {
              const scale = view.getUint32(scalePos), ticks = version === 1 ? Number(view.getBigUint64(durationPos)) : view.getUint32(durationPos);
              if (scale && ticks > 0) result.duration = ticks / scale;
            }
          } else if (['moov','trak','mdia','udta','meta','ilst'].includes(name) || parent === 'ilst')
            walk(begin + (name === 'meta' ? 4 : 0), stop, name, depth + 1);
          pos = stop;
        }
      };
      walk(0, bytes.length);
      break;
    }
    offset += size;
  }
  return result;
}
