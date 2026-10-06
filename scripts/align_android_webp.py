"""Rebuild the runtime's WebP dependencies for Android's 16 KB memory pages."""
import hashlib, io, os, pathlib, struct, subprocess, tarfile, urllib.request, zipfile
ROOT=pathlib.Path(__file__).resolve().parent.parent
WORK=ROOT/'build'/'android-webp'
WORK.mkdir(parents=True,exist_ok=True)
sdk=pathlib.Path(os.environ.get('ANDROID_HOME',os.environ.get('ANDROID_SDK_ROOT','/opt/android-sdk')))
candidates=[pathlib.Path(os.environ[k]) for k in ('ANDROID_NDK_HOME','ANDROID_NDK_ROOT','ANDROID_NDK_LATEST_HOME') if os.environ.get(k)]
candidates+=sorted((sdk/'ndk').glob('*'),reverse=True)
ndk=next((p for p in candidates if (p/'build/cmake/android.toolchain.cmake').exists()),None)
if ndk is None:raise SystemExit('Android NDK is required to build compatible music libraries')
archive=WORK/'libwebp-1.5.0.tar.gz'
digest='668c9aba45565e24c27e17f7aaf7060a399f7f31dba6c97a044e1feacb930f37'
if not archive.exists():archive.write_bytes(urllib.request.urlopen('https://github.com/webmproject/libwebp/archive/refs/tags/v1.5.0.tar.gz',timeout=60).read())
if hashlib.sha256(archive.read_bytes()).hexdigest()!=digest:raise SystemExit('WebP source checksum mismatch')
source=WORK/'libwebp-1.5.0'
if not source.exists():
    with tarfile.open(archive) as tar:tar.extractall(WORK,filter='data')
def check_pages(data):
    if data[:4]!=b'\x7fELF' or data[4]!=2:return
    offset=struct.unpack_from('<Q',data,32)[0];size,count=struct.unpack_from('<HH',data,54)
    for i in range(count):
        header=offset+i*size
        if struct.unpack_from('<I',data,header)[0]==1 and struct.unpack_from('<Q',data,header+48)[0]<16384:raise RuntimeError('Incompatible native library')
for abi in ('arm64-v8a','armeabi-v7a','x86','x86_64'):
    build=WORK/abi
    command=['cmake','-S',str(source),'-B',str(build),'-DCMAKE_TOOLCHAIN_FILE='+str(ndk/'build/cmake/android.toolchain.cmake'),'-DANDROID_ABI='+abi,'-DANDROID_PLATFORM=android-24','-DCMAKE_BUILD_TYPE=Release','-DBUILD_SHARED_LIBS=ON','-DCMAKE_SHARED_LINKER_FLAGS=-Wl,-z,max-page-size=16384']
    for option in ('ANIM_UTILS','CWEBP','DWEBP','GIF2WEBP','IMG2WEBP','VWEBP','WEBPINFO','WEBPMUX','EXTRAS'):command.append('-DWEBP_BUILD_'+option+'=OFF')
    subprocess.run(command,check=True);subprocess.run(['cmake','--build',str(build),'--parallel','4'],check=True)
    replacement={f.name:f.read_bytes() for f in build.rglob('*.so*') if f.is_file()}
    for name in ('libwebp.so','libwebpdecoder.so','libwebpdemux.so','libwebpmux.so','libsharpyuv.so'):
        if name not in replacement:raise RuntimeError('Missing WebP library: '+name)
    for data in replacement.values():check_pages(data)
    target=ROOT/'android/app/src/main/jniLibs'/abi/'libffmpeg.zip.so'
    output=io.BytesIO()
    with zipfile.ZipFile(target) as original,zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as result:
        for name in original.namelist():
            if pathlib.PurePosixPath(name).name not in replacement:result.writestr(name,original.read(name))
        for name,data in replacement.items():result.writestr('usr/lib/'+name,data)
    target.write_bytes(output.getvalue())
print('Android WebP libraries rebuilt and verified for 16 KB pages')
