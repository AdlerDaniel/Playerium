/**
 * Spotify Local Player - ID3 & Audio Metadata Parser
 * Pure JavaScript parser for ID3v2, ID3v1, and FLAC/Vorbis comments
 * Extracts: Title, Artist, Album, Year, Track Number, Embedded Album Art, Lyrics.
 */

export class ID3Parser {
  /**
   * Parse an audio File or Blob and return metadata object
   * @param {File} file
   * @returns {Promise<Object>}
   */
  static async parseFile(file) {
    const filename = file.name;
    const cleanName = filename.replace(/\.[^/.]+$/, "");
    
    // Default fallback metadata from filename
    let metadata = {
      title: cleanName,
      artist: "Неизвестный исполнитель",
      album: "Неизвестный альбом",
      year: "",
      trackNo: "",
      duration: 0,
      pictureUrl: null,
      lyrics: null,
      fileName: filename,
      fileSize: file.size,
      lastModified: file.lastModified
    };

    // Parse simple "Artist - Title" filename pattern as initial guess
    if (cleanName.includes(" - ")) {
      const parts = cleanName.split(" - ");
      metadata.artist = parts[0].trim();
      metadata.title = parts.slice(1).join(" - ").trim();
    }

    try {
      // Read first 512KB for ID3v2 header and tags
      const headerBlob = file.slice(0, Math.min(file.size, 512 * 1024));
      const buffer = await headerBlob.arrayBuffer();
      const view = new DataView(buffer);

      // Check for ID3v2 ('ID3')
      if (view.byteLength >= 10 &&
          view.getUint8(0) === 0x49 && // 'I'
          view.getUint8(1) === 0x44 && // 'D'
          view.getUint8(2) === 0x33) {  // '3'
        const id3Data = this.parseID3v2(view, buffer);
        metadata = { ...metadata, ...id3Data };
      } 
      // Check for FLAC ('fLaC')
      else if (view.byteLength >= 4 &&
               view.getUint8(0) === 0x66 && // 'f'
               view.getUint8(1) === 0x4C && // 'L'
               view.getUint8(2) === 0x61 && // 'a'
               view.getUint8(3) === 0x43) {  // 'C'
        const flacData = this.parseFLAC(view, buffer);
        metadata = { ...metadata, ...flacData };
      } 
      else {
        // Fallback: check for ID3v1 at the end of the file (last 128 bytes)
        if (file.size > 128) {
          const tailBlob = file.slice(file.size - 128, file.size);
          const tailBuffer = await tailBlob.arrayBuffer();
          const tailView = new DataView(tailBuffer);
          if (tailView.getUint8(0) === 0x54 && // 'T'
              tailView.getUint8(1) === 0x41 && // 'A'
              tailView.getUint8(2) === 0x47) {  // 'G'
            const id3v1 = this.parseID3v1(tailView);
            metadata = { ...metadata, ...id3v1 };
          }
        }
      }
    } catch (e) {
      console.warn("Metadata parsing error for file:", filename, e);
    }

    // Get audio duration using HTML5 Audio metadata if not found
    if (!metadata.duration || metadata.duration <= 0) {
      try {
        metadata.duration = await this.probeDuration(file);
      } catch {
        metadata.duration = 0;
      }
    }

    return metadata;
  }

