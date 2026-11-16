// Run from the repository root with a production frontend build and a test Neon database.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const hostedArg = process.argv.find(arg => arg.startsWith("--hosted="));
const hosted = hostedArg ? new URL(hostedArg.slice("--hosted=".length)).origin : undefined;
const hostedExercise = hosted && process.argv.includes("--exercise");
const hostedToken = hostedExercise ? process.env.BENCHIFY_HOSTED_OPERATOR_TOKEN : undefined;
const wantsLive = process.argv.includes("--live");
if (hostedExercise && (!hosted.startsWith("https://") || !/^[A-Za-z0-9_-]{32,128}$/.test(hostedToken || ""))) {
  throw new Error("Hosted exercise requires an HTTPS staging origin and BENCHIFY_HOSTED_OPERATOR_TOKEN.");
}
const reservedPorts = [];
async function port() {
  const server = createServer();
  await new Promise((accept, reject) => server.listen(0, "127.0.0.1", accept).once("error", reject));
  reservedPorts.push(server);
  return server.address().port;
}

async function until(check, label, timeout = 25_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(200);
  }
  throw new Error("Timed out waiting for " + label);
}

const children = [];
function start(command, args, env = process.env) {
  const child = spawn(command, args, { env, windowsHide: true, stdio: process.argv.includes("--debug") ? "inherit" : "ignore" });
  child.on("error", error => { console.error(error.message); });
  children.push(child);
  return child;
}

async function reachable(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2500) })).ok;
  } catch {
    return false;
  }
}

const [apiPort, webPort, agentPort, debugPort] = await Promise.all([port(), port(), port(), port()]);
await Promise.all(reservedPorts.map(server => new Promise(done => server.close(done))));
const origin = "http://127.0.0.1:" + apiPort;
const web = hosted || "http://127.0.0.1:" + webPort;
const node = "http://127.0.0.1:" + agentPort + "/execute";
const debug = "http://127.0.0.1:" + debugPort;
const root = resolve(".benchify");
await mkdir(root, { recursive: true });
const profile = await mkdtemp(join(root, "browser-"));
const downloads = join(profile, "downloads");
await mkdir(downloads);
const env = { ...process.env, BENCHIFY_ENV: "development", BENCHIFY_OPERATOR_TOKEN: "",
  BENCHIFY_ALLOW_LOCAL_AGENTS: "1", BENCHIFY_FIXTURE_ORIGIN: origin, BENCHIFY_API_URL: origin,
  BENCHIFY_HTTP_AGENT_URL: node, BENCHIFY_HTTP_AGENT_PORT: String(agentPort),
  BENCHIFY_HTTP_AGENTS: JSON.stringify({ "browser-node": { name: "Browser test HTTP agent", revision: "test-v1", endpoint: node } }),
};

