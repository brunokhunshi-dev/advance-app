import { TechnicalReportEditor, mediaStore } from '../../technical-report-editor.js';
// Front-end prototype: drafts and image previews live only in this tab's memory.
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
  constructor(host, onClose = () => {}, onSave = () => {}) {
    this.host = host; this.onClose = onClose; this.onSave = onSave; this.revisions = new Map(); this.staged = new Map(); this.drafts = new Map(); this.saved = new Map(); this.initial = new Map();
    this.root = document.createElement('section'); this.root.className = 'commercial-report'; this.root.hidden = true; host.append(this.root);
    this.root.addEventListener('click', e => this.click(e));
    this.root.addEventListener('input', e => this.input(e));
    this.root.addEventListener('change', e => this.change(e));
    window.addEventListener('beforeunload', e => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } });
  }
  get dirty() { return this.active && JSON.stringify(this.data) !== (this.saved.get(this.key) || this.initial.get(this.key)); }
  savedReport(key) { const snapshot=this.saved.get(key); if(!snapshot) return null; const data=JSON.parse(snapshot); return {textoAtual:data.text, conteudoRelatorio:{versao:1,blocos:data.blocks || []}, historico:this.revisions.get(key) || [], atualizadoEm:this.revisions.get(key)?.at(-1)?.salvoEm}; }
  hasSaved(key) { return this.saved.has(key); }
  open(context, page = 'overview') {
    this.key = context.id; this.context = context;
    if (!this.drafts.has(this.key)) { const data = {...blank(), text:context.text || ''}; this.drafts.set(this.key, data); this.initial.set(this.key, JSON.stringify(data)); }
    this.data = this.drafts.get(this.key); this.active = true; this.page = page;
    this.host.classList.add('commercial-mode'); this.root.hidden = false; this.render();
  }
  clear() {
    if (this.editor) this.editor.generation = (this.editor.generation || 0) + 1;
    for (const data of this.drafts.values()) for (const key of ['photos','attachments']) for (const photo of data[key]) URL.revokeObjectURL(photo.url);
    for (const id of this.staged.keys()) mediaStore.clearLocal(id); this.staged.clear();
    this.drafts.clear(); this.saved.clear(); this.initial.clear(); this.revisions.clear(); this.deactivate();
  }
  backModule() { if(this.page==='free' && this.editor?.busy) { this.status('Aguarde o processamento das imagens.'); return true; } if (!this.active || this.page === 'overview') return false; this.page = 'overview'; this.render(); return true; }
  deactivate() { this.active = false; this.host.classList.remove('commercial-mode'); this.root.hidden = true; }
  complete(key) {
    if(key === 'contact') return !!(this.data.name.trim() && this.data.role && this.data.goal);
    if(key === 'availability') return questions.every(([k]) => this.data[k] && (this.data[k] !== 'Sim' || this.data.products[k].length));
    if(key === 'exposure') return !!this.data.organization && (!this.data.materials.includes('Outro') || this.data.other.trim());
    return !!(this.data.text.trim() || this.data.blocks?.some(block=>block.kind==='media'));
  }
  field(label, key, placeholder) { return `<label class="cr-field">${label}<input data-field="${key}" value="${escape(this.data[key])}" placeholder="${placeholder}" maxlength="180"></label>`; }
  select(label,key,options) { return `<label class="cr-field">${label}<select data-field="${key}"><option value="">Selecione uma opção</option>${options.map(o=>`<option ${this.data[key]===o?'selected':''}>${o}</option>`).join('')}</select></label>`; }
  radios(key,options) { return `<div class="cr-options">${options.map(o=>`<label><input type="radio" name="cr-${key}" data-field="${key}" value="${o}" ${this.data[key]===o?'checked':''}>${o}</label>`).join('')}</div>`; }
  rows(readOnly = false) { return `<div class="cr-modules">${modules.filter(([k])=>!readOnly || k!=='free').map(([k,title,desc])=>`<button type="button" class="cr-module" data-page="${k}" ${readOnly?'data-review="true"':''}><span><strong>${title}${k==='contact'?'<small class="cr-required">(Obrigatório)</small>':''}</strong><span>${desc}</span><small class="cr-progress">${this.complete(k)?'Preenchido':'Não preenchido'}</small></span><span class="cr-chevron" aria-hidden="true">›</span></button>`).join('')}</div>`; }
  previews(key) { return `<div class="cr-photo-previews">${this.data[key].map((p,i)=>`<figure class="report-media-block"><button type="button" class="report-media-open" data-image="${key}:${i}" aria-label="Ampliar ${escape(p.name)}"><img src="${p.url}" alt="${escape(p.name)}"></button><button type="button" class="report-media-remove" data-remove-image="${key}:${i}" aria-label="Remover ${escape(p.name)}">×</button></figure>`).join('')}</div>`; }
  render() {
    const page = this.page; const info = modules.find(([k])=>k===page);
    let body = '';
    if(page==='overview') body = `<h1>Visita comercial - ${escape(this.context.client)}</h1><p class="cr-code">${escape(this.context.code || '')}</p><label class="cr-field">Chegada<div class="cr-pills"><span>${escape(this.context.date)}</span><span>${escape(this.context.time)}</span></div></label><label class="cr-field">Cliente<div class="cr-pill">${escape(this.context.client)}</div></label>${this.rows()}<div class="cr-footer"><button class="btn-checkin cr-primary" data-action="save">Salvar relatório</button></div>`;
    if(page==='contact') body = this.field('Nome','name','Quem te recebeu?') + this.select('Cargo do responsável','role',['Proprietário(a)','Gerente','Comprador(a)','Vendedor(a)','Outro']) + this.select('Objetivo principal','goal',['Relacionamento','Apresentação de produtos','Reposição de estoque','Prospecção','Acompanhamento comercial','Outro']);
    if(page==='availability') body = questions.map(([k,title])=>`<fieldset><legend>${title}</legend>${this.radios(k,['Sim','Não'])}${this.data[k]==='Sim'?`<div class="cr-products">${this.data.products[k].map((p,i)=>`<button type="button" data-remove-product="${k}:${i}" aria-label="Remover ${escape(p)}">${escape(p)} <span>×</span></button>`).join('')}<form data-product="${k}"><input aria-label="Nome do produto em ${title}" placeholder="Buscar ou digitar produto" maxlength="100"><button type="submit" aria-label="Adicionar produto">+</button></form></div><small>Digite o nome e toque em + para adicionar.</small>`:''}</fieldset>`).join('');
    if(page==='exposure') body = `<fieldset><legend>Organização dos produtos</legend>${this.radios('organization',['Organizada e visível','Necessidade de organização','Ausência de exposição','Não foi verificado'])}</fieldset><label class="cr-photo"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 5l2-2h4l2 2h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><circle cx="12" cy="12" r="4"/></svg>Adicione uma fotografia.<input type="file" accept="image/*" data-upload="photos" hidden></label>${this.previews('photos')}<fieldset><legend>Necessidade de reposição ou ausência</legend><div class="cr-options">${materials.map(o=>`<label><input type="checkbox" data-array="materials" value="${o}" ${this.data.materials.includes(o)?'checked':''}>${o}</label>`).join('')}</div>${this.data.materials.includes('Outro')?this.field('Qual material?','other','Descreva o material'):''}</fieldset>`;
    if(page==='free') body = `<section class="relatorio-editor-section cr-shared-editor" aria-label="Conteúdo do relatório"><textarea data-field="text" hidden></textarea><div class="technical-report-editor" role="group" aria-label="Escrever relatório"></div><p class="cr-editor-status" role="status" aria-live="polite"></p></section>`;
    this.root.innerHTML = `<header class="relatorio-header-top cr-header"><img src="midia/logo-advancecheck.svg" alt="Advance Check"><button type="button" data-action="back" aria-label="${page==='overview'?'Fechar relatório':'Voltar'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14l-4-4 4-4"></path><path d="M5 10h11a4 4 0 1 1 0 8h-1"></path></svg></button></header>${info?`<h1 tabindex="-1">${info[1]}</h1><p class="cr-subtitle">${page==='free'?'Sinta-se à vontade para dar seu depoimento, anotar acontecimentos ou registrar imagens.':info[2]}</p>`:''}<div class="cr-body">${body}</div>${info?`<div class="${page==='free'?'relatorio-acoes cr-editor-actions':'cr-footer'}">${page==='free'?'<input class="cr-media-picker" type="file" accept="image/*" multiple hidden><input class="cr-camera-picker" type="file" accept="image/*" capture="environment" hidden><button type="button" class="report-add-media" aria-label="Adicionar imagem"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>':''}<button class="btn-checkin cr-primary" data-action="module-done">${page==='free'?'Salvar relato':'Concluir módulo'}</button></div>`:''}<p class="cr-status" role="status" aria-live="polite"></p>`;
    this.root.querySelectorAll('form[data-product]').forEach(form=>form.addEventListener('submit',e=>{ e.preventDefault(); const value=form.querySelector('input').value.trim(); const list=this.data.products[form.dataset.product]; if(value && !list.some(p=>p.toLocaleLowerCase()===value.toLocaleLowerCase())) list.push(value); this.render(); }));
    if (page === 'free') this.mountEditor();
    window.scrollTo(0,0);
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
  input(e) { if(e.target.dataset.field) this.data[e.target.dataset.field] = e.target.value; }
  async change(e) {
    const t = e.target;
    if(t.dataset.array) { const list=this.data[t.dataset.array]; this.data[t.dataset.array]=t.checked?[...list,t.value]:list.filter(v=>v!==t.value); if(t.value==='Outro') this.render(); }
    if(t.dataset.field && t.tagName!=='TEXTAREA') { this.data[t.dataset.field]=t.value; if(t.type==='radio') this.render(); }
    if(t.dataset.upload) {
      const key=this.key; const data=this.data; const group=t.dataset.upload;
      for(const file of t.files) {
        if(!file.type.startsWith('image/') || file.size>10*1024*1024) { this.status('Escolha imagens de até 10 MB.'); continue; }
        const url=URL.createObjectURL(file); data[group].push({name:file.name,url});
      }
      if(key===this.key) this.render();
    }
  }
  validate() {
    if (!this.complete('contact')) { this.page='contact'; this.render(); this.status('Preencha nome, cargo e objetivo principal para salvar.'); return false; }
    if (questions.some(([k])=>this.data[k]==='Sim' && !this.data.products[k].length)) { this.page='availability'; this.render(); this.status('Informe os produtos para cada resposta Sim.'); return false; }
    if (this.data.materials.includes('Outro') && !this.data.other.trim()) { this.page='exposure'; this.render(); this.status('Descreva o outro material.'); return false; }
    return true;
  }
  status(text) { this.root.querySelector('.cr-status').textContent=text; }
  click(e) {
    const b=e.target.closest('button'); if(!b) return;
    if(this.page==='free' && this.editor?.busy && (b.dataset.action || b.dataset.page)) { this.status('Aguarde o processamento das imagens.'); return; }
    if(b.dataset.page) { this.page=b.dataset.page; this.render(); this.root.querySelector('h1')?.focus(); }
    if(b.dataset.removeProduct) { const [k,i]=b.dataset.removeProduct.split(':'); this.data.products[k].splice(Number(i),1); this.render(); }
    if(b.dataset.removeImage) { const [k,i]=b.dataset.removeImage.split(':'); URL.revokeObjectURL(this.data[k][i].url); this.data[k].splice(Number(i),1); this.render(); }
    if(b.dataset.image) { const [k,i]=b.dataset.image.split(':'); const p=this.data[k][i]; const dialog=document.createElement('dialog'); dialog.className='cr-dialog'; dialog.innerHTML=`<button aria-label="Fechar imagem">×</button><img src="${p.url}" alt="${escape(p.name)}">`; dialog.querySelector('button').onclick=()=>dialog.close(); dialog.addEventListener('close',()=>dialog.remove()); this.root.append(dialog); dialog.showModal(); }
    if(b.dataset.action==='back') { if(this.page!=='overview') { this.page='overview'; this.render(); } else this.onClose(); }
    if(b.dataset.action==='module-done') { if(this.page==='contact' && !this.complete('contact')) { this.status('Preencha nome, cargo e objetivo principal.'); return; } if(this.page==='availability' && !this.complete('availability')) { this.status('Responda às três perguntas e informe os produtos para cada resposta Sim.'); return; } this.page='overview'; this.render(); }
    if(b.dataset.action==='save') { if(!this.validate()) return; const snapshot=JSON.stringify(this.data); if(snapshot!==this.saved.get(this.key)) { const revisions=this.revisions.get(this.key) || []; revisions.push({salvoEm:new Date()}); this.revisions.set(this.key,revisions); } this.saved.set(this.key,snapshot); this.onSave(this.key); }
  }
}