  /**
   * Probe audio file duration via a temporary offscreen Audio object
   */
  static probeDuration(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.preload = "metadata";

      const cleanup = () => {
        URL.revokeObjectURL(url);
        audio.removeAttribute("src");
        audio.load();
      };

      audio.onloadedmetadata = () => {
        const dur = Math.round(audio.duration || 0);
        cleanup();
        resolve(dur);
      };

      audio.onerror = () => {
        cleanup();
        resolve(0);
      };

      // Timeout fallback after 2.5s
      setTimeout(() => {
        cleanup();
        resolve(0);
      }, 2500);

      audio.src = url;
    });
  }

  /**
   * Parse ID3v2.3 / ID3v2.4 frame headers
   */
  static parseID3v2(view, buffer) {
    const version = view.getUint8(3); // e.g. 3 for ID3v2.3, 4 for ID3v2.4
    const flags = view.getUint8(5);
    const hasExtendedHeader = (flags & 0x40) !== 0;

    // Synchsafe integer size of tag
    let tagSize = ((view.getUint8(6) & 0x7f) << 21) |
                  ((view.getUint8(7) & 0x7f) << 14) |
                  ((view.getUint8(8) & 0x7f) << 7) |
                  (view.getUint8(9) & 0x7f);

    let offset = 10;
    if (hasExtendedHeader && offset < buffer.byteLength) {
      const extSize = view.getUint32(offset);
      offset += (version === 4 ? this.parseSynchsafe(view, offset) : extSize);
    }

    const result = {};
    const maxOffset = Math.min(buffer.byteLength, tagSize + 10);

    while (offset + 10 < maxOffset) {
      // Read 4-character frame ID
      const f1 = String.fromCharCode(view.getUint8(offset));
      const f2 = String.fromCharCode(view.getUint8(offset + 1));
      const f3 = String.fromCharCode(view.getUint8(offset + 2));
      const f4 = String.fromCharCode(view.getUint8(offset + 3));
      const frameId = f1 + f2 + f3 + f4;

      if (!/^[A-Z0-9]{4}$/.test(frameId)) {
        break; // Reached padding or invalid bytes
      }

      let frameSize;
      if (version === 4) {
        frameSize = this.parseSynchsafe(view, offset + 4);
      } else {
        frameSize = view.getUint32(offset + 4);
      }

      offset += 10; // Skip frame ID & size & flags
      if (frameSize <= 0 || offset + frameSize > buffer.byteLength) {
        break;
      }

      const frameData = new Uint8Array(buffer, offset, frameSize);
      this.decodeFrame(frameId, frameData, result);
      offset += frameSize;
    }

    return result;
  }

  static parseSynchsafe(view, offset) {
    return ((view.getUint8(offset) & 0x7f) << 21) |
           ((view.getUint8(offset + 1) & 0x7f) << 14) |
           ((view.getUint8(offset + 2) & 0x7f) << 7) |
           (view.getUint8(offset + 3) & 0x7f);
  }

  static decodeFrame(frameId, data, result) {
    try {
      if (["TIT2", "TT2"].includes(frameId)) {
        result.title = this.decodeText(data).trim() || result.title;
      } else if (["TPE1", "TP1"].includes(frameId)) {
        result.artist = this.decodeText(data).trim() || result.artist;
      } else if (["TALB", "TAL"].includes(frameId)) {
        result.album = this.decodeText(data).trim() || result.album;
      } else if (["TYER", "TDRC", "TYE"].includes(frameId)) {
        result.year = this.decodeText(data).trim();
      } else if (["TRCK", "TRK"].includes(frameId)) {
        result.trackNo = this.decodeText(data).trim();
      } else if (["USLT", "ULT"].includes(frameId)) {
        result.lyrics = this.decodeLyrics(data);
      } else if (["APIC", "PIC"].includes(frameId) && !result.pictureUrl) {
        result.pictureUrl = this.decodePicture(data);
      }
    } catch (e) {
      console.warn("Error decoding frame", frameId, e);
    }
  }

  static decodeText(bytes) {
    if (!bytes || bytes.length < 2) return "";
    const encoding = bytes[0];
    const payload = bytes.subarray(1);

    try {
      if (encoding === 0) {
        // ISO-8859-1 (Latin1) / Windows-1251 fallback
        return new TextDecoder("windows-1251").decode(payload).replace(/\0+$/, "");
      } else if (encoding === 1) {
        // UTF-16 with BOM
        return new TextDecoder("utf-16").decode(payload).replace(/\0+$/, "");
      } else if (encoding === 2) {
        // UTF-16BE
        return new TextDecoder("utf-16be").decode(payload).replace(/\0+$/, "");
      } else if (encoding === 3) {
        // UTF-8
        return new TextDecoder("utf-8").decode(payload).replace(/\0+$/, "");
      }
    } catch {
      // Generic UTF-8 fallback
      return new TextDecoder("utf-8").decode(payload).replace(/\0+$/, "");
    }
    return "";
  }

  static decodeLyrics(bytes) {
    if (!bytes || bytes.length < 5) return null;
    const encoding = bytes[0];
    // Next 3 bytes are language code (e.g. 'eng')
    let offset = 4;
    // Skip content descriptor until null terminator
    while (offset < bytes.length && bytes[offset] !== 0) {
      offset++;
    }
    offset++; // Skip null byte
    if (encoding === 1 || encoding === 2) offset++; // 16-bit null

    if (offset >= bytes.length) return null;
    return this.decodeText(bytes.subarray(offset - 1));
  }

  static decodePicture(bytes) {
    if (!bytes || bytes.length < 10) return null;
    const encoding = bytes[0];
    let offset = 1;

    // MIME type string (null-terminated ASCII)
    let mime = "";
    while (offset < bytes.length && bytes[offset] !== 0) {
      mime += String.fromCharCode(bytes[offset]);
      offset++;
    }
    offset++; // Skip null
    if (!mime) mime = "image/jpeg";

    const picType = bytes[offset]; // 3 = front cover
    offset++; // Skip picture type

    // Skip description until null terminator
    if (encoding === 1 || encoding === 2) {
      // 16-bit null
      while (offset + 1 < bytes.length && !(bytes[offset] === 0 && bytes[offset + 1] === 0)) {
        offset += 2;
      }
      offset += 2;
    } else {
      while (offset < bytes.length && bytes[offset] !== 0) {
        offset++;
      }
      offset++;
    }

    if (offset >= bytes.length) return null;

    const imgBytes = bytes.subarray(offset);
    const blob = new Blob([imgBytes], { type: mime });
    return URL.createObjectURL(blob);
  }

  /**
   * Parse ID3v1 tags (last 128 bytes of MP3 file)
   */
  static parseID3v1(view) {
    const decoder = new TextDecoder("windows-1251");
    const getStr = (start, length) => {
      const arr = new Uint8Array(view.buffer, view.byteOffset + start, length);
      return decoder.decode(arr).replace(/\0+$/, "").trim();
    };

    return {
      title: getStr(3, 30) || undefined,
      artist: getStr(33, 30) || undefined,
      album: getStr(63, 30) || undefined,
      year: getStr(93, 4) || undefined
    };
  }

  /**
   * Parse FLAC Vorbis Comments
   */
  static parseFLAC(view, buffer) {
    const result = {};
    let offset = 4; // Skip 'fLaC'

    while (offset + 4 < buffer.byteLength) {
      const header = view.getUint8(offset);
      const isLast = (header & 0x80) !== 0;
      const blockType = header & 0x7F;
      const length = (view.getUint8(offset + 1) << 16) |
                     (view.getUint8(offset + 2) << 8) |
                     view.getUint8(offset + 3);

      offset += 4;

      if (blockType === 4 && offset + length <= buffer.byteLength) {
        // VORBIS_COMMENT
        const commentData = new DataView(buffer, offset, length);
        let commentOffset = 0;
        const vendorLen = commentData.getUint32(commentOffset, true);
        commentOffset += 4 + vendorLen;

        const count = commentData.getUint32(commentOffset, true);
        commentOffset += 4;

        const utf8 = new TextDecoder("utf-8");
        for (let i = 0; i < count && commentOffset + 4 <= length; i++) {
          const itemLen = commentData.getUint32(commentOffset, true);
          commentOffset += 4;
          if (commentOffset + itemLen <= length) {
            const strBytes = new Uint8Array(buffer, offset + commentOffset, itemLen);
            const entry = utf8.decode(strBytes);
            commentOffset += itemLen;

            const eqIdx = entry.indexOf("=");
            if (eqIdx !== -1) {
              const key = entry.slice(0, eqIdx).toUpperCase();
              const val = entry.slice(eqIdx + 1).trim();
              if (key === "TITLE") result.title = val;
              else if (key === "ARTIST") result.artist = val;
              else if (key === "ALBUM") result.album = val;
              else if (key === "DATE") result.year = val;
              else if (key === "TRACKNUMBER") result.trackNo = val;
            }
          }
        }
      } else if (blockType === 6 && offset + length <= buffer.byteLength) {
        // PICTURE BLOCK
        try {
          const picData = new DataView(buffer, offset, length);
          let pOff = 4; // skip pic type
          const mimeLen = picData.getUint32(pOff);
          pOff += 4;
          const mimeBytes = new Uint8Array(buffer, offset + pOff, mimeLen);
          const mime = new TextDecoder("ascii").decode(mimeBytes);
          pOff += mimeLen;

          const descLen = picData.getUint32(pOff);
          pOff += 4 + descLen;
          pOff += 16; // skip width, height, color depth, colors used
          const dataLen = picData.getUint32(pOff);
          pOff += 4;

          const imgBytes = new Uint8Array(buffer, offset + pOff, dataLen);
          const blob = new Blob([imgBytes], { type: mime || "image/jpeg" });
          result.pictureUrl = URL.createObjectURL(blob);
        } catch (e) {
          console.warn("FLAC picture parse error", e);
        }
      }

      offset += length;
      if (isLast) break;
    }

    return result;
  }
}
