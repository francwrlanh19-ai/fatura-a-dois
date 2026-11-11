// Testa o app em largura de celular (390 px) com dados inventados; a API do GitHub é simulada aqui dentro.
// Rodar da raiz do repositório:  NODE_PATH=$(npm root -g) node testes/teste-compartilhar.js
const { chromium } = require('playwright');
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PORTA = 8765, BASE = `http://localhost:${PORTA}/`;
const SITE = path.resolve(__dirname, '..');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fatura-teste-'));   // arquivos do teste e prints ficam aqui
const CIFRA = path.join(__dirname, 'cifra.py');
const SENHA = 'SenhaDeTesteInventada123';
fs.copyFileSync(path.join(__dirname, 'dados-inventados.json'), DIR + '/backup-inventado.json');
fs.copyFileSync(path.join(__dirname, 'dados-inventados-2.json'), DIR + '/backup-inventado-2.json');
fs.writeFileSync(DIR + '/Nubank_2027-01-11.csv', 'date,title,amount\n2026-12-20,Uber *Trip,15.40\n2026-12-19,Padaria Sol,22.00\n2026-12-18,Mercado Faz de Conta,87.35\n2026-12-15,Pagamento recebido,-200.00\n2026-12-12,Loja Ficticia - Parcela 3/5,60.00\n');
execFileSync('python3', [CIFRA, 'trancar-gzip', SENHA, DIR + '/backup-inventado.json', DIR + '/semente-teste.json']);
const TOK_BOM = 'github_pat_TESTE_BOM_' + 'x'.repeat(30);
const TOK_RUIM = 'github_pat_TESTE_RUIM_' + 'y'.repeat(30);
const TOK_LEITURA = 'github_pat_TESTE_LEITURA_' + 'z'.repeat(30);
const K_PEND = 'fatura-a-dois:compartilhado:pendentes';

const novoSha = () => crypto.randomBytes(20).toString('hex');
const R = { existe: true, sha: novoSha(), texto: fs.readFileSync(DIR + '/semente-teste.json', 'utf8'), ramo: true, limite: false, offline: false,
  conflitoUmaVez: null, puts: 0, gets: 0, rawGets: 0, chaveNoRaw: false, log: [] };
