const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { scanDirectory, isInside, AUDIO_EXTS } = require('./desktop-files');
const { DesktopUpdater } = require('./desktop-updater');
const { DesktopMusic } = require('./desktop-music');

protocol.registerSchemesAsPrivileged([{ scheme: 'playerium-audio', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
const watchers = new Map();
let roots = new Set();
let rootsFile;
const sources = new Map();
let mainWindow;

async function authorize(filePath) {
  if (typeof filePath !== 'string') throw new Error('Invalid file path');
  const real = await fsp.realpath(filePath);
  if (![...roots].some(root => isInside(root, real))) throw new Error('Select this music folder before accessing its files');
  return real;
}
function trusted(event) {
  if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== pathToFileURL(path.join(__dirname, 'index.html')).href) throw new Error('Untrusted IPC sender');
}
function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => { trusted(event); return callback(...args); });
}
async function openExternal(url) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Unsupported URL');
  await shell.openExternal(parsed.href);
  return true;
}
function startWatchingFolder(root) {
  if (watchers.has(root)) return;
  let timer;
  let active = true;
  let scan = Promise.resolve();
  const watcher = fs.watch(root, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      scan = scan.catch(() => {}).then(async () => {
        try {
          const files = await scanDirectory(root);
          if (active) mainWindow?.webContents.send('folder:updated', { folderPath: root, folderName: path.basename(root), files, isInitial: false });
        } catch (error) {
          if (active) mainWindow?.webContents.send('folder:updated', { folderPath: root, error: 'Не удалось прочитать папку. Восстановите доступ к ней.' });
        }
      });
    }, 800);
  });
  watcher.on('error', error => console.warn('Folder watcher failed:', error.message));
  watchers.set(root, { close() { active = false; clearTimeout(timer); watcher.close(); } });
}
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1280, height: 820, minWidth: 900, minHeight: 600, title: 'Playerium', backgroundColor: '#121212', autoHideMenuBar: true,
    icon: fs.existsSync(path.join(__dirname, 'build/icon.ico')) ? path.join(__dirname, 'build/icon.ico') : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.loadFile('index.html');
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openExternal(url).catch(() => {}); return { action: 'deny' }; });
}
app.whenReady().then(async () => {
  rootsFile = path.join(app.getPath('userData'), 'music-roots.json');
  try { roots = new Set(JSON.parse(await fsp.readFile(rootsFile, 'utf8'))); } catch {}
  protocol.handle('playerium-audio', async request => {
    const id = new URL(request.url).hostname;
    if (!sources.has(id)) return new Response('Not found', { status: 404 });
    try {
      const response = await net.fetch(pathToFileURL(await authorize(sources.get(id))).href, { headers: request.headers });
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(response.body, { status: response.status, headers });
    }
    catch { return new Response('Unavailable', { status: 403 }); }
  });
  handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (canceled || !filePaths.length) return null;
    const root = await fsp.realpath(filePaths[0]);
    roots.add(root);
    await fsp.writeFile(rootsFile, JSON.stringify([...roots]));
    startWatchingFolder(root);
    return { folderPath: root, folderName: path.basename(root), files: await scanDirectory(root), isInitial: true };
  });
  handle('folder:watch', async root => { const real = await authorize(root); startWatchingFolder(real); return scanDirectory(real); });
  handle('folder:unwatch', async root => {
    if (typeof root !== 'string') throw new Error('Invalid folder');
    // Removed/missing folders still need their watcher and approval cleaned up.
    const real = await fsp.realpath(root).catch(() => path.resolve(root));
    watchers.get(real)?.close(); watchers.delete(real); roots.delete(real);
    await fsp.writeFile(rootsFile, JSON.stringify([...roots]));
    return true;
  });
  handle('file:source' , async file => {
    const real = await authorize(file);
    if (!AUDIO_EXTS.has(path.extname(real).toLowerCase())) throw new Error('Not an audio file');
    const id = require('node:crypto').randomUUID();
    sources.set(id, real);
    if (sources.size > 64) sources.delete(sources.keys().next().value);
    return `playerium-audio://${id}/track`;
  });
  handle('file:metadata', async file => {
    const real = await authorize(file);
    if (!AUDIO_EXTS.has(path.extname(real).toLowerCase())) throw new Error('Not an audio file');
    const { parseFile } = await import('music-metadata');
    const { common, format } = await parseFile(real);
    const picture = common.picture?.[0];
    return { title: common.title, artist: common.artist, album: common.album, year: common.year, trackNo: common.track?.no, duration: format.duration || 0,
      picture: picture && picture.data.length <= 4 * 1024 * 1024 ? { data: picture.data, type: picture.format } : null };
  });
  handle('shell:openExternal', openExternal);
  const music=new DesktopMusic({app,fetcher:(url,options)=>net.fetch(url,options),authorize,
    onRoot:async root=>{roots.add(await fsp.realpath(root));await fsp.writeFile(rootsFile,JSON.stringify([...roots]));},
    onProgress:state=>mainWindow?.webContents.send('music:progress',state)});
  handle('music:request',(operation,payload,id)=>music.request(operation,payload,id));
  handle('music:cancel',id=>music.cancel(id));
  const updater = new DesktopUpdater({ app, fetcher: (url,options) => net.fetch(url,options),
    onState: state => mainWindow?.webContents.send('update:state', state) });
  handle('update:install', info => updater.install(info));
  handle('update:status', () => updater.getStatus());
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => {
  for (const watcher of watchers.values()) watcher.close();
  watchers.clear(); sources.clear();
  if (process.platform !== 'darwin') app.quit();
});
