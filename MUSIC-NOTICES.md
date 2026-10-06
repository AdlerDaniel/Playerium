# Separately executed music tools

Playerium communicates with these unmodified command-line programs through their
standard command-line/JSON interface. The Android Java/Kotlin wrapper classes from
the distribution archives are not linked or included in Playerium.

- yt-dlp 2026.08.19 (Windows): [source and licenses](https://github.com/yt-dlp/yt-dlp/tree/2026.08.19). The packaged executable includes third-party components; see its upstream third-party licenses.
- FFmpeg 8.1 build `n8.1.3-14-g330caae0c1` (Windows): GPLv3 build. [Build scripts and source retrieval instructions](https://github.com/BtbN/FFmpeg-Builds/tree/autobuild-2026-10-06-13-06), [FFmpeg source](https://github.com/FFmpeg/FFmpeg/tree/330caae0c1).
- Android Python, QuickJS, yt-dlp and FFmpeg executables are extracted from the pinned `library`/`ffmpeg` 0.18.1 runtime distributions. [Distribution source and build instructions](https://github.com/yausername/youtubedl-android), [Python](https://www.python.org/psf/license/), [QuickJS](https://bellard.org/quickjs/), [yt-dlp](https://github.com/yt-dlp/yt-dlp), [FFmpeg](https://ffmpeg.org/legal.html).

Exact download URLs and SHA-256 checksums are recorded in
`scripts/prepare_music_runtime.py`. These tools have no warranty. Their licenses
and corresponding build sources remain available from the linked upstream
projects; redistribution must preserve the applicable notices and source access.

Android WebP/sharpyuv dependencies are rebuilt from unmodified libwebp 1.5.0
source with 16 KB ELF page alignment. The exact source archive, checksum and
complete build commands are in `scripts/align_android_webp.py`.
[Corresponding source](https://github.com/webmproject/libwebp/tree/v1.5.0).
The Android yt-dlp zip uses the pinned 2026.08.19 extractors and bundled EJS solver;
the runtime distribution's older extractors are replaced during preparation.

Unmodified license texts are included in `assets/music-licenses/` in both builds,
including the packaged Windows FFmpeg license and yt-dlp's third-party notices.
Source retrieval/build instructions for the Android executables:
[Python](https://github.com/yausername/youtubedl-android/blob/0.18.1/BUILD_PYTHON.md),
[FFmpeg](https://github.com/yausername/youtubedl-android/blob/0.18.1/BUILD_FFMPEG.md),
[QuickJS](https://github.com/yausername/youtubedl-android/tree/0.18.1).
