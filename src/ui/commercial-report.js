import {buscarProdutos, nomeProduto, idProduto} from '../domain/products.js';
import { TechnicalReportEditor, mediaStore, compressImage, createThumbnail, reportMarkup } from '../../technical-report-editor.js';
// Drafts are staged locally; the application injects database persistence.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const modules = [
  ['contact','Contato na loja','Dados do responsável de te receber'],
  ['availability','Disponibilidade dos produtos','Disponibilidade, estoque e giro dos produtos'],
  ['exposure','Exposição e materiais','Como a Advance está exposta na loja'],
  ['free','Relatório livre','Salve depoimentos, anotações e imagens']
];
const questions = [['low','Estoque baixo'],['missing','Falta de produto'],['slow','Produto com baixo giro']];
const materials = ['Catálogo','Cartela de cores','Material de ponto de venda','Material técnico','Outro'];
const blank = () => ({name:'',role:'',goal:'',low:'',missing:'',slow:'',products:{low:[],missing:[],slow:[]},organization:'',materials:[],other:'',text:'',blocks:null,photos:[],attachments:[],feedback:[],pending:''});
export class CommercialReport {
  constructor(host, onClose = () => {}, onSave = () => {}, review = {}) {
    this.reviewCallbacks = review;
    this.productCatalog = []; this.productQueries = {}; this.productLoading = false; this.productLoaded = false; this.productError = '';
    this.compressPhoto = compressImage; this.thumbnailPhoto = createThumbnail; this.photoGeneration = 0; this.photoBusy = false;
    this.host = host; this.onClose = onClose; this.onSave = onSave; this.baseReports = new Map(); this.revisions = new Map(); this.staged = new Map(); this.drafts = new Map(); this.saved = new Map(); this.initial = new Map();
    this.root = document.createElement('section'); this.root.className = 'commercial-report'; this.root.hidden = true; host.append(this.root);
    this.root.addEventListener('click', e => this.click(e));
    this.root.addEventListener('input', e => this.input(e));
    this.root.addEventListener('change', e => this.change(e));
    this.root.addEventListener('keydown', e => {
      const key = e.target.dataset.productSearch;
      if (key && e.key === 'ArrowDown') { e.preventDefault(); this.root.querySelector('#cr-results-' + key + ' button')?.focus(); }
      if (e.target.dataset.selectProduct && ['ArrowDown','ArrowUp'].includes(e.key)) { e.preventDefault(); (e.key === 'ArrowDown' ? e.target.nextElementSibling : e.target.previousElementSibling)?.focus(); }
      if (e.target.dataset.selectProduct && e.key === 'Escape') this.root.querySelector('[data-product-search="' + e.target.dataset.productQuestion + '"]')?.focus();
    });
    window.addEventListener('beforeunload', e => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } });
  }
  get dirty() { return this.active && !this.reviewCheckout && JSON.stringify(this.data) !== (this.saved.get(this.key) || this.initial.get(this.key)); }
  savedReport(key) { const snapshot=this.saved.get(key); if(!snapshot) return null; const data=JSON.parse(snapshot); return {...this.baseReports?.get(key), dadosComerciais:{versao:1,...data}, textoAtual:data.text, conteudoRelatorio:{versao:1,blocos:data.blocks || []}, historico:this.revisions.get(key) || [], atualizadoEm:this.revisions.get(key)?.at(-1)?.salvoEm}; }
  hydrate(key, report, force = false) {
    if (!force && this.drafts.has(key)) return;
    const data = {...blank(), ...(report?.dadosComerciais || {}), text:report?.textoAtual || '', blocks:report?.conteudoRelatorio?.blocos || null};
    delete data.versao;
    data.products = {...blank().products, ...data.products};
    this.baseReports.set(key, report || null);
    this.drafts.set(key, data);
    this.initial.set(key, JSON.stringify(data));
    if (report) this.saved.set(key, JSON.stringify(data));
    else this.saved.delete(key);
    this.revisions.set(key, report?.historico || []);
  }
  async savePersisted() {
    if (this.saving) return;
    this.saving = true;
    const key = this.key, generation = this.photoGeneration;
    this.root.querySelectorAll('button,input,select').forEach(control => control.disabled = true);
    this.status('Salvando relatório...');
    try {
      const report = await this.reviewCallbacks.persist(key, structuredClone(this.data), this.baseReports.get(key));
      if (generation !== this.photoGeneration) return;
      for (const photo of [...(report.dadosComerciais?.photos || []), ...(report.conteudoRelatorio?.blocos || [])]) {
        if (photo.storage === 'r2') this.staged.delete(photo.id);
      }
      this.hydrate(key, report, true);
      this.data = this.drafts.get(key);
      this.onSave(key);
    } catch (error) {
      if (generation === this.photoGeneration) this.status(error.message || 'Não foi possível salvar. Tente novamente.');
    } finally {
      if (generation === this.photoGeneration) {
        this.saving = false;
        this.root.querySelectorAll('button,input,select').forEach(control => control.disabled = false);
      }
    }
  }
  hasSaved(key) { return this.saved.has(key); }
  open(context, page = 'overview', reviewCheckout = false) {
    this.key = context.id; this.context = context; this.reviewCheckout = reviewCheckout;
    if (!this.drafts.has(this.key)) { const data = {...blank(), text:context.text || ''}; this.drafts.set(this.key, data); this.initial.set(this.key, JSON.stringify(data)); }
    this.data = reviewCheckout && this.saved.has(this.key) ? JSON.parse(this.saved.get(this.key)) : this.drafts.get(this.key); this.active = true; this.page = page;
    this.host.classList.add('commercial-mode'); this.root.hidden = false; this.render();
  }
  clear() {
    this.productCatalog=[]; this.productQueries={}; this.productLoaded=false; this.productLoading=false; this.productError='';
    this.photoGeneration++; this.photoBusy=false; this.saving=false; this.checkoutResizeObserver?.disconnect();
    if (this.editor) this.editor.generation = (this.editor.generation || 0) + 1;
    for (const data of this.drafts.values()) for (const key of ['photos','attachments']) for (const photo of data[key]) this.releasePhoto(photo);
    for (const id of this.staged.keys()) mediaStore.clearLocal(id); this.staged.clear();
    this.baseReports.clear(); this.drafts.clear(); this.saved.clear(); this.initial.clear(); this.revisions.clear(); this.deactivate();
  }
  backModule() { if(this.saving || this.photoBusy || (this.page==='free' && this.editor?.busy)) { this.status('Aguarde o processamento das imagens.'); return true; } if(this.reviewCheckout) { this.reviewCallbacks.returnCheckout?.(); return true; } if (!this.active || this.page === 'overview') return false; this.page = 'overview'; this.render(); return true; }
  deactivate() { this.active = false; this.host.classList.remove('commercial-mode'); this.root.hidden = true; }
  complete(key, data = this.data) {
    if(key === 'contact') return !!(data.name.trim() && data.role && data.goal);
    if(key === 'availability') return questions.every(([k]) => data[k] && (data[k] !== 'Sim' || data.products[k].length));
    if(key === 'exposure') return !!data.organization && data.photos.length <= 6 && (data.organization === 'Não foi verificado' ? data.photos.length === 0 : data.organization === 'Organizada e visível' || data.photos.length >= 1) && (!data.materials.includes('Outro') || data.other.trim());
    return !!(data.text.trim() || data.blocks?.some(block=>block.kind==='media'));
  }
  field(label, key, placeholder) { return `<label class="cr-field">${label}<input data-field="${key}" value="${escape(this.data[key])}" placeholder="${placeholder}" maxlength="180"></label>`; }
  select(label,key,options) { return `<label class="cr-field">${label}<select data-field="${key}"><option value="">Selecione uma opção</option>${options.map(o=>`<option ${this.data[key]===o?'selected':''}>${o}</option>`).join('')}</select></label>`; }
  radios(key,options) { return `<div class="cr-options">${options.map(o=>`<label><input type="radio" name="cr-${key}" data-field="${key}" value="${o}" ${this.data[key]===o?'checked':''}>${o}</label>`).join('')}</div>`; }
  rows(readOnly = false) { return `<div class="cr-modules">${modules.filter(([k])=>!readOnly || k!=='free').map(([k,title,desc])=>`<button type="button" class="cr-module" data-page="${k}" ${readOnly?'data-review="true"':''}><span><strong>${title}${['contact','availability','exposure'].includes(k)?'<small class="cr-required">(Obrigatório)</small>':k==='free'?'<small class="cr-progress">(Opcional)</small>':''}</strong><span>${desc}</span>${readOnly?'':`<small class="cr-progress">${this.complete(k)?'Preenchido':'Não preenchido'}</small>`}</span><span class="cr-chevron" aria-hidden="true">›</span></button>`).join('')}</div>`; }
  previews(key) { return `<div class="cr-photo-previews">${this.data[key].map((photo,i)=>`<figure class="report-media-block">${reportMarkup([photo],this.key)}<button type="button" class="report-media-remove" data-remove-image="${key}:${i}" aria-label="Remover ${escape(photo.name)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></figure>`).join('')}</div>`; }
  releasePhoto(photo) {
    if(photo.url) URL.revokeObjectURL(photo.url);
    if(photo.thumbnailUrl) URL.revokeObjectURL(photo.thumbnailUrl);
    if(photo.id) { mediaStore.clearLocal(photo.id); this.staged.delete(photo.id); }
  }

  render() {
    const page = this.page; const info = modules.find(([k])=>k===page);
    let body = '';
    for(const photo of this.data.photos) { const local=this.staged.get(photo.id); if(local && !mediaStore.local(photo.id)) mediaStore.stage(photo.id,local.file,local.thumbnail); }
    if(page==='overview') body = `<h1>Visita comercial - ${escape(this.context.client)}</h1><p class="cr-code">${escape(this.context.code || '')}</p><label class="cr-field">Chegada<div class="cr-pills"><span>${escape(this.context.date)}</span><span>${escape(this.context.time)}</span></div></label><label class="cr-field">Cliente<div class="cr-pill">${escape(this.context.client)}</div></label>${this.rows()}<div class="cr-footer"><button class="btn-checkin cr-primary" data-action="save">Salvar relatório</button></div>`;
    if(page==='contact') body = this.field('Nome','name','Quem te recebeu?') + this.select('Cargo do responsável','role',['Proprietário','Gerente','Comprador','Vendedor','Responsável técnico']) + this.select('Objetivo principal','goal',['Relacionamento e levantamento de necessidades','Apoio às vendas ou reposição','Apresentação de produto ou lançamento','Orientação aos vendedores','Acompanhamento de pendência']);
    if(page==='availability') body = questions.map(([k,title])=>`<fieldset><legend>${title}</legend>${this.radios(k,['Sim','Não'])}${this.data[k]==='Sim'?`<div class="cr-products">${this.data.products[k].map((p,i)=>`<button type="button" data-remove-product="${k}:${i}" aria-label="Remover ${escape(nomeProduto(p))}">${escape(nomeProduto(p))} <span>×</span></button>`).join('')}<div class="cr-product-search"><input type="search" data-product-search="${k}" value="${escape(this.productQueries[k] || '')}" aria-label="Buscar produto em ${title}" placeholder="Buscar produto por nome" role="combobox" aria-autocomplete="list" aria-controls="cr-results-${k}" aria-expanded="false" autocomplete="off"><div id="cr-results-${k}" class="cr-product-results" role="listbox" aria-label="Produtos encontrados"></div></div></div>`:''}</fieldset>`).join('');
    if(page==='exposure') body = `<fieldset><legend>Organização dos produtos</legend>${this.radios('organization',['Organizada e visível','Necessidade de organização','Ausência de exposição','Não foi verificado'])}</fieldset>${this.data.organization && this.data.organization!=='Não foi verificado'?`<label class="cr-photo"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 5l2-2h4l2 2h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><circle cx="12" cy="12" r="4"/></svg>Adicione uma fotografia.<input type="file" accept="image/*" data-upload="photos" multiple hidden></label><small>${this.data.organization==='Organizada e visível'?'Fotografia opcional':'Adicione pelo menos uma fotografia'} · ${this.data.photos.length}/6</small>${this.previews('photos')}`:''}<fieldset><legend>Necessidade de reposição ou ausência</legend><div class="cr-options">${materials.map(o=>`<label><input type="checkbox" data-array="materials" value="${o}" ${this.data.materials.includes(o)?'checked':''}>${o}</label>`).join('')}</div>${this.data.materials.includes('Outro')?this.field('Qual material?','other','Descreva o material'):''}</fieldset>`;
    if(page==='free') body = `<section class="relatorio-editor-section cr-shared-editor" aria-label="Conteúdo do relatório"><textarea data-field="text" hidden></textarea><div class="technical-report-editor" role="group" aria-label="Escrever relatório"></div><p class="cr-editor-status" role="status" aria-live="polite"></p></section>`;
    this.root.innerHTML = `<header class="relatorio-header-top cr-header"><img src="midia/logo-advancecheck.svg" alt="Advance Check"><button type="button" class="screen-close" data-action="back" aria-label="Fechar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></header>${info?`<h1 tabindex="-1">${info[1]}</h1><p class="cr-subtitle">${page==='free'?'Sinta-se à vontade para dar seu depoimento, anotar acontecimentos ou registrar imagens.':info[2]}</p>`:''}<div class="cr-body">${body}</div>${info?`<div class="${page==='free'?'relatorio-acoes cr-editor-actions':'cr-footer'}">${page==='free'?'<input class="cr-media-picker" type="file" accept="image/*" multiple hidden><input class="cr-camera-picker" type="file" accept="image/*" capture="environment" hidden><button type="button" class="report-add-media" aria-label="Adicionar imagem"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>':''}<button class="btn-checkin cr-primary" data-action="module-done">${this.reviewCheckout?'Fechar':page==='free'?'Salvar relato':'Salvar módulo'}</button></div>`:''}<p class="cr-status" role="status" aria-live="polite"></p>`;
    if (page === 'availability') { this.updateProductResults(); void this.loadProducts(); }
    if (page === 'free') this.mountEditor();
    if(this.reviewCheckout) {
      this.root.querySelectorAll('input,select,textarea,.report-add-media,.report-media-remove,[data-example-product]').forEach(control=>control.disabled=true);
      this.root.querySelectorAll('[contenteditable]').forEach(control=>control.contentEditable='false');
    }
    window.scrollTo(0,0);
  }
  renderCheckout(host) {
    const draft = this.drafts.get(this.key);
    const data = {...JSON.parse(this.saved.get(this.key)), feedback:draft.feedback, pending:draft.pending};
    host.innerHTML = `<section class="checkout-tipo-section"><h2>Visita comercial</h2>${this.rows(true)}</section><section class="checkout-relatorio-section"><label>Relatório livre</label><div class="checkout-relatorio-box cr-summary"><div class="cr-summary-text">${escape(data.text) || 'Nenhum relato registrado.'}</div><button type="button" class="cr-text-link" data-review-module="free" hidden>Ver mais</button></div></section><section class="checkout-tipo-section"><h2>Feedback</h2><div class="cr-options">${['Indicação do produto correto','Preparação ou aplicação','Argumentos de venda','Reclamação sobre o produto'].map(value=>`<label><input type="checkbox" data-checkout-feedback value="${value}" ${data.feedback.includes(value)?'checked':''}>${value}</label>`).join('')}</div></section><section class="checkout-tipo-section"><h2>Pendências</h2><div class="select-wrapper"><select class="input-box" data-checkout-pending><option value="">Selecione uma opção</option>${['Pedido ou entrega','Solicitação comercial','Reclamação ou atendimento técnico','Material de apoio','Treinamento','Outra'].map(value=>`<option ${data.pending===value?'selected':''}>${value}</option>`).join('')}</select></div></section>`;
    const summary = host.querySelector('.cr-summary-text');
    const more = host.querySelector('[data-review-module="free"]');
    const updateOverflow = () => { more.hidden = !summary.clientHeight || summary.scrollHeight <= summary.clientHeight + 1; };
    this.checkoutResizeObserver?.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      this.checkoutResizeObserver = new ResizeObserver(updateOverflow);
      this.checkoutResizeObserver.observe(summary);
    }
    updateOverflow();
    window.requestAnimationFrame?.(updateOverflow);
    document.fonts?.ready.then(updateOverflow);
    host.onclick = event => { const button=event.target.closest('[data-page],[data-review-module]'); if(button) this.reviewCallbacks.reviewModule?.(button.dataset.page || button.dataset.reviewModule); };
    host.onchange = event => { const input=event.target; if(input.matches('[data-checkout-feedback]')) draft.feedback=input.checked?[...draft.feedback,input.value]:draft.feedback.filter(value=>value!==input.value); if(input.matches('[data-checkout-pending]')) draft.pending=input.value; };
  }
  async loadProducts(refresh = false) {
    if (this.productLoading || (this.productLoaded && !refresh && Date.now() < this.productExpiresAt)) return;
    this.productLoading = true; this.productError = '';
    const generation = this.photoGeneration;
    this.updateProductResults();
    try {
      if (!this.reviewCallbacks.loadProducts) throw new Error('Catálogo indisponível nesta prévia.');
      const products = await this.reviewCallbacks.loadProducts({refresh});
      if (generation !== this.photoGeneration) return;
      this.productCatalog = products; this.productLoaded = true; this.productExpiresAt = Date.now() + 10 * 60 * 1000;
    } catch (error) {
      if (generation === this.photoGeneration) this.productError = error.code === 'permission-denied' ? 'Sua conta não tem permissão para acessar ou cadastrar o catálogo de produtos.' : 'Não foi possível carregar os produtos. Tente novamente.';
    } finally {
      if (generation === this.photoGeneration) { this.productLoading = false; this.updateProductResults(); }
    }
  }
  updateProductResults() {
    if (this.page !== 'availability' || this.reviewCheckout) return;
    for (const input of this.root.querySelectorAll('[data-product-search]')) {
      const key = input.dataset.productSearch;
      const results = this.root.querySelector('#cr-results-' + key);
      const query = this.productQueries[key] || '';
      const products = buscarProdutos(this.productCatalog, query, this.data.products[key]);
      const message = this.productLoading ? 'Carregando produtos...' : this.productError || (!this.productCatalog.length && this.productLoaded ? 'Nenhum produto cadastrado no catálogo.' : query.trim() && !products.length ? 'Nenhum produto encontrado.' : '');
      results.innerHTML = message ? `<p role="status">${escape(message)}</p>${this.productError?'<button type="button" data-retry-products>Tentar novamente</button>':''}` : products.map(product => `<button type="button" role="option" aria-selected="false" data-select-product="${escape(idProduto(product))}" data-product-question="${key}">${escape(nomeProduto(product))}</button>`).join('');
      input.setAttribute('aria-expanded', String(products.length > 0));
    }
  }
  mountEditor() {
    const input=this.root.querySelector('[data-field="text"]'); input.value=this.data.text;
    for (const block of this.data.blocks || []) { const local=this.staged.get(block.id); if(local && !mediaStore.local(block.id)) mediaStore.stage(block.id,local.file,local.thumbnail); }
    const editor = new TechnicalReportEditor(this.root.querySelector('.technical-report-editor'),input,this.root.querySelector('.report-add-media'),this.root.querySelector('.cr-media-picker'),this.root.querySelector('.cr-editor-status'),this.root.querySelector('.cr-camera-picker'));
    editor.reset({activityId:this.key,text:this.data.text,blocks:this.data.blocks,preserveLocal:true});
    this.editor=editor;
    input.addEventListener('input',()=>{
      this.data.text=input.value; this.data.blocks=structuredClone(editor.blocks);
      for (const block of editor.blocks) { const local=mediaStore.local(block.id); if(local) this.staged.set(block.id,local); }
    });
  }
  input(e) { if(e.target.dataset.productSearch) { this.productQueries[e.target.dataset.productSearch] = e.target.value; this.updateProductResults(); } if(e.target.dataset.field) this.data[e.target.dataset.field] = e.target.value; }
  async change(e) {
    const t = e.target;
    if(t.dataset.array) { const list=this.data[t.dataset.array]; this.data[t.dataset.array]=t.checked?[...list,t.value]:list.filter(v=>v!==t.value); if(t.value==='Outro') this.render(); }
    if(t.dataset.field && t.tagName!=='TEXTAREA') { this.data[t.dataset.field]=t.value; if(t.type==='radio') { if(t.dataset.field==='organization' && t.value==='Não foi verificado') { for(const photo of this.data.photos) this.releasePhoto(photo); this.data.photos=[]; } this.render(); } }
    if(t.dataset.upload) {
      if(this.photoBusy || this.data.organization==='Não foi verificado') return;
      const files=[...t.files]; const data=this.data; const generation=this.photoGeneration;
      if(data.photos.length+files.length>6) { t.value=''; this.status('Adicione no máximo seis fotografias.'); return; }
      this.photoBusy=true;
      this.root.querySelectorAll('input,select,button').forEach(control=>control.disabled=true);
      this.status('Comprimindo imagens...');
      let error='';
      try {
        for(const file of files) {
          const compressed=await this.compressPhoto(file);
          const thumbnail=await this.thumbnailPhoto(compressed.file);
          if(generation!==this.photoGeneration) return;
          const id=crypto.randomUUID(); mediaStore.stage(id,compressed.file,thumbnail); this.staged.set(id,mediaStore.local(id));
          data.photos.push({kind:'media',id,name:compressed.file.name,type:compressed.file.type,storage:'pending',size:compressed.file.size,originalSize:file.size});
        }
      } catch(e) { error=e.message || 'Não foi possível processar a imagem.'; }
      finally {
        if(generation===this.photoGeneration) { this.photoBusy=false; this.render(); if(error) this.status(error); }
      }
    }
  }

  exposureError() {
    if(!this.data.organization) return 'Selecione a organização dos produtos.';
    if(this.data.photos.length>6) return 'Adicione no máximo seis fotografias.';
    if(!['Organizada e visível','Não foi verificado'].includes(this.data.organization) && !this.data.photos.length) return 'Adicione pelo menos uma fotografia da exposição.';
    return 'Descreva o outro material.';
  }
  pendingCheckoutModules(key = this.key) {
    const snapshot = this.saved.get(key);
    if (!snapshot) return ['Relatório não salvo'];
    const data = JSON.parse(snapshot);
    return modules.filter(([module]) => module !== 'free' && !this.complete(module, data)).map(([, title]) => title);
  }

  status(text) { this.root.querySelector('.cr-status').textContent=text; }
  click(e) {
    const b=e.target.closest('button'); if(!b) return;
    if((this.saving || this.photoBusy || (this.page==='free' && this.editor?.busy)) && (b.dataset.action || b.dataset.page)) { this.status('Aguarde o processamento das imagens.'); return; }
    if(b.dataset.page) { this.page=b.dataset.page; this.render(); this.root.querySelector('h1')?.focus(); }
    if(b.dataset.retryProducts !== undefined) void this.loadProducts(true);
    if(b.dataset.selectProduct && !this.reviewCheckout) {
      const product = this.productCatalog.find(product => idProduto(product) === b.dataset.selectProduct);
      const key = b.dataset.productQuestion;
      if(product && !this.data.products[key].some(item => idProduto(item) === idProduto(product))) this.data.products[key].push({id:idProduto(product),title:nomeProduto(product)});
      this.productQueries[key] = ''; this.render();
    }
    if(b.dataset.removeProduct) { const [k,i]=b.dataset.removeProduct.split(':'); this.data.products[k].splice(Number(i),1); this.render(); }
    if(b.dataset.removeImage) { const [k,i]=b.dataset.removeImage.split(':'); this.releasePhoto(this.data[k][i]); this.data[k].splice(Number(i),1); this.render(); }
    if(this.reviewCheckout && (b.dataset.action==='back' || b.dataset.action==='module-done')) { this.reviewCallbacks.returnCheckout?.(); return; }
    if(b.dataset.action==='back') { if(this.page!=='overview') { this.page='overview'; this.render(); } else this.onClose(); }
    if(b.dataset.action==='module-done') { this.page='overview'; this.render(); }
    if(b.dataset.action==='save') { if(this.reviewCallbacks?.persist) return this.savePersisted(); const snapshot=JSON.stringify(this.data); if(snapshot!==this.saved.get(this.key)) { const revisions=this.revisions.get(this.key) || []; revisions.push({salvoEm:new Date()}); this.revisions.set(this.key,revisions); } this.saved.set(this.key,snapshot); this.onSave(this.key); }
  }
}
