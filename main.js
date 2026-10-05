const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { scanDirectory, isInside, AUDIO_EXTS } = require('./desktop-files');

protocol.registerSchemesAsPrivileged([{ scheme: 'playerium-audio', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
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
  let scan = Promise.resolve();
  const watcher = fs.watch(root, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      scan = scan.catch(() => {}).then(async () => {
        try {
          const files = await scanDirectory(root);
          mainWindow?.webContents.send('folder:updated', { folderPath: root, folderName: path.basename(root), files, isInitial: false });
        } catch (error) {
          mainWindow?.webContents.send('folder:updated', { folderPath: root, error: 'Не удалось прочитать папку. Восстановите доступ к ней.' });
        }
      });
    }, 800);
  });
  watcher.on('error', error => console.warn('Folder watcher failed:', error.message));
  watchers.set(root, { close() { clearTimeout(timer); watcher.close(); } });
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
    try { return net.fetch(pathToFileURL(await authorize(sources.get(id))).href, { headers: request.headers }); }
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
  handle('file:source', async file => {
    const real = await authorize(file);
    if (!AUDIO_EXTS.has(path.extname(real).toLowerCase())) throw new Error('Not an audio file');
    const id = require('node:crypto').randomUUID();
    sources.clear(); sources.set(id, real);
    return `playerium-audio://${id}/track`;
  });
  handle('file:metadata', async file => {
    const real = await authorize(file);
    if (!AUDIO_EXTS.has(path.extname(real).toLowerCase())) throw new Error('Not an audio file');
    const { parseFile } = await import('music-metadata');
    const { common, format } = await parseFile(real);
    const picture = common.picture?.[0];
    return { title: common.title, artist: common.artist, album: common.album, year: common.year, trackNo: common.track?.no, duration: format.duration || 0,
      lyrics: common.lyrics?.map(l => typeof l === 'string' ? l : l.text || '').join('\n') || null,
      picture: picture && picture.data.length <= 4 * 1024 * 1024 ? { data: picture.data, type: picture.format } : null };
  });
  handle('file:text', async file => {
    const real = await authorize(file);
    if (path.extname(real).toLowerCase() !== '.lrc' || (await fsp.stat(real)).size > 1024 * 1024) throw new Error('Invalid lyrics file');
    return fsp.readFile(real, 'utf8');
  });
  handle('shell:openExternal', openExternal);
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => {
  for (const watcher of watchers.values()) watcher.close();
  watchers.clear(); sources.clear();
  if (process.platform !== 'darwin') app.quit();
});
