const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "docs", "screenshots");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9444;
const url = "http://127.0.0.1:5173/";
const profileDir = path.join(root, ".chrome-screenshots");
const viewport = { width: 1920, height: 1080 };

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(profileDir, { recursive: true });

function getJson(endpoint) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${endpoint}`, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

async function waitForDebugTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const pages = await getJson("/json/list");
      const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Chrome debugging target did not become available.");
}

function createCdpClient(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          id += 1;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((commandResolve, commandReject) => {
            pending.set(id, { resolve: commandResolve, reject: commandReject });
          });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("error", reject);
  });
}

async function waitForSelector(cdp, selector) {
  const escaped = selector.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  for (let i = 0; i < 60; i += 1) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `Boolean(document.querySelector('${escaped}'))`,
      returnByValue: true,
    });
    if (result.result.value) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Selector not found: ${selector}`);
}

async function click(cdp, selector) {
  const escaped = selector.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('${escaped}')?.click()`,
  });
  await new Promise((resolve) => setTimeout(resolve, 450));
}

async function capture(cdp, filename) {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  fs.writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, "base64"));
}

async function main() {
  const chrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${viewport.width},${viewport.height}`,
    `--user-data-dir=${profileDir}`,
    url,
  ], { stdio: "ignore" });

  try {
    const page = await waitForDebugTarget();
    const cdp = await createCdpClient(page.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await waitForSelector(cdp, "#app");
    await waitForSelector(cdp, "#helpBtn");
    await capture(cdp, "overview.png");

    await click(cdp, "#helpBtn");
    await waitForSelector(cdp, ".guidebook");
    await capture(cdp, "operator-guidebook.png");

    await click(cdp, "#closeHelpBtn");
    await click(cdp, "#orderBtn");
    await waitForSelector(cdp, ".dispatch-sheet");
    await capture(cdp, "orders.png");

    await click(cdp, "#closeOrderBtn");
    await click(cdp, "#logBtn");
    await waitForSelector(cdp, ".radio-console");
    await capture(cdp, "radio-console.png");

    cdp.close();
  } finally {
    chrome.kill();
    setTimeout(() => {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
      } catch {
        // Chrome may keep crashpad files briefly locked on Windows.
      }
    }, 500);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
