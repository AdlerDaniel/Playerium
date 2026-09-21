/**
 * Spotify Local Player - Lyrics Parser & Synchronizer
 * Supports LRC format ([00:12.34] Lyrics text) and plain text lyrics.
 */

export class LyricsEngine {
  constructor() {
    this.lines = []; // Array of { time: number (in seconds), text: string }
    this.isSynced = false;
    this.activeLineIndex = -1;
  }

  /**
   * Load and parse lyrics string
   * @param {string} rawLyrics
   */
  loadLyrics(rawLyrics) {
    this.lines = [];
    this.isSynced = false;
    this.activeLineIndex = -1;

    if (!rawLyrics || typeof rawLyrics !== "string") {
      return;
    }

    const rawLines = rawLyrics.split(/\r?\n/);
    const parsedLines = [];
    const lrcRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

    let hasTimeTags = false;

    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let match;
      let text = trimmed.replace(lrcRegex, "").trim();
      let matchedTimes = [];

      lrcRegex.lastIndex = 0;
      while ((match = lrcRegex.exec(trimmed)) !== null) {
        hasTimeTags = true;
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const millisStr = match[3] || "0";
        const millis = parseFloat("0." + millisStr) * 1000;
        const totalSeconds = minutes * 60 + seconds + millis / 1000;
        matchedTimes.push(totalSeconds);
      }

      if (matchedTimes.length > 0) {
        matchedTimes.forEach((time) => {
          parsedLines.push({ time, text });
        });
      } else if (!hasTimeTags) {
        // Plain text line
        parsedLines.push({ time: null, text: trimmed });
      }
    }

    if (hasTimeTags && parsedLines.length > 0) {
      // Sort by time
      parsedLines.sort((a, b) => (a.time || 0) - (b.time || 0));
      this.lines = parsedLines;
      this.isSynced = true;
    } else {
      this.lines = parsedLines;
      this.isSynced = false;
    }
  }

  /**
   * Update active line index based on current audio playback time
   * @param {number} currentTime
   * @returns {number} active line index
   */
  updateTime(currentTime) {
    if (!this.isSynced || this.lines.length === 0) {
      return -1;
    }

    let newIndex = -1;
    for (let i = 0; i < this.lines.length; i++) {
      if (currentTime >= this.lines[i].time) {
        newIndex = i;
      } else {
        break;
      }
    }

    if (newIndex !== this.activeLineIndex) {
      this.activeLineIndex = newIndex;
      return newIndex;
    }

    return -1; // No change
  }

  hasLyrics() {
    return this.lines.length > 0;
  }
}
