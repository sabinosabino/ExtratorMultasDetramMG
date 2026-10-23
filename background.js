const ID_BLOQUEADAS = /^(chrome|brave|edge|about|devtools|view-source|chrome-extension|extensions|filesystem|blob|data):/i;

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  if (!tab.url || ID_BLOQUEADAS.test(tab.url)) {
    await mostrarBadge(tab.id, "OPS", "#b3261e");
    return;
  }

  await mostrarBadge(tab.id, "...", "#1565c0");

  try {
    const [{ result: links }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: coletarLinksDefesas,
    });

    const alvos = (links || []).filter((url) => url && !ID_BLOQUEADAS.test(url));

    let texto;

    if (alvos.length) {
      const partes = [];

      for (const url of alvos) {
        try {
          const trecho = await processarLink(url);
          partes.push(
            trecho && trecho.trim()
              ? trecho
              : `========== LINK ${url} ==========\n[vazio] nenhum conteúdo extraído`
          );
        } catch (erro) {
          console.error("[Extrair] Falha no link:", url, erro);
          partes.push(`========== LINK ${url} ==========\n[erro] ${erro?.message || erro}`);
        }
      }

      texto = partes.join("\n\n");
    } else {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: processarLinhas,
      });
      texto = result;
    }

    if (!texto || !texto.trim()) throw new Error("Nenhum conteúdo extraído");

    const url = "data:text/plain;charset=utf-8," + encodeURIComponent(texto);
    const nomeArquivo = gerarNome();

    await chrome.downloads.download({
      url,
      filename: nomeArquivo,
      saveAs: false,
    });

    const total = (texto.match(/========== AIT/g) || []).length;
    console.log(`[Extrair] ${nomeArquivo} — ${total} modal(is), ${texto.length} bytes`);
    await mostrarBadge(tab.id, String(Math.min(total, 99)), "#1b873f");
  } catch (erro) {
    console.error("[Extrair] Falha:", erro);
    await mostrarBadge(tab.id, "ERR", "#b3261e");
  }
});

function coletarLinksDefesas() {
  const vistos = new Set();
  const links = [];

  document
    .querySelectorAll('#divDefesas table > tbody > tr:nth-child(2) > td:nth-child(1) > a')
    .forEach((a) => {
      const href = (a.href || a.getAttribute("href") || "").trim();
      if (!href || vistos.has(href)) return;
      vistos.add(href);
      links.push(href);
    });

  return links;
}

async function processarLink(url) {
  const aba = await chrome.tabs.create({ url, active: false });

  try {
    const carregada = await esperarAbaCarregar(aba.id, 30000);
    if (!carregada) throw new Error("página não carregou");

    await esperarBotoes(aba.id, 20000);

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: aba.id },
      func: processarLinhas,
    });

    return result || "";
  } finally {
    await chrome.tabs.remove(aba.id).catch(() => {});
  }
}

async function esperarAbaCarregar(tabId, timeoutMs) {
  const fim = Date.now() + timeoutMs;
  await new Promise((r) => setTimeout(r, 300));

  while (Date.now() < fim) {
    try {
      const aba = await chrome.tabs.get(tabId);
      if (aba.status === "complete") return aba;
    } catch (_) {
      return null;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  return null;
}

async function esperarBotoes(tabId, timeoutMs) {
  const fim = Date.now() + timeoutMs;

  while (Date.now() < fim) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!document.querySelector('button[id="abrir-modal"]'),
    });
    if (result) return true;
    await new Promise((r) => setTimeout(r, 300));
  }

  return false;
}

function processarLinhas() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function esperar(fn, timeoutMs, intervaloMs = 100) {
    const fim = Date.now() + timeoutMs;
    while (Date.now() < fim) {
      const valor = fn();
      if (valor) return valor;
      await sleep(intervaloMs);
    }
    return null;
  }

  function modalVisivel() {
    const aberto = document.querySelector(".modal.show");
    if (aberto) return aberto;
    return Array.from(document.querySelectorAll(".modal")).find((el) => el.offsetParent !== null) || null;
  }

  const botoes = Array.from(document.querySelectorAll('button[id="abrir-modal"]'));
  if (!botoes.length) return "";

  const partes = [];

  return (async () => {
    for (const btn of botoes) {
      const ait = (btn.getAttribute("data-ait") || "").trim();

      await sleep(1000);

      btn.click();

      const modal = await esperar(modalVisivel, 10000);
      if (!modal) {
        partes.push(`========== AIT ${ait || "?"} ==========\n[erro] modal não abriu`);
        continue;
      }

      const ok = await esperar(() => {
        const el = modal.querySelector(".ait");
        const atual = el ? el.textContent.trim() : "";
        return !el || !ait || atual === ait ? true : false;
      }, 8000);

      await sleep(ok ? 1500 : 3000);

      partes.push(`========== AIT ${ait || "?"} ==========\n${extrairDados(modal)}`);

      const fechar =
        modal.querySelector('.modal-footer [data-dismiss="modal"]') ||
        modal.querySelector('[data-dismiss="modal"]');
      if (fechar) fechar.click();

      await esperar(() => !modalVisivel(), 8000);
      await sleep(1500);
    }

    return partes.join("\n\n");
  })();

  function extrairDados(modal) {
    const linhas = [];

    const placa = modal.querySelector(".numero-placa");
    if (placa) linhas.push(`Placa: ${placa.textContent.trim()}`);

    modal.querySelectorAll("dl.row").forEach((dl) => {
      const dts = dl.querySelectorAll("dt");
      const dds = dl.querySelectorAll("dd");
      dts.forEach((dt, i) => {
        if (dt.classList.contains("d-none")) return;
        const label = dt.textContent.replace(/:$/, "").trim();
        const dd = dds[i];
        const valor = dd ? dd.textContent.trim() : "";
        if (label) linhas.push(`${label}: ${valor}`);
      });
    });

    if (!linhas.length) {
      const corpo = modal.querySelector(".modal-body");
      return (corpo ? corpo.innerText : modal.innerText).trim();
    }
    return linhas.join("\n");
  }
}

function gerarNome() {
  const uuid =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `infracoes-${uuid}.txt`;
}

async function mostrarBadge(tabId, texto, cor) {
  try {
    await chrome.action.setBadgeText({ tabId, text: texto });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: cor });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    }, 4000);
  } catch (_) {}
}
