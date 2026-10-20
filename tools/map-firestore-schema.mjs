/**
 * Intel de Campo - mapa amostral do Firestore.
 * Leitura somente: Firebase Auth (login) + Firestore REST (GET).
 * Nenhum documento, ID de registro, nome, e-mail ou token é exportado.
 * Node 22+. Execute na raiz: node tools/map-firestore-schema.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const COLLECTIONS = [
  'promotores', 'atividades', 'clientes', 'relatorios',
  'relatorios_comerciais', 'relatorios_treinamentos', 'relatorios_assistencia_tecnica'
];
const EXTRA = [
  'administradores', 'atividades_excluidas', 'catalogos_produtos',
  'logs_sistema', 'produtos', 'usuarios'
];
const REPORTS = new Set([
  'relatorios', 'relatorios_comerciais', 'relatorios_treinamentos',
  'relatorios_assistencia_tecnica'
]);
const STATUS = new Set(['Pendente','Em andamento','Concluída','Cancelada']);

function options(argv) {
  const at = argv.indexOf('--limit');
  const limit = at < 0 ? 30 : Number(argv[at + 1]);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('--limit deve estar entre 1 e 100.');
  }
  return {limit, all: argv.includes('--all-collections'), audit: !argv.includes('--no-audit')};
}
function kind(value) {
  if (!value || typeof value !== 'object') return 'unknown';
  const k = Object.keys(value)[0];
  return ({
    stringValue:'string', integerValue:'integer', doubleValue:'number',
    booleanValue:'boolean', timestampValue:'timestamp', nullValue:'null',
    mapValue:'map', arrayValue:'array', geoPointValue:'geopoint',
    referenceValue:'reference', bytesValue:'bytes'
  })[k] || 'unknown';
}
function value(fields, key) {
  const item = fields?.[key] || {};
  if ('stringValue' in item) return item.stringValue;
  if ('timestampValue' in item) return item.timestampValue;
  if ('integerValue' in item) return Number(item.integerValue);
  if ('doubleValue' in item) return Number(item.doubleValue);
  if ('booleanValue' in item) return item.booleanValue;
  return null;
}
function documentId(doc) { return String(doc?.name || '').split('/').pop(); }
function safeFieldName(input) {
  const field = String(input);
  // Evita vazar eventuais chaves dinâmicas de mapas que sejam e-mails/UUIDs.
  if (field.includes('@') || /^[0-9]{8,}$/.test(field) ||
      /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(field)) return '[chave_dinamica]';
  return field;
}
function fieldMatrix(documents) {
  const stats = new Map();
  for (const doc of documents) {
    const seen = new Map();
    const walk = (fields, prefix = '', depth = 0) => {
      if (depth > 7) return;
      for (const [name, fieldValue] of Object.entries(fields || {})) {
        const key = prefix + safeFieldName(name);
        const type = kind(fieldValue);
        if (!seen.has(key)) seen.set(key, new Set());
        seen.get(key).add(type);
        if (type === 'map') walk(fieldValue.mapValue?.fields, key + '.', depth + 1);
        if (type === 'array') {
          for (const item of (fieldValue.arrayValue?.values || []).slice(0, 15)) {
            const itemKey = key + '[]';
            const itemType = kind(item);
            if (!seen.has(itemKey)) seen.set(itemKey, new Set());
            seen.get(itemKey).add(itemType);
            if (itemType === 'map') walk(item.mapValue?.fields, itemKey + '.', depth + 1);
          }
        }
      }
    };
    walk(doc.fields || {});
    for (const [key, types] of seen) {
      const record = stats.get(key) || {present:0, types:{}};
      record.present++;
      for (const type of types) record.types[type] = (record.types[type] || 0) + 1;
      stats.set(key, record);
    }
  }
  return [...stats].sort(([a],[b]) => a.localeCompare(b,'pt-BR')).map(([field,record]) => ({
    field, present:record.present,
    percent:documents.length ? Math.round(100 * record.present / documents.length) : 0,
    types:record.types
  }));
}
function reportCollection(fields) {
  const explicit = value(fields,'relatorioColecao');
  if (explicit) return explicit;
  if (value(fields,'relatorioId')) return 'relatorios';
  const type = String(value(fields,'tipoVisita') || '').trim().toLowerCase();
  if (type === 'treinamento' || value(fields,'objetivo') === 'Treinamento') return 'relatorios_treinamentos';
  if (type.includes('assistência técnica') || type.includes('assistencia tecnica')) return 'relatorios_assistencia_tecnica';
  return 'relatorios_comerciais';
}
async function promptCredentials() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Execute em um terminal interativo; nunca envie sua senha por chat.');
  }
  const rl = readline.createInterface({input:process.stdin, output:process.stdout});
  const email = (await rl.question('E-mail Firebase Authentication: ')).trim();
  rl.close();
  const password = await new Promise((resolve,reject) => {
    let entry = '';
    process.stdout.write('Senha (oculta): ');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    function close() {
      process.stdin.removeListener('data',handle);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    }
    function handle(chars) {
      for (const c of chars) {
        if (c === '\u0003') { close(); reject(new Error('Cancelado.')); return; }
        if (c === '\r' || c === '\n') { close(); resolve(entry); return; }
        if (c === '\u0008' || c === '\u007f') entry = entry.slice(0,-1);
        else if (c >= ' ' && c !== '\u007f') entry += c;
      }
    }
    process.stdin.on('data',handle);
  });
  if (!email || !password) throw new Error('E-mail e senha são necessários.');
  return {email,password};
}
async function auth(apiKey) {
  const credentials = await promptCredentials();
  const endpoint = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(apiKey);
  const response = await fetch(endpoint,{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...credentials, returnSecureToken:true})
  });
  if (!response.ok) {
    let firebaseError = 'UNKNOWN';
    try {
      const payload = await response.json();
      // Apenas o código padronizado: jamais imprimir payload, e-mail, senha ou token.
      const message = String(payload?.error?.message || '');
      const match = message.match(/^([A-Z][A-Z0-9_]{2,80})(?=\s|:|$)/);
      if (match) firebaseError = match[1];
    } catch {}
    throw new Error('Firebase Auth HTTP ' + response.status + ' — ' + firebaseError +
      '. Confira se o e-mail pertence ao projeto e se a conta possui login por e-mail/senha.');
  }
  const result = await response.json();
  if (!result.idToken) throw new Error('Autenticação sem token.');
  return result.idToken;
}
async function getJson(url,token) {
  const response = await fetch(url,{method:'GET',headers:{Authorization:'Bearer ' + token}});
  if (response.status === 404) return null;
  if (!response.ok) {
    const code = response.status === 429 ? 'cota excedida' : response.status === 403 ? 'permissão negada' : 'HTTP ' + response.status;
    throw new Error('Consulta Firestore falhou: ' + code);
  }
  return response.json();
}
function inc(object,key) {object[key] = (object[key] || 0) + 1;}
async function run() {
  const opt = options(process.argv.slice(2));
  const {firebaseConfig} = await import('../firebase-config.js');
  if (!firebaseConfig?.apiKey || !firebaseConfig?.projectId) throw new Error('firebase-config.js inválido.');
  console.log('Projeto ' + firebaseConfig.projectId + '; máximo de ' + opt.limit + ' documentos por coleção.');
  console.log('Somente leituras; nenhuma alteração será feita no Firebase.');
  const token = await auth(firebaseConfig.apiKey);
  const base = 'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(firebaseConfig.projectId) + '/databases/(default)/documents';
  const collections = opt.all ? [...COLLECTIONS,...EXTRA] : COLLECTIONS;
  const sampled = {};
  let requests = 0;
  for (const name of collections) {
    let list = [], next = '', hasMore = false;
    do {
      const url = new URL(base + '/' + encodeURIComponent(name));
      url.searchParams.set('pageSize',String(opt.limit-list.length));
      if (next) url.searchParams.set('pageToken',next);
      requests++;
      const response = await getJson(url.toString(),token) || {};
      list.push(...(response.documents || []));
      next = response.nextPageToken || '';
      hasMore = Boolean(next);
    } while (next && list.length < opt.limit);
    sampled[name] = {documents:list, possiblyPartial:hasMore || list.length === opt.limit};
    console.log('  ' + name + ': ' + list.length + ' documentos na amostra.');
  }
  const issueCounts={}, statuses={}, reportSources={};
  let inspected=0, checkedReferences=0;
  const cache = new Map();
  async function find(collection,id) {
    const key = collection + '/' + id;
    if (!cache.has(key)) {
      requests++;
      cache.set(key,await getJson(base + '/' + encodeURIComponent(collection) + '/' + encodeURIComponent(id),token));
    }
    return cache.get(key);
  }
  if (opt.audit) {
    const knownPromoters = new Set((sampled.promotores?.documents || []).map(documentId));
    for (const activity of sampled.atividades.documents) {
      inspected++;
      const f=activity.fields || {};
      const id=documentId(activity);
      const promoter=value(f,'ptvId'), client=value(f,'clienteId');
      const report=value(f,'relatorioId'), status=value(f,'status');
      inc(statuses,STATUS.has(status) ? status : 'desconhecido');
      if (!STATUS.has(status)) inc(issueCounts,'status_desconhecido');
      if (!promoter) inc(issueCounts,'atividade_sem_ptvId');
      else {
        if (!knownPromoters.has(promoter)) inc(issueCounts,'promotor_nao_encontrado_na_amostra');
        checkedReferences++;
        if (!await find('promotores',promoter)) inc(issueCounts,'promotor_nao_encontrado_por_id');
      }
      if (!client) inc(issueCounts,'atividade_sem_clienteId');
      else {
        checkedReferences++;
        if (!await find('clientes',client)) inc(issueCounts,'cliente_nao_encontrado_por_id');
      }
      if (status === 'Em andamento' && !value(f,'checkinDataHora')) inc(issueCounts,'andamento_sem_checkin');
      if (status === 'Concluída' && !value(f,'checkoutDataHora')) inc(issueCounts,'concluida_sem_checkout');
      if (status === 'Concluída' && !report) inc(issueCounts,'concluida_sem_relatorio');
      if (report) {
        const collection = reportCollection(f);
        if (!REPORTS.has(collection)) inc(issueCounts,'colecao_de_relatorio_desconhecida');
        else {
          inc(reportSources,collection);
          checkedReferences++;
          const linked = await find(collection,report);
          if (!linked) inc(issueCounts,'relatorio_nao_encontrado_por_id');
          else {
            if (value(linked.fields,'atividadeId') !== id) inc(issueCounts,'relatorio_atividadeId_divergente');
            if (promoter && value(linked.fields,'ptvId') !== promoter) inc(issueCounts,'relatorio_ptvId_divergente');
          }
        }
      }
    }
  }
  const result = {
    version:1, generatedAt:new Date().toISOString(), projectId:firebaseConfig.projectId,
    disclaimer:'Todos os valores e totais são amostrais. Nenhum documento ou identificador foi exportado.',
    sampleLimit:opt.limit,
    collections:Object.fromEntries(collections.map(name => [name,{
      sampledDocuments:sampled[name].documents.length,
      possiblyPartial:sampled[name].possiblyPartial,
      fields:fieldMatrix(sampled[name].documents)
    }])),
    audit:opt.audit ? {inspectedActivities:inspected,checkedReferences,statuses,reportSources,issueCounts}
      : {disabled:true},
    approximateHttpRequests:requests
  };
  const dir=path.resolve('schema-firestore');
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'mapa-estrutura.json'),JSON.stringify(result,null,2) + '\n');
  const lines=['# Matriz de campos - Intel de Campo 0.1','','Projeto: ' + result.projectId,
    'Gerado em: ' + result.generatedAt,
    '','**Atenção:** amostras parciais; não são totais de produção.',''];
  for (const [name,item] of Object.entries(result.collections)) {
    lines.push('## ' + name,'','Documentos amostrados: ' + item.sampledDocuments,'',
      '| Campo | Tipos | Ocorrências |','|---|---|---:|');
    for (const field of item.fields) lines.push('| ' + field.field.replaceAll('|','\\|') +
      ' | ' + Object.keys(field.types).join(', ') + ' | ' +
      field.present + '/' + item.sampledDocuments + ' (' + field.percent + '%) |');
    lines.push('');
  }
  if (opt.audit) {
    lines.push('## Auditoria de vínculos (amostra)','',
      'Atividades examinadas: ' + inspected + '; vínculos conferidos: ' + checkedReferences,'',
      '| Alerta | Ocorrências |','|---|---:|');
    for (const [k,v] of Object.entries(issueCounts)) lines.push('| ' + k + ' | ' + v + ' |');
    if (!Object.keys(issueCounts).length) lines.push('| Nenhum alerta detectado | 0 |');
  }
  await fs.writeFile(path.join(dir,'matriz-campos.md'),lines.join('\n') + '\n');
  console.log('Arquivos criados em schema-firestore/. Nenhuma escrita no Firestore.');
}
const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) run().catch(error => {console.error('Erro: '+error.message); process.exitCode=1;});
export {options,kind,fieldMatrix,reportCollection};
