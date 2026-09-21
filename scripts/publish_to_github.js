/**
 * Playerium - GitHub Auto-Publisher
 * Automatically creates the Playerium repository, commits all code, and creates v1.0.0 release.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

// Read token from mcp_config.json or environment
function getToken() {
  if (process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
    return process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  }
  const mcpConfigPath = path.resolve("R:\\Users\\vremy\\.gemini\\config\\mcp_config.json");
  if (fs.existsSync(mcpConfigPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(mcpConfigPath, "utf8"));
      return data?.mcpServers?.github?.env?.GITHUB_PERSONAL_ACCESS_TOKEN;
    } catch {}
  }
  return null;
}

const TOKEN = getToken();
if (!TOKEN) {
  console.error("[ERROR] GitHub Personal Access Token not found in mcp_config.json or environment!");
  process.exit(1);
}

function githubRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint.startsWith("http") ? endpoint : `https://api.github.com${endpoint}`);
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        "User-Agent": "Playerium-Publisher",
        "Authorization": `Bearer ${TOKEN}`,
        "Accept": "application/vnd.github.v3+json"
      }
    };

    let bodyStr = "";
    if (data) {
      bodyStr = JSON.stringify(data);
      options.headers["Content-Type"] = "application/json";
      options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }

    const req = https.request(options, (res) => {
      let chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            resolve({ error: true, status: res.statusCode, data: json });
          }
        } catch {
          resolve({ raw, status: res.statusCode });
        }
      });
    });

    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function run() {
  console.log("========================================================");
  console.log("             Playerium: GitHub Auto-Publisher           ");
  console.log("========================================================\n");

  // 1. Verify User
  console.log("[1/5] Проверка токена и авторизации...");
  const user = await githubRequest("GET", "/user");
  if (user.error || !user.login) {
    console.error("[ERROR] Не удалось авторизоваться в GitHub. Проверьте права токена (scope 'repo').");
    console.error("Ответ GitHub:", user);
    process.exit(1);
  }
  const username = user.login;
  console.log(`[OK] Успешно авторизован как: @${username} (${user.name || ""})`);

  // 2. Check / Create Repository 'Playerium'
  console.log("\n[2/5] Проверка репозитория Playerium...");
  let repo = await githubRequest("GET", `/repos/${username}/Playerium`);
  if (repo.error && repo.status === 404) {
    console.log(`Создание нового публичного репозитория https://github.com/${username}/Playerium ...`);
    repo = await githubRequest("POST", "/user/repos", {
      name: "Playerium",
      description: "Modern Spotify-style local music player for PC and Android",
      private: false,
      has_issues: true,
      has_wiki: false
    });
    if (repo.error) {
      console.error("[ERROR] Не удалось создать репозиторий:", repo);
      process.exit(1);
    }
    console.log("[OK] Репозиторий успешно создан!");
  } else {
    console.log(`[OK] Репозиторий уже существует: https://github.com/${username}/Playerium`);
  }

  // 3. Update updater.js with actual repo name
  console.log(`\n[3/5] Обновление конфигурации автообновлений на '${username}/Playerium'...`);
  const updaterPath = path.resolve(__dirname, "..", "js", "updater.js");
  if (fs.existsSync(updaterPath)) {
    let content = fs.readFileSync(updaterPath, "utf8");
    content = content.replace(/static DEFAULT_REPO = "[^"]+";/, `static DEFAULT_REPO = "${username}/Playerium";`);
    fs.writeFileSync(updaterPath, content, "utf8");
  }

  // 4. Collect and Upload Project Files
  console.log("\n[4/5] Загрузка файлов проекта в репозиторий...");
  const rootDir = path.resolve(__dirname, "..");
  const filesToUpload = [];

  function scanDir(currentDir) {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      if (["node_modules", ".git", "dist", ".gemini"].includes(item)) continue;
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (stat.isFile() && stat.size < 25 * 1024 * 1024) {
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
        filesToUpload.push({ relPath, fullPath });
      }
    }
  }
  scanDir(rootDir);

  console.log(`Найдено файлов для отправки: ${filesToUpload.length}`);

  for (let i = 0; i < filesToUpload.length; i++) {
    const f = filesToUpload[i];
    const contentBase64 = fs.readFileSync(f.fullPath).toString("base64");

    // Check if file already exists to get SHA for update
    const existing = await githubRequest("GET", `/repos/${username}/Playerium/contents/${f.relPath}`);
    const sha = existing && !existing.error ? existing.sha : undefined;

    const res = await githubRequest("PUT", `/repos/${username}/Playerium/contents/${f.relPath}`, {
      message: `Sync ${f.relPath}`,
      content: contentBase64,
      sha
    });

    if (res.error) {
      console.warn(`[WARN] Ошибка загрузки ${f.relPath}:`, res.data?.message || res.status);
    } else {
      console.log(`  [${i + 1}/${filesToUpload.length}] Загружен: ${f.relPath}`);
    }
  }

  // 5. Create Release v1.0.0
  console.log("\n[5/5] Создание релиза v1.0.0 на GitHub...");
  const releaseRes = await githubRequest("POST", `/repos/${username}/Playerium/releases`, {
    tag_name: "v1.0.0",
    name: "Playerium v1.0.0 — Первый релиз",
    body: "### 🎉 Первый публичный релиз Playerium!\n\n- Интерфейс Spotify 1-в-1 с темной темой и оригинальной сеткой.\n- Воспроизведение локальных аудиофайлов (MP3, FLAC, WAV, OGG, AAC).\n- Встроенный ID3/FLAC парсер метаданных и обложек.\n- 10-полосный эквалайзер на Web Audio API.\n- Синхронизированные тексты песен (.lrc / караоке).\n- Поддержка сборки в Windows .exe и Android .apk.\n- Встроенная система автообновлений.",
    draft: false,
    prerelease: false
  });

  if (releaseRes.error && releaseRes.status === 422) {
    console.log("[OK] Релиз v1.0.0 уже существует.");
  } else if (!releaseRes.error) {
    console.log(`[OK] Релиз v1.0.0 успешно опубликован: ${releaseRes.html_url}`);
  }

  console.log("\n========================================================");
  console.log(` ВСЁ ГОТОВО! Репозиторий доступен по адресу:`);
  console.log(` https://github.com/${username}/Playerium`);
  console.log("========================================================\n");
}

run().catch((err) => {
  console.error("[FATAL ERROR]", err);
});