function abrirRemoto() { fs.writeFileSync(DIR + '/remoto.json', R.texto); return JSON.parse(execFileSync('python3', [CIFRA, 'abrir', SENHA, DIR + '/remoto.json']).toString()); }
function trancarParaRemoto(dados) {
  fs.writeFileSync(DIR + '/dados-in.json', JSON.stringify(dados));
  execFileSync('python3', [CIFRA, 'trancar', SENHA, DIR + '/dados-in.json', DIR + '/dados-out.json']);
  R.texto = fs.readFileSync(DIR + '/dados-out.json', 'utf8'); R.sha = novoSha(); R.existe = true;
}
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, If-None-Match', 'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS' };
const json = (route, status, obj) => route.fulfill({ status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const b64linhas = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n');

async function api(route) {
  const req = route.request(), url = new URL(req.url()), m = req.method(), p = url.pathname;
  if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (R.offline) return route.abort('internetdisconnected');
  const tok = (req.headers()['authorization'] || '').replace(/^Bearer /, '');
  R.log.push(m + ' ' + p + (tok ? ' [chave]' : ''));
  if (tok && tok !== TOK_BOM && tok !== TOK_LEITURA) return json(route, 401, { message: 'Bad credentials' });
  if (p === '/repos/francwrlanh19-ai/fatura-a-dois/contents/dados.json' && m === 'GET') {
    R.gets++;
    if (url.searchParams.get('ref') !== 'dados') return json(route, 400, { message: 'ref errado' });
    if (!tok && R.limite) return json(route, 403, { message: 'API rate limit exceeded for 203.0.113.9.' });
    if (!R.ramo) return json(route, 404, { message: 'No commit found for the ref dados' });
    if (!R.existe) return json(route, 404, { message: 'Not Found' });
    if ((req.headers()['accept'] || '').includes('raw')) return route.fulfill({ status: 200, headers: CORS, body: R.texto });
    return json(route, 200, { name: 'dados.json', path: 'dados.json', sha: R.sha, size: R.texto.length, encoding: 'base64', content: b64linhas(R.texto) });
  }
  if (p === '/repos/francwrlanh19-ai/fatura-a-dois/contents/dados.json' && m === 'PUT') {
    if (!tok) return json(route, 401, { message: 'Requires authentication' });
    if (tok === TOK_LEITURA) return json(route, 403, { message: 'Resource not accessible by personal access token' });
    const body = JSON.parse(req.postData());
    if (body.branch !== 'dados') return json(route, 422, { message: 'branch errada' });
    if (!R.ramo) return json(route, 404, { message: 'Branch dados not found' });
    if (R.conflitoUmaVez) { const f = R.conflitoUmaVez; R.conflitoUmaVez = null; f(); return json(route, 409, { message: `dados.json does not match ${body.sha}` }); }
    if (R.existe && !body.sha) return json(route, 422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
    if (R.existe && body.sha !== R.sha) return json(route, 409, { message: `dados.json does not match ${body.sha}` });
    const criou = !R.existe;
    R.texto = Buffer.from(body.content, 'base64').toString('utf8'); R.sha = novoSha(); R.existe = true; R.puts++;
    return json(route, criou ? 201 : 200, { content: { name: 'dados.json', sha: R.sha }, commit: { sha: novoSha(), message: body.message } });
  }
  if (p.endsWith('/git/ref/heads/main') && m === 'GET') return json(route, 200, { ref: 'refs/heads/main', object: { sha: novoSha(), type: 'commit' } });
  if (p.endsWith('/git/refs') && m === 'POST') { if (tok !== TOK_BOM) return json(route, 403, { message: 'nope' }); R.ramo = true; return json(route, 201, { ref: 'refs/heads/dados' }); }
  return json(route, 404, { message: 'Not Found (simulação): ' + m + ' ' + p });
}
async function raw(route) {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (req.headers()['authorization']) R.chaveNoRaw = true;
  R.rawGets++;
  if (R.offline) return route.abort('internetdisconnected');
  if (!R.existe) return route.fulfill({ status: 404, headers: CORS, body: '404: Not Found' });
  return route.fulfill({ status: 200, headers: { ...CORS, 'Content-Type': 'text/plain' }, body: R.texto });
}

let falhas = 0;
const ok = (c, msg) => { console.log((c ? 'OK    ' : 'FALHA ') + msg); if (!c) falhas++; };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function celular(browser, nome) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${PORTA}` });
  await ctx.route('https://api.github.com/**', api);
  await ctx.route('https://raw.githubusercontent.com/**', raw);
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, headers: { 'Content-Type': 'text/css' }, body: '' }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => r.abort());
  const page = await ctx.newPage();
  page.erros = [];
  page.on('pageerror', (e) => page.erros.push(nome + ' pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.erros.push(nome + ' console: ' + m.text()); });
  return page;
}
const status = (pg) => pg.$eval('#nuvem-status', (e) => (e.classList.contains('hidden') ? '(escondido)' : e.innerText.replace(/\s+/g, ' ').trim()));
const semDono = (pg) => pg.$eval('#semdono h2', (e) => e.textContent).catch(() => '(sem lista)');
const tiles = (pg) => pg.$$eval('.tile', (els) => els.map((e) => e.querySelector('.lbl').textContent + '=' + e.querySelector('.val').textContent));
const ls = (pg, k) => pg.evaluate((k) => localStorage.getItem(k), k);
const esperarTexto = (pg, sel, re, ms = 10000) => pg.waitForFunction(([s, r]) => { const el = document.querySelector(s); return !!el && new RegExp(r).test(el.innerText); }, [sel, re.source], { timeout: ms });
async function esperarSubir(pg, putsAntes, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (R.puts > putsAntes && !(await ls(pg, K_PEND))) return true; await esperar(200); }
  return false;
}
async function abrirNuvem(pg) { if (!(await pg.$eval('#det-nuvem', (d) => d.open))) await pg.click('#det-nuvem summary'); }
async function chave(pg, tok, re) {
  await abrirNuvem(pg);
  await pg.fill('#inp-chave', tok); await pg.click('#form-chave button[type=submit]');
  await esperarTexto(pg, '#nuvem', re);
}

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORTA), '--bind', '127.0.0.1', '--directory', SITE], { stdio: 'ignore' });
  await esperar(800);
  const browser = await chromium.launch();
  const paginas = [];
  try {
    // 1) Ele abre o link: só vê
    const ele = await celular(browser, 'ele'); paginas.push(ele);
    await ele.goto(BASE + '#k=' + SENHA);
    await esperarTexto(ele, '#nuvem-status', /só vendo/);
    ok(!ele.url().includes('#k='), 'a senha sai da barra de endereço (' + ele.url() + ')');
    const tEle = await tiles(ele);
    ok(tEle.some((t) => t.includes('Beto')) && tEle.some((t) => t.includes('Carla')), 'ele vê as pessoas e os valores: ' + tEle.join(' · '));
    ok(await ele.$eval('#lbl-upload', (e) => e.classList.contains('hidden')), 'quem só vê não tem "Subir CSV"');
    ok(await ele.$$eval('#semdono .pbtn', (els) => els.length > 0 && els.every((b) => b.disabled)), 'quem só vê não consegue separar compras');
    ok(await ele.$eval('#ajustes', (e) => e.classList.contains('hidden')), 'quem só vê não vê os ajustes');
    ok(await ele.$eval('#aviso', (e) => e.classList.contains('hidden')), 'sem aviso vermelho para quem só vê');
    ok(/só vê/.test(await ele.$eval('#nuvem', (e) => e.innerText)), 'cartão "Compartilhamento" diz que este celular só vê');
    ok(/GitHub, trancada/.test(await ele.$eval('#rodape-dados', (e) => e.textContent)), 'rodapé explica a cópia trancada');
    const cfgEle = JSON.parse(await ls(ele, 'fatura-a-dois:compartilhar'));
    ok(cfgEle.k === SENHA && !cfgEle.t, 'senha guardada no celular dele, sem chave de edição');
    ok(!(await ls(ele, 'fatura-a-dois:v1')), 'nada foi gravado nos dados "só deste celular"');
    console.log('       status:', await status(ele), '|', await semDono(ele));
    await ele.screenshot({ path: DIR + '/tela-so-ver.png' });
    await ele.click('[data-act="aba"][data-aba="graficos"]');
    await ele.waitForSelector('#graficos:not(.hidden)');
    ok((await ele.$eval('#nuvem', (e) => e.classList.contains('hidden'))) && (await ele.$$eval('#graficos .card', (c) => c.length)) >= 2, 'gráficos abrem para quem só vê');
    await ele.click('[data-act="aba"][data-aba="separar"]');
    await ele.waitForSelector('#semdono:not(.hidden)');

    // 2) Ela abre o link e coloca a chave
    const ela = await celular(browser, 'ela'); paginas.push(ela);
    await ela.goto(BASE + '#k=' + SENHA);
    await esperarTexto(ela, '#nuvem-status', /só vendo/);
    const putsAntes = R.puts;
    await chave(ela, 'abc123', /não parece uma chave/); ok(true, 'chave com formato errado é recusada');
    await chave(ela, TOK_RUIM, /não aceitou essa chave/); ok(true, 'chave inválida é recusada');
    await chave(ela, TOK_LEITURA, /não tem permissão para salvar/); ok(true, 'chave sem "Read and write" é recusada');
    ok(R.puts === putsAntes, 'nenhuma chave ruim gravou nada');
    await chave(ela, TOK_BOM, /agora pode editar/);
    ok(R.puts === putsAntes + 1, 'chave boa: conferiu gravando uma vez');
    ok(JSON.parse(R.texto).compactado === 'nenhum', 'o app grava sem gzip (abre em celular antigo); leu a semente com gzip');
    ok(!(await ela.$eval('#lbl-upload', (e) => e.classList.contains('hidden'))), 'agora ela tem "Subir CSV"');
    ok(JSON.parse(await ls(ela, 'fatura-a-dois:compartilhar')).t === TOK_BOM, 'chave guardada só no celular dela');
    ok(!(await ela.content()).includes(TOK_BOM), 'a chave não fica escrita na tela');
    await abrirNuvem(ela);
    await ela.screenshot({ path: DIR + '/tela-edita.png', fullPage: true });

    // 3) Ela separa uma compra: sobe para o GitHub
    let antes = R.puts;
    await ela.click('#semdono .linha:first-child .pbtn[data-dono="p-carla"]');
    ok(await esperarSubir(ela, antes), 'a mudança dela subiu sozinha');
    let rem = abrirRemoto();
    ok(rem['faturas/2026-12-11'].linhas.filter((l) => l.dono === 'p-carla').length === 1, 'no GitHub, a compra está com Carla');
    ok(Object.keys(rem).some((k) => k.startsWith('regras/') && rem[k].dono === 'p-carla'), 'a regra aprendida também subiu');
    await esperarTexto(ela, '#nuvem-status', /Tudo salvo/);
    ok(!R.texto.includes('github_pat_') && !JSON.stringify(rem).includes('github_pat_'), 'a chave não vai junto com os dados');
    ok(!/Livraria|Carla|Beto/.test(R.texto), 'no GitHub o arquivo fica ilegível sem a senha');

    // 4) Ele atualiza e vê o mesmo
    await ele.click('[data-act="nuvem-atualizar"]');
    await esperar(1200);
    ok((await semDono(ele)) === (await semDono(ela)), `ele vê o mesmo que ela (${await semDono(ele)})`);

    // 5) Ela recarrega: continua tudo lá
    await ela.reload();
    await esperarTexto(ela, '#nuvem-status', /Tudo salvo/);
    ok(!(await ela.$eval('#lbl-upload', (e) => e.classList.contains('hidden'))), 'depois de recarregar ela continua editando');
    ok((await semDono(ela)) === (await semDono(ele)), 'depois de recarregar nada se perdeu');

    // 6) Dois celulares mudando ao mesmo tempo
    R.conflitoUmaVez = () => { const d = abrirRemoto(); d['regras/teste-conflito'] = { padrao: 'teste conflito', dono: 'ela', criadoEm: '2026-12-01T00:00:00.000Z' }; trancarParaRemoto(d); };
    antes = R.puts;
    await ela.click('#semdono .linha:first-child .pbtn[data-dono="ele"]');
    ok(await esperarSubir(ela, antes), 'depois de um conflito, a mudança dela subiu');
    rem = abrirRemoto();
    ok(!!rem['regras/teste-conflito'], 'conflito: a mudança do outro celular continua lá');
    ok(rem['faturas/2026-12-11'].linhas.filter((l) => l.dono === 'ele').length === 2, 'conflito: a mudança dela também');
    await esperar(400);
    ok(/teste conflito/.test(await ls(ela, 'fatura-a-dois:compartilhado')), 'conflito: o celular dela recebeu a mudança do outro');

    // 7) Sem internet
    R.offline = true;
    await ela.click('#semdono .linha:first-child .pbtn[data-dono="ela"]');
    await esperarTexto(ela, '#nuvem-status', /Sem internet/);
    ok(!!(await ls(ela, K_PEND)), 'sem internet: a mudança fica guardada no celular');
    await ela.reload();
    await esperarTexto(ela, '#nuvem-status', /Sem internet/);
    ok(!!(await ls(ela, K_PEND)) && /Tudo separado|Sem dono$/.test(await semDono(ela)), 'sem internet + recarregar: a mudança continua (' + await semDono(ela) + ')');
    R.offline = false;
    antes = R.puts;
    await ela.click('[data-act="nuvem-atualizar"]');
    ok(await esperarSubir(ela, antes), 'internet voltou: a mudança subiu');
    ok(abrirRemoto()['faturas/2026-12-11'].linhas.filter((l) => l.tipo === 'compra' && !l.dono).length === 0, 'no GitHub, nenhuma compra sem dono');

    // 8) Limite da API para quem só vê: lê pelo raw
    R.limite = true; const rawAntes = R.rawGets;
    await ele.click('[data-act="nuvem-atualizar"]'); await esperar(1500);
    ok(R.rawGets > rawAntes && !/pausa|não respondeu/.test(await status(ele)), 'limite da API: leu pelo raw sem erro (' + await status(ele) + ')');
    ok((await semDono(ele)) === (await semDono(ela)), 'ele continua vendo o mesmo que ela');
    R.limite = false;
    ok(!R.chaveNoRaw, 'a chave nunca vai para o raw');

    // 9) Senha errada
    const outro = await celular(browser, 'outro'); paginas.push(outro);
    await outro.goto(BASE + '#k=SenhaErradaInventada9999');
    await esperarTexto(outro, '#nuvem-status', /não abre a fatura/);
    ok(true, 'link com senha errada avisa');

    // 10) Modo só neste celular (roteiro do CLAUDE.md)
    const local = await celular(browser, 'local'); paginas.push(local);
    const getsAntes = R.gets;
    await local.goto(BASE);
    await local.waitForSelector('#vazio:not(.hidden)');
    await local.setInputFiles('#inp-backup', DIR + '/backup-inventado-2.json');
    await local.click('[data-act="confirmar-restaurar"]'); await esperar(400);
    await local.setInputFiles('#inp-file', DIR + '/Nubank_2027-01-11.csv');
    await local.click('[data-act="confirmar-upload"]'); await esperar(500);
    const sd1 = await semDono(local);
    await local.click('#semdono .linha:first-child .pbtn[data-dono="ela"]'); await esperar(1200);
    await local.reload(); await esperar(700);
    const nFat = await local.$$eval('#sel-fatura option', (o) => o.length);
    ok(nFat === 2 && (await semDono(local)) !== sd1, `modo local: backup + CSV + separar + recarregar ok (${sd1} → ${await semDono(local)}, ${nFat} faturas)`);
    ok(R.gets === getsAntes, 'modo local não fala com o GitHub');
    ok((await status(local)) === '(escondido)', 'modo local não mostra a barra do compartilhamento');
    ok(/Nada vai pra internet/.test(await local.$eval('#rodape-dados', (e) => e.textContent)), 'modo local mantém o rodapé antigo');

    // 11) Colar o link no modo local, virar editora e levar os dados deste celular
    await abrirNuvem(local);
    await local.fill('#inp-link', 'https://francwrlanh19-ai.github.io/fatura-a-dois/#k=' + SENHA);
    await Promise.all([local.waitForNavigation(), local.click('#form-link button')]);
    await esperarTexto(local, '#nuvem-status', /só vendo/);
    ok((await semDono(local)) === (await semDono(ela)), 'colar o link: passa a ver a fatura compartilhada');
    await chave(local, TOK_BOM, /agora pode editar/);
    await esperarTexto(local, '#nuvem', /dados de antes do compartilhamento/);
    antes = R.puts;
    await local.click('[data-act="nuvem-usar-locais"]');
    await local.click('[data-act="nuvem-confirmar"]');
    ok(await esperarSubir(local, antes), 'usar os dados deste celular: subiu');
    rem = abrirRemoto();
    ok(rem['config/pessoas'].lista.some((p) => p.nome === 'Davi') && !!rem['faturas/2027-01-11'], 'o compartilhado virou os dados deste celular');
    await ela.click('[data-act="nuvem-atualizar"]').catch(() => {});
    await esperar(300);
    await ela.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

    // 12) Sair do compartilhamento: volta para os dados só deste celular
    await abrirNuvem(local);
    await local.click('[data-act="nuvem-sair"]');
    await Promise.all([local.waitForNavigation(), local.click('[data-act="nuvem-confirmar"]')]);
    await esperar(700);
    ok((await status(local)) === '(escondido)' && (await local.$$eval('#sel-fatura option', (o) => o.length)) === 2, 'saiu: voltou para os dados deste celular, inteiros');
    ok(!(await ls(local, 'fatura-a-dois:compartilhar')) && !(await ls(local, 'fatura-a-dois:compartilhado')), 'saiu: senha e cópia compartilhada apagadas deste celular');

    // 13) Link novo sem nada no GitHub (sem a branch dados)
    R.ramo = false; R.existe = false;
    const novo = await celular(browser, 'novo'); paginas.push(novo);
    await novo.goto(BASE + '#k=' + SENHA);
    await esperarTexto(novo, '#nuvem-status', /Ainda não tem nada/);
    await chave(novo, TOK_BOM, /agora pode editar/);
    ok(R.ramo && R.existe, 'criou a branch "dados" e o arquivo');
    await novo.waitForSelector('#vazio:not(.hidden)');
    antes = R.puts;
    await novo.setInputFiles('#inp-file', DIR + '/Nubank_2027-01-11.csv');
    await novo.click('[data-act="confirmar-upload"]');
    ok(await esperarSubir(novo, antes), 'CSV novo subiu');
    ok(!!abrirRemoto()['faturas/2027-01-11'], 'a fatura do CSV está no GitHub');

    // 14) Copiar o link
    await abrirNuvem(ela);
    await ela.click('[data-act="nuvem-copiar"]');
    await esperar(300);
    const copiado = await ela.evaluate(() => navigator.clipboard.readText());
    ok(copiado === BASE + '#k=' + SENHA, 'copiar o link: ' + copiado);

    const erros = paginas.flatMap((p) => p.erros);
    ok(!erros.length, 'console sem erros' + (erros.length ? ': ' + erros.join(' | ') : ''));
  } catch (e) {
    falhas++; console.log('ERRO NO TESTE:', e.message.split('\n').slice(0, 6).join('\n'));
    console.log('últimas chamadas:', R.log.slice(-12).join(' | '));
    for (const p of paginas) { try { console.log('  status', await status(p)); } catch (_) { /* fechada */ } }
  } finally { await browser.close(); srv.kill(); }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO CERTO');
  console.log('prints em ' + DIR);
  process.exit(falhas ? 1 : 0);
})();
