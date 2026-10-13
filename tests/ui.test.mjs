import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { build } from "vite";

const browser =
  process.env.TEST_BROWSER_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);

// Build the real UI with isolated service adapters. No Firebase connection or production data.
test(
  "interface: cadastro obrigatório, falhas de acesso e expansão por mouse/teclado",
  { skip: !browser, timeout: 60000 },
  async (t) => {
    const folder = mkdtempSync(join(tmpdir(), "tracker-arcano-ui-"));
    let server, chrome, socket;
    let serving = true;
    try {
      const stub = join(folder, "stub.js");
      writeFileSync(
        stub,
        `
      import { registerProfileName } from ${JSON.stringify(resolve("src/lib/access.ts").replaceAll("\\", "/"))};
      const scenario = new URLSearchParams(location.search).get("scenario");
      let name = ["valid", "responsive"].includes(scenario) ? "Ana" : "";
      const user = { uid: "A", email: scenario === "responsive" ? "usuario".repeat(12) + "@example.test" : "ana@example.test" };
      const callbacks = new Set();
      export const auth = {};
      export function onAuthStateChanged(_auth, callback) {
        callbacks.add(callback); queueMicrotask(() => { if (callbacks.has(callback)) callback(scenario === "login" ? null : user); });
        return () => callbacks.delete(callback);
      }
      export const membership = async () => ({ ativo: scenario !== "unauthorized", senhaTemporaria: scenario === "temporary" });
      export const passwordAcknowledged = async () => false;
      export const confirmedProfile = async () => {
        if (scenario === "read-error") throw new Error("Falha de leitura controlada");
        if (scenario === "confirmation-error" && name) throw new Error("Falha de confirmação controlada");
        return name;
      };
      export const profile = async () => name;
      export const saveProfile = async (_uid, value) => {
        if (scenario === "write-error") throw new Error("Falha de gravação controlada");
        name = value;
      };
      export const completeProfile = (uid, value) => registerProfileName(uid, value, { save: saveProfile, read: confirmedProfile });
      export const errorMessage = e => e.message;
      export const logout = async () => { for (const callback of callbacks) callback(null); };
      export const login = async () => {};
      export const resetPassword = async () => {};
      export const changePassword = async () => {};
      export const acknowledgePassword = async () => {};
      export const clearDataCache = () => {};
      const decks = [{ id: "d", nome: "Deck".repeat(20), atual: "v1", arquivado: false }];
      const matches = ["2-0", "2-1", "1-1", "1-2", "0-2", "1-0", "0-1", "0-0"].map((placar, i) => ({ id: "m" + i, deckId: "d", versaoId: "v1", data: "2026-" + String(i + 1).padStart(2, "0") + "-05", placar, criadoEm: "2026-10-05T12:00:00.000Z" }));
      const validation = { entries: [{ name: "Card".repeat(35), quantity: 60, board: "main", card: { name: "Card".repeat(35), images: ["data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='350'%3E%3Crect width='250' height='350' fill='%2320314a'/%3E%3C/svg%3E"] } }], errors: [], checkedAt: "2026-10-05T12:00:00.000Z" };
      export const listDecks = async () => scenario === "responsive" ? decks : [];
      export const allMatches = async () => scenario === "responsive" ? matches : [];
      export const matchPage = async () => ({ matches: await allMatches(), cursor: undefined });
      export const listMemberNames = async () => ["Ana", "Bia"];
      export const loadTeam = async () => scenario === "responsive" ? [{ uid: "A", nome: "Membro".repeat(13), decks, matches }, { uid: "B", nome: "Membro sem partidas", decks: [], matches: [] }] : [{ uid: "A", nome: "Ana", decks: [], matches: [] }];
      export const archiveDeck = async () => {};
      export const getVersion = async () => ({ id: "v1", deckId: "d", texto: "60 Mountain", validacao: validation, criadoEm: validation.checkedAt });
      export const renameDeck = async () => {};
      export const saveVersion = async () => {};
      export const deleteMatch = async () => {};
      export const saveMatch = async () => { globalThis.__matchWrites = (globalThis.__matchWrites || 0) + 1; };
    `,
      );
      const input = join(folder, "index.html");
      writeFileSync(
        input,
        `<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"></head><body><div id="root"></div><script type="module">
      import ${JSON.stringify(resolve("src/index.css").replaceAll("\\", "/"))};
      import React from ${JSON.stringify(resolve("node_modules/react/index.js").replaceAll("\\", "/"))};
      import { createRoot } from ${JSON.stringify(resolve("node_modules/react-dom/client.js").replaceAll("\\", "/"))};
      import App from ${JSON.stringify(resolve("src/App.tsx").replaceAll("\\", "/"))};
      createRoot(document.getElementById("root")).render(React.createElement(React.StrictMode, null, React.createElement(App)));
    </script></body></html>`,
      );
      const adapters = new Set(
        [
          "src/lib/firebase",
          "src/services/data",
          "src/services/profile",
          "src/services/auth",
          "src/services/team",
          "src/services/memberNames",
        ].map((p) => resolve(p).replaceAll("\\", "/")),
      );
      const outDir = join(folder, "dist");
      await build({
        root: folder,
        configFile: resolve("vite.config.ts"),
        logLevel: "silent",
        plugins: [
          {
            name: "isolated-test-services",
            enforce: "pre",
            resolveId(source, importer) {
              if (source === "firebase/auth") return stub;
              if (
                importer &&
                source.startsWith(".") &&
                adapters.has(
                  resolve(dirname(importer), source)
                    .replaceAll("\\", "/")
                    .replace(/\.ts$/, ""),
                )
              )
                return stub;
            },
          },
        ],
        build: { outDir, emptyOutDir: true, rolldownOptions: { input } },
      });
      const html = readFileSync(join(outDir, "index.html"));
      server = createServer((req, res) => {
        if (!serving) { req.socket.destroy(); return; }
        const pathname = new URL(req.url, "http://localhost").pathname;
        if (pathname === "/") {
          res.setHeader("Content-Type", "text/html");
          res.end(html);
          return;
        }
        const production = resolve("dist");
        const productionFirst = ["/marcador.html", "/sw.js", "/manifest.webmanifest", "/life-icon.svg", "/favicon.svg"].includes(pathname);
        const fixtureAsset = join(outDir, pathname);
        const productionAsset = join(production, pathname);
        const asset = productionFirst || !existsSync(fixtureAsset) ? productionAsset : fixtureAsset;
        if ((!asset.startsWith(outDir) && !asset.startsWith(production)) || !existsSync(asset)) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.setHeader(
          "Content-Type",
          pathname.endsWith(".js") ? "text/javascript" : pathname.endsWith(".html") ? "text/html" : pathname.endsWith(".webmanifest") ? "application/manifest+json" : pathname.endsWith(".svg") ? "image/svg+xml" : pathname.endsWith(".png") ? "image/png" : "text/css",
        );
        res.end(readFileSync(asset));
      });
      await new Promise((done) => server.listen(0, "127.0.0.1", done));
      chrome = spawn(
        browser,
        [
          "--headless",
          "--remote-debugging-port=0",
          `--user-data-dir=${join(folder, "browser")}`,
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-background-networking",
        ],
        { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
      );
      let sequence = 0;
      let browserErrors = "";
      chrome.stderr.on("data", (chunk) => {
        browserErrors += chunk.toString();
      });
      const portFile = join(folder, "browser", "DevToolsActivePort");
      for (let i = 0; !existsSync(portFile); i++) {
        if (i >= 500 || chrome.exitCode !== null)
          throw new Error(`Browser did not start: ${browserErrors}`);
        await new Promise((done) => setTimeout(done, 20));
      }
      const [port, endpoint] = readFileSync(portFile, "utf8")
        .trim()
        .split(/\r?\n/);
      socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
      await new Promise((done, reject) => {
        socket.addEventListener("open", done, { once: true });
        socket.addEventListener("error", reject, { once: true });
      });
      const pending = new Map();
      const diagnostics = [];
      const requests = new Map();
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.method === "Network.requestWillBeSent") requests.set(message.params.requestId, message.params.request.url);
        if (message.method === "Network.loadingFailed") diagnostics.push({ url: requests.get(message.params.requestId), error: message.params.errorText });
        if (message.method === "Runtime.exceptionThrown") diagnostics.push(message.params.exceptionDetails);
        const callback = pending.get(message.id);
        if (callback) {
          pending.delete(message.id);
          message.error
            ? callback.reject(new Error(message.error.message))
            : callback.resolve(message.result);
        }
      });
      const command = (method, params = {}, sessionId) =>
        new Promise((resolveResult, reject) => {
          const id = ++sequence;
          const timeout = setTimeout(() => {
            pending.delete(id);
            reject(
              new Error(
                `Browser command timed out: ${method}. ${browserErrors}`,
              ),
            );
          }, 10000);
          pending.set(id, {
            resolve: (result) => {
              clearTimeout(timeout);
              resolveResult(result);
            },
            reject: (error) => {
              clearTimeout(timeout);
              reject(error);
            },
          });
          socket.send(
            JSON.stringify({
              id,
              method,
              params,
              ...(sessionId ? { sessionId } : {}),
            }),
          );
        });
      const { targetId } = await command("Target.createTarget", {
        url: "about:blank",
      });
      const { sessionId } = await command("Target.attachToTarget", {
        targetId,
        flatten: true,
      });
      await command("Page.enable", {}, sessionId);
      await command("Network.enable", {}, sessionId);
      await command(
        "Network.setBlockedURLs",
        { urls: ["*fonts.googleapis.com*", "*fonts.gstatic.com*"] },
        sessionId,
      );
      await command("Page.bringToFront", {}, sessionId);
      await command(
        "Emulation.setFocusEmulationEnabled",
        { enabled: true },
        sessionId,
      );
      const evaluate = async (expression) => {
        const result = await command(
          "Runtime.evaluate",
          { expression, returnByValue: true, awaitPromise: true },
          sessionId,
        );
        if (result.exceptionDetails)
          throw new Error(result.exceptionDetails.text + " " + JSON.stringify(diagnostics.slice(-8)));
        return result.result.value;
      };
      const waitFor = (expression) =>
        evaluate(
          `(async () => { for (let i = 0; i < 300; i++) { if (${expression}) return true; await new Promise(r => setTimeout(r, 15)); } throw new Error("UI timeout: " + document.body.innerText); })()`,
        );
      const navigate = async (scenario) => {
        await command(
          "Page.navigate",
          {
            url: `http://127.0.0.1:${server.address().port}/?scenario=${scenario}`,
          },
          sessionId,
        );
        await waitFor(
          'document.querySelector("h2") && !document.body.innerText.includes("Verificando sessão")',
        );
      };
      const fillName = (value) =>
        evaluate(
          `(() => { const input = document.querySelector('input[autocomplete="name"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event("input", { bubbles: true })); })()`,
        );
      const submit = () =>
        evaluate(
          'document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))',
        );
      await navigate("missing");
      assert.equal(
        await evaluate('document.querySelector("h2").textContent'),
        "Complete seu perfil",
      );
      assert.equal(await evaluate('!!document.querySelector("nav")'), false);
      await fillName("   ");
      await submit();
      await waitFor('document.querySelector("[role=alert]")');
      assert.equal(await evaluate('!!document.querySelector("nav")'), false);
      await fillName("  Ana  ");
      await submit();
      await waitFor('document.querySelector("nav")');
      await evaluate(
        '[...document.querySelectorAll("nav button")].find(b => b.textContent === "Estatísticas do Time").click()',
      );
      await waitFor('document.querySelector("details")');
      assert.equal(
        await evaluate('document.querySelector("h3").textContent'),
        "Estatísticas Gerais do Time",
      );
      assert.equal(
        await evaluate('document.querySelector("details").open'),
        false,
      );
      assert.equal(
        await evaluate('document.querySelector("summary").textContent'),
        "Estatísticas por Membro",
      );
      await evaluate('document.querySelector("summary").click()');
      assert.equal(
        await evaluate('document.querySelector("details").open'),
        true,
      );
      await evaluate('document.querySelector("summary").click()');
      assert.equal(
        await evaluate('document.querySelector("details").open'),
        false,
      );
      await evaluate('document.querySelector("summary").focus()');
      for (const expected of [true, false]) {
        await command(
          "Input.dispatchKeyEvent",
          {
            type: "keyDown",
            key: "Enter",
            code: "Enter",
            windowsVirtualKeyCode: 13,
            text: "\r",
          },
          sessionId,
        );
        await command(
          "Input.dispatchKeyEvent",
          {
            type: "keyUp",
            key: "Enter",
            code: "Enter",
            windowsVirtualKeyCode: 13,
          },
          sessionId,
        );
        assert.equal(
          await evaluate('document.querySelector("details").open'),
          expected,
        );
      }
      await navigate("valid");
      await waitFor('document.querySelector("nav")');
      for (const scenario of ["unauthorized", "read-error"]) {
        await navigate(scenario);
        assert.equal(await evaluate('!!document.querySelector("nav")'), false);
        assert.equal(await evaluate('!!document.querySelector("form")'), false);
      }
      for (const scenario of ["write-error", "confirmation-error"]) {
        await navigate(scenario);
        await fillName("Ana");
        await submit();
        await waitFor('document.querySelector("[role=alert]")');
        assert.equal(await evaluate('!!document.querySelector("nav")'), false);
      }
      await navigate("temporary");
      await fillName("Ana");
      await submit();
      await waitFor(
        'document.body.innerText.includes("Defina sua senha pessoal")',
      );
      assert.equal(await evaluate('!!document.querySelector("nav")'), false);
      const selectTab = async (label) => {
        await evaluate(
          `(() => { const toggle = document.querySelector('.mobile-menu-toggle'); if (getComputedStyle(toggle).display !== 'none' && toggle.getAttribute('aria-expanded') === 'false') toggle.click(); })()`,
        );
        await evaluate(
          `[...document.querySelectorAll('.navigation-items button')].find(b => b.textContent === ${JSON.stringify(label)}).click()`,
        );
        await waitFor(
          `document.querySelector('[aria-current="page"]')?.textContent === ${JSON.stringify(label)}`,
        );
      };
      const assertLayout = async (label) => {
        const layout = await evaluate(`(() => {
          const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
          const localScroll = element => !!element.closest('.table-scroll, .evolution');
          return {
            viewport: innerWidth, page: document.documentElement.scrollWidth,
            overflow: [...document.querySelectorAll('main *, nav *, .brand *')].filter(visible).filter(element => !localScroll(element)).filter(element => { const rect = element.getBoundingClientRect(); return rect.right > innerWidth + 1 || rect.left < -1; }).map(element => element.tagName + '.' + element.className),
            smallControls: [...document.querySelectorAll('button, input, select, textarea, summary')].filter(visible).filter(element => !localScroll(element)).filter(element => { const rect = element.getBoundingClientRect(); return rect.height < 43.5 || rect.width < 43.5; }).map(element => element.tagName + ':' + element.textContent.slice(0, 40)),
            smallFonts: [...document.querySelectorAll('input, select, textarea')].filter(visible).filter(element => parseFloat(getComputedStyle(element).fontSize) < 16).map(element => element.tagName),
          };
        })()`);
        assert.ok(
          layout.page <= layout.viewport + 1,
          `${label}: global overflow ${JSON.stringify(layout)}`,
        );
        assert.deepEqual(
          layout.overflow,
          [],
          `${label}: elements outside viewport`,
        );
        if (layout.viewport <= 800) {
          assert.deepEqual(layout.smallControls, [], `${label}: touch targets`);
          assert.deepEqual(layout.smallFonts, [], `${label}: input font sizes`);
        }
      };
      const viewport = (width, height, mobile = width <= 800) =>
        command(
          "Emulation.setDeviceMetricsOverride",
          { width, height, deviceScaleFactor: 1, mobile },
          sessionId,
        );
      const screenshot = async (filename) => {
        if (process.env.TEST_SCREENSHOTS !== "1") return;
        const directory = resolve("mobile-review.local");
        mkdirSync(directory, { recursive: true });
        await evaluate("window.scrollTo(0, 0)");
        const { data } = await command(
          "Page.captureScreenshot",
          { format: "png", captureBeyondViewport: false },
          sessionId,
        );
        writeFileSync(join(directory, filename), Buffer.from(data, "base64"));
      };
      const clickText = text => evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(text)}).click()`);
      const setField = (selector, value) => evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
      await t.test("marcador: contadores, comandante, desfazer, sessão local e registro somente confirmado", async () => {
        await viewport(390,844);
        await navigate("responsive"); await waitFor('document.querySelector("nav")');
        await evaluate(`localStorage.removeItem('tracker-arcano.life.v1'); globalThis.confirm = () => true`);
        await selectTab("Marcador de Vida");
        await waitFor('document.querySelector(".life-configuration")');
        await setField('.life-configuration > section select', "2");
        await clickText("Iniciar partida"); await waitFor('document.querySelector(".life-board")');
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('.life-player-content')].map(p=>p.classList.contains('rotated'))`),[true,false]);
        await evaluate(`(() => { const button = document.querySelector('button[aria-label="Adicionar 1 vida de Jogador 1"]'); for(let i=0;i<50;i++) button.click(); })()`);
        assert.equal(await evaluate(`document.querySelector('output[aria-label="Vida de Jogador 1"]').textContent`),"70");
        await clickText("Desfazer última alteração");
        assert.equal(await evaluate(`document.querySelector('output[aria-label="Vida de Jogador 1"]').textContent`),"69");
        await evaluate(`document.querySelector('button[aria-label="Girar painel de Jogador 1"]').click()`);
        assert.equal(await evaluate(`document.querySelector('.life-player-content').classList.contains('rotated')`),false);
        await evaluate(`document.querySelector('.life-disclosure > summary').click()`);
        await setField('.life-disclosure form input',"Comandante A");
        await clickText("Adicionar comandante");
        await setField('.life-disclosure form:nth-of-type(2) input',"21");
        await clickText("Registrar dano e descontar vida");
        assert.equal(await evaluate(`document.querySelector('output[aria-label="Vida de Jogador 2"]').textContent`),"-1");
        await setField('.life-disclosure form:nth-of-type(3) input',"4");
        await clickText("Corrigir somente contador");
        assert.equal(await evaluate(`document.querySelector('output[aria-label="Vida de Jogador 2"]').textContent`),"-1");
        await command("Page.reload",{},sessionId); await waitFor('document.querySelector("nav")');
        await selectTab("Marcador de Vida"); await waitFor(`document.body.innerText.includes('Sessão anterior')`);
        await clickText("Retomar sessão"); await waitFor('document.querySelector(".life-board")');
        assert.equal(await evaluate(`document.querySelector('.life-player-content').classList.contains('rotated')`),false);
        assert.equal(await evaluate(`document.querySelector('output[aria-label="Vida de Jogador 2"]').textContent`),"-1");
        await clickText("Desfazer última alteração");
        const restored = await evaluate(`JSON.parse(localStorage.getItem('tracker-arcano.life.v1'))`);
        assert.equal(Object.values(restored.damage.p2)[0],21);
        await evaluate('globalThis.confirm = () => true');
        await clickText("Encerrar partida"); await waitFor('document.querySelector(".life-ended")');
        assert.equal(await evaluate('globalThis.__matchWrites || 0'),0);
        await clickText("Registrar resultado manualmente"); await waitFor('document.querySelector(".match-form")');
        assert.equal(await evaluate('globalThis.__matchWrites || 0'),0);
        await setField('.match-form select',"d");
        await evaluate(`globalThis.confirm = () => false; document.querySelector('.match-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
        assert.equal(await evaluate('globalThis.__matchWrites || 0'),0);
        await evaluate(`globalThis.confirm = () => true; document.querySelector('.match-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
        await waitFor('globalThis.__matchWrites === 1');
      });
      await t.test("iPhone simulado: fallback imersivo, instrução dispensável e standalone", async () => {
        const { identifier } = await command("Page.addScriptToEvaluateOnNewDocument", { source: `
          const mode = new URLSearchParams(location.search).get('iphone');
          if (mode) {
            Object.defineProperty(navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
            Object.defineProperty(navigator,'standalone',{configurable:true,value:mode==='standalone'});
            Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:mode==='reject'});
            Element.prototype.requestFullscreen = mode==='reject' ? async () => { throw new Error('Denied'); } : undefined;
          }
        ` }, sessionId);
        try {
          for (const mode of ['unsupported','standalone','reject']) {
            await viewport(390,844);
            await navigate('responsive&iphone='+mode);
            await evaluate(`localStorage.removeItem('tracker-arcano.life.v1')`);
            await selectTab('Marcador de Vida');
            await waitFor('document.querySelector(".life-configuration")');
            assert.equal(await evaluate(`!!document.querySelector('.life-install')`),mode!=='standalone');
            if(mode==='unsupported') {
              await evaluate(`document.querySelector('.life-install summary').click()`);
              await clickText('Dispensar orientação');
              assert.equal(await evaluate(`!!document.querySelector('.life-install')`),false);
            }
            assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Tela cheia')`),mode==='reject');
            await clickText('Iniciar partida');
            await waitFor('document.querySelector(".life-board")');
            await clickText('Sair do modo imersivo');
            assert.equal(await evaluate(`document.querySelector('.life-root').classList.contains('life-focused')`),false);
            await clickText(mode==='reject' ? 'Tela cheia' : 'Modo imersivo');
            await waitFor(`document.querySelector('.life-root').classList.contains('life-focused')`);
            assert.equal(await evaluate(`document.body.style.overflow`),'hidden');
            if(mode==='reject') assert.ok(await evaluate(`document.body.innerText.includes('O navegador recusou tela cheia')`));
            const board = await evaluate(`(() => {const r=document.querySelector('.life-board').getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:innerHeight};})()`);
            assert.ok(board.top>=0 && board.bottom<=board.height+1,'two panels fit the available portrait viewport');
            await assertLayout('iPhone '+mode);
            await clickText('Sair do modo imersivo');
            assert.equal(await evaluate(`document.body.style.overflow`),'');
          }
        } finally { await command('Page.removeScriptToEvaluateOnNewDocument',{identifier},sessionId); }
      });
      await t.test("marcador responsivo: 2/3/4 jogadores em retrato e paisagem", async () => {
        for(const width of [320,375,390,430,768,1024]) for(const count of [2,3,4]) {
          await viewport(width,844);
          await navigate("responsive"); await waitFor('document.querySelector("nav")');
          await evaluate(`localStorage.removeItem('tracker-arcano.life.v1')`);
          await selectTab("Marcador de Vida"); await waitFor('document.querySelector(".life-configuration")');
          await assertLayout(`${width}px configuração do marcador`);
          await setField('.life-configuration > section select',String(count));
          await clickText("Iniciar partida"); await waitFor('document.querySelector(".life-board")');
          assert.equal(await evaluate('document.querySelectorAll(".life-player").length'),count);
          assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('tracker-arcano.life.v1')).players.map(p=>p.rotated)`),count===2 ? (width<=800 ? [true,false] : [false,false]) : count===4 ? [true,true,false,false] : [false,false,false]);
          await assertLayout(`${width}px ${count} jogadores`);
          if(width===390 && count===4) await screenshot("390-life-four.png");
          await viewport(844,width,true); await assertLayout(`paisagem ${width}px ${count} jogadores`);
        }
      });
      for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
        await t.test(
          `responsividade em ${width}px: todas as abas, formulários e conteúdo longo`,
          async () => {
            await viewport(width, 900);
            for (const scenario of [
              "login",
              "missing",
              "unauthorized",
              "read-error",
              "temporary",
            ]) {
              await navigate(scenario);
              if (scenario === "temporary") {
                await fillName("Ana");
                await submit();
                await waitFor(
                  'document.body.innerText.includes("Defina sua senha pessoal")',
                );
              }
              await assertLayout(`${width}px ${scenario}`);
            }
            await navigate("responsive");
            await waitFor('document.querySelector(".stat-grid")');
            await assertLayout(`${width}px Visão geral`);
            if ([390, 1440].includes(width))
              await screenshot(`${width}-overview.png`);
            if (width <= 800) {
              assert.equal(
                await evaluate(
                  'getComputedStyle(document.querySelector(".navigation-items")).display',
                ),
                "none",
              );
              await evaluate(
                'document.querySelector(".mobile-menu-toggle").click()',
              );
              await assertLayout(`${width}px menu aberto`);
              assert.equal(
                await evaluate(
                  'document.querySelector(".mobile-menu-toggle").getAttribute("aria-expanded")',
                ),
                "true",
              );
              if (width === 390) await screenshot("390-menu.png");
            } else {
              assert.equal(
                await evaluate(
                  'getComputedStyle(document.querySelector(".mobile-menu-toggle")).display',
                ),
                "none",
              );
            }
            await selectTab("Estatísticas do Time");
            await waitFor('document.querySelector(".member-statistics")');
            await evaluate(
              'document.querySelector(".member-statistics > summary").click()',
            );
            await assertLayout(`${width}px Estatísticas do Time`);
            await selectTab("Meus decks");
            await waitFor('document.querySelector(".deck")');
            await assertLayout(`${width}px Meus decks`);
            await evaluate(
              '[...document.querySelectorAll(".deck button")].find(b => b.textContent === "Lista / nova versão").click()',
            );
            await waitFor(
              'document.querySelector(".editor") && document.querySelector(".cards")',
            );
            await assertLayout(`${width}px editor e cartas`);
            if (width === 390) await screenshot("390-decks.png");
            await selectTab("Partidas");
            await waitFor('document.querySelector("table")');
            await assertLayout(`${width}px Partidas`);
            if (width === 390) await screenshot("390-matches.png");
            if (width <= 430) {
              const scroll = await evaluate(
                `(() => { const region = document.querySelector('.table-scroll'); const before = region.scrollLeft; region.scrollLeft = region.scrollWidth; return { before, after: region.scrollLeft, width: region.clientWidth, content: region.scrollWidth }; })()`,
              );
              assert.ok(
                scroll.content > scroll.width && scroll.after > scroll.before,
                `${width}px: localized table scrolling`,
              );
            }
            await evaluate(
              '[...document.querySelectorAll("table button")].find(b => b.textContent === "Ver versão usada").click()',
            );
            await waitFor('document.querySelector(".cards")');
            await assertLayout(`${width}px versão histórica`);
            await selectTab("Perfil");
            await waitFor(
              'document.querySelector(".profile-grid input")?.value === "Ana"',
            );
            await assertLayout(`${width}px Perfil`);
            assert.equal(
              await evaluate(
                'document.querySelector(".navigation-items .logout").textContent',
              ),
              "Sair",
            );
          },
        );
      }
      await t.test("orientação, zoom e teclado do menu mobile", async () => {
        await viewport(390, 844);
        await navigate("responsive");
        await waitFor('document.querySelector(".stat-grid")');
        await evaluate('document.querySelector(".mobile-menu-toggle").click()');
        await viewport(844, 390, true);
        await assertLayout("paisagem 844x390");
        await viewport(390, 844);
        await evaluate('document.querySelector(".mobile-menu-toggle").focus()');
        await command(
          "Input.dispatchKeyEvent",
          {
            type: "keyDown",
            key: "Escape",
            code: "Escape",
            windowsVirtualKeyCode: 27,
          },
          sessionId,
        );
        await waitFor(
          'document.querySelector(".mobile-menu-toggle").getAttribute("aria-expanded") === "false"',
        );
        assert.equal(
          await evaluate("document.activeElement.className"),
          "mobile-menu-toggle",
        );
        // A 1440px desktop viewport at 200% zoom has a 720px CSS layout viewport.
        await viewport(720, 450, false);
        await assertLayout("desktop 200% equivalente");
      });
      await t.test("build real: Service Worker, abertura offline e recuperação sem acesso protegido", async () => {
        await viewport(390,844);
        await evaluate(`localStorage.removeItem('tracker-arcano.life.v1')`);
        const origin = `http://127.0.0.1:${server.address().port}`;
        await command("Page.navigate", { url: origin + "/marcador.html" }, sessionId);
        await waitFor('document.querySelector(".life-configuration")');
        await evaluate(`navigator.serviceWorker.ready.then(() => true)`);
        await waitFor('navigator.serviceWorker.controller');
        const cache = await evaluate(`(async () => { const names = (await caches.keys()).filter(n=>n.startsWith('arcano-life-')); const cache = await caches.open(names[0]); return (await cache.keys()).map(r=>r.url); })()`);
        assert.ok(cache.some(url=>url.endsWith('/marcador.html')));
        assert.ok(cache.every(url => new URL(url).origin === origin && !url.includes('firestore')));
        const cachedCode = await evaluate(`(async () => { const names = (await caches.keys()).filter(n=>n.startsWith('arcano-life-')); const cache = await caches.open(names[0]); const requests = await cache.keys(); return (await Promise.all(requests.filter(r=>new URL(r.url).pathname.endsWith('.js')).map(async r=>(await cache.match(r)).text()))).join('\\n'); })()`);
        assert.ok(!cachedCode.includes('firestore.googleapis.com'), 'cache must exclude the Firebase application bundle');
        // CDP emulation is target-scoped; also deny the local server to stop worker-network requests.
        serving = false;
        await command("Network.emulateNetworkConditions", { offline: true, latency:0, downloadThroughput:0, uploadThroughput:0 }, sessionId);
        await command("Page.reload",{},sessionId);
        await waitFor('document.querySelector(".life-configuration")');
        assert.equal(await evaluate('!!document.querySelector("nav")'),false);
        await clickText("Iniciar partida"); await waitFor('document.querySelector(".life-board")');
        await evaluate(`document.querySelector('button[aria-label="Remover 5 vidas de Jogador 1"]').click()`);
        await command("Page.reload",{},sessionId);
        await waitFor(`document.body.innerText.includes('Sessão anterior')`);
        await clickText("Retomar sessão"); await waitFor('document.querySelector(".life-board")');
        assert.equal(await evaluate(`document.querySelector('output[aria-label="Vida de Jogador 1"]').textContent`),"15");
        await clickText("Desfazer última alteração");
        assert.equal(await evaluate(`document.querySelector('output[aria-label="Vida de Jogador 1"]').textContent`),"20");
        await evaluate(`document.querySelector('button[aria-label="Adicionar veneno a Jogador 1"]').click()`);
        assert.equal(await evaluate(`document.querySelector('output[aria-label="Veneno de Jogador 1"]').textContent`),"1");
        await evaluate(`document.querySelector('.life-disclosure > summary').click()`);
        await setField('.life-disclosure form input',"Comandante offline");
        await clickText("Adicionar comandante");
        await setField('.life-disclosure form:nth-of-type(2) input',"21");
        await clickText("Registrar dano e descontar vida");
        assert.equal(await evaluate(`document.querySelector('output[aria-label="Vida de Jogador 2"]').textContent`),"-1");
        assert.ok(await evaluate(`document.querySelector('.life-board').innerText.includes('21 ou mais')`));
        await evaluate(`[...document.querySelectorAll('summary')].find(s=>s.textContent==='Dado e moeda').click()`);
        const beforeTools = await evaluate(`localStorage.getItem('tracker-arcano.life.v1')`);
        await clickText("Lançar D6");
        assert.match(await evaluate(`document.querySelector('.life-random-result').textContent`),/^D6: [1-6]$/);
        await clickText("Lançar moeda");
        assert.match(await evaluate(`document.querySelector('.life-random-result').textContent`),/^Moeda: (Cara|Coroa)$/);
        assert.equal(await evaluate(`localStorage.getItem('tracker-arcano.life.v1')`), beforeTools);
        await evaluate(`[...document.querySelectorAll('summary')].find(s=>s.textContent.startsWith('Histórico')).click()`);
        assert.ok(await evaluate(`document.querySelector('.life-history').innerText.includes('Comandante offline')`));
        await evaluate(`[...document.querySelectorAll('summary')].find(s=>s.textContent==='Reiniciar ou configurar').click(); globalThis.confirm = () => false`);
        await clickText("Reinício rápido");
        assert.equal(await evaluate(`document.querySelector('output[aria-label="Vida de Jogador 2"]').textContent`),"-1");
        await evaluate(`globalThis.confirm = () => true`);
        await clickText("Reinício rápido");
        const restarted = await evaluate(`JSON.parse(localStorage.getItem('tracker-arcano.life.v1'))`);
        assert.equal(restarted.commanders.length,1);
        assert.equal(restarted.history.length,0);
        assert.ok(restarted.players.every(p=>p.life===20 && p.poison===0));
        await evaluate(`globalThis.confirm = () => true`); await clickText("Encerrar partida");
        await waitFor('document.querySelector(".life-ended")');
        assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Registrar resultado manualmente')`),false);
        // Even the authenticated site's URL falls back to the isolated shell offline.
        await command("Page.navigate",{ url: origin + "/" },sessionId);
        await waitFor('document.querySelector(".life-isolated-note")');
        assert.equal(await evaluate('!!document.querySelector("nav")'),false);
        await clickText("Retomar sessão");
        await evaluate(`globalThis.confirm = () => false; [...document.querySelectorAll('summary')].find(s=>s.textContent==='Reiniciar ou configurar').click()`);
        await clickText("Nova configuração");
        assert.ok(await evaluate(`!!document.querySelector('.life-ended')`));
        await evaluate(`globalThis.confirm = () => true`);
        await clickText("Nova configuração");
        await waitFor('document.querySelector(".life-configuration")');
        assert.equal(await evaluate(`localStorage.getItem('tracker-arcano.life.v1')`),null);
        serving = true;
        await command("Network.emulateNetworkConditions", { offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1 },sessionId);
        await evaluate(`(async () => { for(const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); })()`);
      });
    } finally {
      socket?.close();
      if (chrome && chrome.exitCode === null) {
        const exited = new Promise((done) => chrome.once("exit", done));
        chrome.kill();
        await exited;
      }
      if (server) await new Promise((done) => server.close(done));
      // Only the exact temporary test directory is removed.
      assert.equal(dirname(folder), resolve(tmpdir()));
      assert.ok(basename(folder).startsWith("tracker-arcano-ui-"));
      rmSync(folder, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    }
  },
);
