import test from 'node:test';
import assert from 'node:assert/strict';
import { CommercialReport } from '../src/ui/commercial-report.js';

test('erro na navegação depois do commit não informa que salvar falhou', async () => {
    const messages = [];
    let committed = 0;
    const controls = [];
    const controller = Object.assign(Object.create(CommercialReport.prototype), {
        key: 'visita-1',
        data: {name:'Contato',text:'Observação',photos:[],blocks:[]},
        dataField: 'dadosComerciais',
        saving: false,
        photoGeneration: 0,
        drafts: new Map(),
        saved: new Map(),
        initial: new Map(),
        revisions: new Map(),
        staged: new Map(),
        baseReports: new Map([['visita-1',null]]),
        reviewCallbacks: {
            persist: async () => {
                committed++;
                return {id:'r1',textoAtual:'Observação',dadosComerciais:{versao:1,name:'Contato',photos:[],blocks:[]}};
            },
            removeBackup: async () => {}
        },
        root: { querySelectorAll: () => controls },
        status: message => messages.push(message),
        onSave: () => { throw new Error('Falha na navegação'); }
    });
    await controller.savePersisted();
    assert.equal(committed, 1);
    assert.equal(controller.hasSaved('visita-1'), true);
    assert.match(messages.at(-1), /Relatório salvo no servidor/);
    assert.equal(controller.saving, false);
});
