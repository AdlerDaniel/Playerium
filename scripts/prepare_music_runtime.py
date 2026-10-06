"""Bundle separately executed, pinned audio tools; never include Android wrapper classes."""
import hashlib, io, json, pathlib, posixpath, stat, sys, urllib.request, zipfile
ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / 'build' / 'music-cache'
CACHE.mkdir(parents=True, exist_ok=True)
def download(url, digest):
    target = CACHE / digest
    if not target.exists() or hashlib.file_digest(target.open('rb'), 'sha256').hexdigest() != digest:
        with urllib.request.urlopen(url, timeout=120) as response, target.open('wb') as output:
            while chunk := response.read(1024 * 1024): output.write(chunk)
    if hashlib.file_digest(target.open('rb'), 'sha256').hexdigest() != digest:
        target.unlink(); raise RuntimeError('Music runtime checksum mismatch')
    return target.read_bytes()
def write(target, data):
    target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
def native_archive(data):
    # Java's ZipInputStream does not preserve Unix symlinks. Record them explicitly
    # so the on-device loader sees ELF libraries rather than tiny link text files.
    output=io.BytesIO();links={}
    with zipfile.ZipFile(io.BytesIO(data)) as source,zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as result:
        for entry in source.infolist():
            if stat.S_ISLNK(entry.external_attr>>16):
                target=source.read(entry).decode();resolved=posixpath.normpath(posixpath.join(posixpath.dirname(entry.filename),target))
                if target.startswith('/') or resolved.startswith('../') or resolved not in source.namelist():raise RuntimeError('Invalid runtime link')
                links[entry.filename]=target
            else:result.writestr(entry,source.read(entry))
        result.writestr('playerium-links.json',json.dumps(links))
    return output.getvalue()
if '--windows' in sys.argv:
    target = ROOT / 'build' / 'music-tools'
    write(target / 'yt-dlp.exe', download('https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp.exe', '66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a'))
    archive = zipfile.ZipFile(io.BytesIO(download('https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-06-13-06/ffmpeg-n8.1.3-14-g330caae0c1-win64-gpl-8.1.zip','c63157b215689081065ae7e545e6b60ca57f2a004c5f5625100483e8942899b5')))
    for name in ['ffmpeg.exe','ffprobe.exe']:
        member = next(n for n in archive.namelist() if n.endswith('/bin/' + name))
        write(target / name, archive.read(member))
elif '--android' in sys.argv:
    bundled_python = None
    hashes={'library':'579b5fb480892b1abc2b218c2089699d52759cc8d7ba256bf876453f0365faef','ffmpeg':'0a87ffa6cf912b0fe76c1a99b9107f543ee2f247935fae2c71f0822eb7bc5f49'}
    for artifact,digest in hashes.items():
        url=f'https://repo.maven.apache.org/maven2/io/github/junkfood02/youtubedl-android/{artifact}/0.18.1/{artifact}-0.18.1.aar'
        archive=zipfile.ZipFile(io.BytesIO(download(url,digest)))
        for name in archive.namelist():
            if name.startswith('jni/') and name.endswith('.so'):
                data=archive.read(name)
                write(ROOT / 'android/app/src/main/jniLibs' / name.removeprefix('jni/'),native_archive(data) if name.endswith('.zip.so') else data)
            elif name=='res/raw/ytdlp':
                bundled_python = archive.read(name)
    # Retain Android-compatible dependencies and use current, pinned extractors.
    latest = zipfile.ZipFile(io.BytesIO(download('https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp','1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6')))
    output=io.BytesIO()
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as result:
        with zipfile.ZipFile(io.BytesIO(bundled_python)) as old:
            for name in old.namelist():
                if name not in latest.namelist() and not name.startswith(('yt_dlp/','yt_dlp_ejs/')):
                    result.writestr(name,old.read(name))
        for archive in [latest]:
            for name in archive.namelist():
                result.writestr(name,archive.read(name))
    write(ROOT / 'android/app/src/main/assets/music-runtime/yt-dlp',output.getvalue())
else: raise SystemExit('Specify --windows or --android')
print('Verified music runtime prepared')