let socket;
let diagnostic;
try {
  if (!hosted) {
    start(process.execPath, ["backend/http-agent.mjs"], env);
  const python = process.env.BENCHIFY_PYTHON ||
    (process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
  start(python, ["-m", "uvicorn", "--app-dir", "backend", "benchify.main:app",
    "--host", "127.0.0.1", "--port", String(apiPort), "--no-access-log"], env);
  start(process.execPath, ["frontend/node_modules/next/dist/bin/next", "start", "frontend",
    "--hostname", "127.0.0.1", "--port", String(webPort)], env);
  }
  const chrome = process.env.BENCHIFY_CHROME || (process.platform === "win32"
    ? join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe") : "google-chrome");
  start(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=" + debugPort,
    "--user-data-dir=" + join(profile, "chrome"), "--window-size=1440,1100", "about:blank"]);
  if (!hosted) {
    await until(() => reachable(origin + "/ready"), "Neon worker readiness");
    await until(() => reachable(web), "production web server");
  }
  await until(() => reachable(debug + "/json/list"), "Chrome debugger");
  const pages = await (await fetch(debug + "/json/list")).json();
  socket = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
  await new Promise((accept, reject) => {
    socket.addEventListener("open", accept, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.method === "Fetch.requestPaused") {
      cdp("Fetch.continueRequest", { requestId: message.params.requestId }).catch(() => {});
      return;
    }
    if (message.method === "Fetch.authRequired") {
      const { requestId, authChallenge } = message.params;
      const response = authChallenge.origin === web && authChallenge.source === "Server" &&
        authChallenge.scheme.toLowerCase() === "basic" && authChallenge.realm === "Benchify"
        ? { response: "ProvideCredentials", username: "benchify", password: hostedToken }
        : { response: "CancelAuth" };
      cdp("Fetch.continueWithAuth", { requestId, authChallengeResponse: response }).catch(() => {});
      return;
    }
    const callback = pending.get(message.id);
    if (callback) {
      pending.delete(message.id);
      if (message.error) callback.reject(new Error(message.error.message));
      else callback.accept(message.result);
    }
  });
  function cdp(method, params = {}) {
    const id = ++sequence;
    const query = new Promise((accept, reject) => pending.set(id, { accept, reject }));
    socket.send(JSON.stringify({ id, method, params }));
    return query;
  }
  async function evaluate(expression) {
    const value = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || expression);
    return value.result.value;
  }
  diagnostic = () => evaluate("JSON.stringify([...document.querySelectorAll('[role=alert], [role=status]')].map(x=>x.innerText))");
  async function load(url) {
    await cdp("Page.navigate", { url });
    await until(() => evaluate("location.href === " + JSON.stringify(url) + " && document.readyState === 'complete'"), url);
  }
  async function findText(selector, text) {
    return evaluate("Array.from(document.querySelectorAll(" + JSON.stringify(selector) +
      ")).some(element => element.textContent.includes(" + JSON.stringify(text) + "))");
  }
  async function click(label) {
    const expression = "Array.from(document.querySelectorAll('button')).find(button => !button.disabled && " +
      "button.textContent.trim() === " + JSON.stringify(label) + ")?.click()";
    await until(() => findText("button:enabled", label), label);
    await evaluate(expression);
  }
  async function choice(label, value) {
    await evaluate("(" + ((name, selection) => {
      const field = [...document.querySelectorAll("label")].find(label => label.textContent.startsWith(name))
        ?.querySelector("select");
      if (!field) throw new Error("Missing select " + name);
      field.value = selection;
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }).toString() + ")(" + JSON.stringify(label) + "," + JSON.stringify(value) + ")");
  }
  async function toggle(label) {
    await evaluate("(" + (name => {
      const field = [...document.querySelectorAll("label")].find(label => label.textContent.trim().startsWith(name))
        ?.querySelector("input[type=checkbox]");
      if (!field || field.disabled) throw new Error("Missing or disabled checkbox " + name);
      field.click();
    }).toString() + ")(" + JSON.stringify(label) + ")");
  }
  async function fill(name, value) {
    await evaluate("(" + ((fieldName, text) => {
      const field = document.querySelector("[name=" + fieldName + "]");
      const prototype = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(field, text);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }).toString() + ")(" + JSON.stringify(name) + "," + JSON.stringify(value) + ")");
  }
  const report = "[aria-label='Benchmark results']";
  const runStatus = report + " [role=status]";
  const currentRun = () => evaluate("new URLSearchParams(location.search).get('run')");
  async function waitForNewRun(previous, label) {
    await until(async () => {
      const id = await currentRun();
      return id && id !== previous;
    }, label + " submitted");
    await until(() => findText(runStatus, "completed"), label + " completed", 65_000);
  }
  await cdp("Page.enable");
  if (hostedExercise) {
    for (const path of ["/", "/api/runs/catalog", "/api/runs/00000000-0000-0000-0000-000000000000/attempts/00000000-0000-0000-0000-000000000000/recording"]) {
      const response = await fetch(web + path, { redirect: "manual" });
      assert.equal(response.status, 401, "Anonymous request to " + path);
      assert.match(response.headers.get("WWW-Authenticate") || "", /Basic.*Benchify/i);
    }
    await cdp("Fetch.enable", { patterns: [{ urlPattern: web + "/*" }], handleAuthRequests: true });
  }
  if (hosted && !hostedExercise) {
    await load(web + "/");
    const summary = await evaluate("Promise.all([fetch('/'), fetch('/api/runs/catalog'), fetch('/manifest.webmanifest')])"
      + ".then(responses => ({title: document.title, home: responses[0].status, catalog: responses[1].status,"
      + " manifest: responses[2].status, wordmark: !!document.querySelector('img[src*=wordmark]')}))");
    if (await findText("button:enabled", "Benchmarks")) {
      await click("Benchmarks");
      await until(() => findText("h1", "benchmark"), "hosted benchmark navigation");
      summary.benchmarkNavigation = true;
    }
    console.log("Hosted Chrome read-only check:", JSON.stringify(summary));
  } else {
    await cdp("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
    await load(web + "/");
    await until(() => evaluate("document.querySelector('img[alt=Benchify]')?.naturalWidth === 224"), "brand wordmark");
    await click("Light mode");
    await until(() => evaluate("document.querySelector('.shell').dataset.theme === 'light'"), "theme change");
    const manifest = await (await fetch(web + "/manifest.webmanifest")).json();
    assert.equal(manifest.icons.length, 2);
    const favicon = await evaluate("document.querySelector('link[rel=icon]')?.href");
    assert.equal(new URL(favicon).origin, web);
    assert((await fetch(favicon, { redirect: "manual" })).ok);
    await click("Benchmarks");
    await until(() => findText("fieldset label", "Built-in Python"), "Python agent in the browser catalog");
    await choice("Research task", "northwind-key-rotation-v1");
    await choice("Python model", "scripted");
    let httpRun = null;
    if (!hosted) {
      await until(() => findText("fieldset label", "Browser test HTTP agent"), "configured HTTP agent in the browser catalog");
      await toggle("Built-in Python");
      await toggle("Independent HTTP");
      await toggle("Browser test HTTP agent");
      await click("Run benchmark");
      await waitForNewRun(null, "registered HTTP agent benchmark");
      assert(await findText(report, "2/2") || await findText(report, "1/1 passed"));
      httpRun = await currentRun();
      await toggle("Built-in Python");
      await toggle("Browser test HTTP agent");
    } else if (await evaluate("Array.from(document.querySelectorAll('fieldset label')).some(label => label.textContent.includes('Independent HTTP') && label.querySelector('input').checked)")) {
      await toggle("Independent HTTP");
    }
    await toggle("Capture provider results");
    await click("Run benchmark");
    await waitForNewRun(httpRun, "captured Python run");
    const original = await currentRun();
    assert(original);
    assert(await findText(".trace", "Injected HTTP 503"));
    await load(web + "/?run=" + original);
    await until(() => findText(runStatus, "completed"), "saved run restored after refresh");
    await evaluate("document.querySelector('.attempts details').open = true");
    await until(() => findText(".trace", "search"), "attempt trace");
    await click("Inspect recording");
    await until(() => findText("summary", "Captured evidence and provider results"), "recording inspection");
    await click("Download recording JSON");
    let downloaded;
    await until(async () => {
      downloaded = (await readdir(downloads)).find(name => name.endsWith(".json"));
      return downloaded;
    }, "Chrome recording download");
    const recording = JSON.parse(await readFile(join(downloads, downloaded), "utf8"));
    assert.equal(recording.complete, true);
    assert.equal(recording.benchmark.run_id, original);
    await click("Replay offline and compare");
    await until(() => findText("[aria-label='Regression comparison']", "No classified differences"), "offline replay comparison");
    if (process.argv.includes("--screenshots")) {
      await evaluate("window.scrollTo(0, 0)");
      const screenshot = await cdp("Page.captureScreenshot", { format: "png" });
      await mkdir("docs/images", { recursive: true });
      await writeFile("docs/images/benchify-benchmarks.png", Buffer.from(screenshot.data, "base64"));
    }
    await click("Repeat run");
    await waitForNewRun(original, "repeat run");
    const repeated = await currentRun();
    assert.notEqual(repeated, original);
    await choice("Compare with saved run", original);
    await click("Compare runs");
    await until(() => findText("[aria-label='Regression comparison']", "Baseline 2/2 passed"), "saved-run comparison");
    await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"));
    await cdp("Emulation.clearDeviceMetricsOverride");
    await load(web + "/missing-page");
    assert(await findText("h1", "Page not found"));
    await load(web + "/");
    await click("Freshness Lab");
    assert(await findText("h1", "Freshness Lab"));
    await click("Meeting Intelligence");
    assert(await findText("h1", "Meeting Intelligence"));
    console.log((hostedExercise ? "Hosted authenticated" : "Local") +
      " Chrome passed branding, catalog, persistence, refresh, traces, capture download, replay, comparison, responsive width and branded 404.");

    if (wantsLive) {
      await click("Freshness Lab");
      await fill("text", "NASA launched the Artemis I mission on November 16, 2022.");
      await click("Verify claims");
      await until(async () => await findText(".report h2", "Claim verification") || await findText(".report [role=alert]", ""),
        "live claim verification or reported provider error", 100_000);
      const verifyError = await evaluate("document.querySelector('.report [role=alert]')?.innerText");
      console.log("Live browser claim verification:", verifyError || "review returned");
      await click("Meeting Intelligence");
      await fill("subject", "NASA Artemis I");
      await fill("meeting_at", "2022-12-01T16:00");
      await click("Generate briefing");
      await until(async () => await findText(".report h2", "NASA Artemis I") || await findText(".report [role=alert]", ""),
        "historical briefing or reported provider error", 100_000);
      const briefingError = await evaluate("document.querySelector('.report [role=alert]')?.innerText");
      const findings = await evaluate("document.querySelectorAll('.report > article.review').length");
      console.log("Live browser historical briefing:", briefingError || findings + " verified findings");
      if (verifyError || briefingError || !findings) process.exitCode = 1;
    }
  }
} catch (failure) {
  if (diagnostic) console.error("Browser notices:", await diagnostic().catch(() => "unavailable"));
  throw failure;
} finally {
  socket?.close();
  for (const child of children.reverse()) {
    if (child.exitCode === null) child.kill();
  }
  // Delete only the disposable profile created directly under the ignored artifact directory.
  const resolvedProfile = await realpath(profile);
  if (dirname(resolvedProfile) === await realpath(root)) {
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  }
}
