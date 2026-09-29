// Exportador de schema do Advance Check.
// Este arquivo não acessa nem exporta documentos do Firebase.
// O schema abaixo descreve a estrutura usada pelo aplicativo.

const ADVANCE_SCHEMA = {
    schemaVersion: "1.0",
    database: "Cloud Firestore",
    generatedBy: "Advance Check",
    notes: [
        "Este arquivo contém apenas a estrutura dos dados.",
        "Nenhum valor real dos documentos do Firebase é consultado ou exportado.",
        "Campos condicionais aparecem com a propriedade 'condicional'."
    ],
    collections: {
        assistencia: {
            documentId: "string",
            fields: {
                email: { type: "string", required: true, usage: "autenticação/perfil" },
                nome: { type: "string", required: false, usage: "perfil do profissional" }
            }
        },

        promotores: {
            documentId: "string",
            fields: {
                email: { type: "string", required: true, usage: "autenticação/perfil" },
                nome: { type: "string", required: false, usage: "perfil do profissional" }
            }
        },

        clientes: {
            documentId: "string",
            fields: {
                codigoCnpj: { type: "string | null", required: false, usage: "identificação por CNPJ" },
                nome: { type: "string", required: true },
                cidade: { type: "string", required: true },
                uf: { type: "string", required: true },
                enderecoCompleto: { type: "string", required: true },
                lat: { type: "number", required: true },
                lng: { type: "number", required: true },
                status: { type: "string", required: true, enum: ["Ativo", "Provisorio"] },
                criadoEm: { type: "timestamp", required: true },
                atualizadoEm: { type: "timestamp", required: true },
                criadoPor: { type: "string", required: false, conditional: "cadastro sem CNPJ" }
            }
        },

        atividades: {
            documentId: "string",
            fields: {
                tipo: { type: "string", required: true },
                data: { type: "timestamp", required: true },
                ptvId: { type: "string", required: true },
                clienteId: { type: "string", required: true },
                tipoVisita: { type: "string", required: true, enum: ["Visita comercial", "Treinamento", "Assistência técnica"] },
                nota: { type: "string", required: false },
                status: { type: "string", required: true, enum: ["Pendente", "Em andamento", "Concluída"] },
                criadoEm: { type: "timestamp", required: true },
                atualizadoEm: { type: "timestamp", required: true },
                checkinDataHora: { type: "timestamp", required: false, conditional: "após check-in" },
                checkinGps: { type: "string", required: false, conditional: "após check-in" },
                checkinGpsAccuracy: { type: "number", required: false, conditional: "após check-in" },
                checkinEndereco: { type: "string", required: false, conditional: "após check-in" },
                relatorioId: { type: "string", required: false, conditional: "após criação do relatório" },
                checkoutDataHora: { type: "timestamp", required: false, conditional: "após check-out ou fechamento manual" },
                checkoutGps: { type: "string", required: false, conditional: "após check-out validado" },
                checkoutGpsAccuracy: { type: "number", required: false, conditional: "após check-out validado" },
                checkoutEndereco: { type: "string", required: false, conditional: "após check-out validado" },
                objetivo: {
                    type: "string",
                    required: false,
                    conditional: "tipoVisita = Visita comercial"
                },
                oportunidadeIdentificada: {
                    type: "string",
                    required: false,
                    conditional: "tipoVisita = Visita comercial",
                    enum: ["Sim", "Não"]
                },
                categoriaTreinamento: {
                    type: "string",
                    required: false,
                    conditional: "tipoVisita = Treinamento"
                },
                quantidadeParticipantes: {
                    type: "number",
                    required: false,
                    conditional: "tipoVisita = Treinamento"
                },
                publicoAtendido: {
                    type: "string",
                    required: false,
                    conditional: "tipoVisita = Treinamento"
                },
                resultadoAssistencia: {
                    type: "string",
                    required: false,
                    conditional: "tipoVisita = Assistência técnica após check-out",
                    enum: ["Resolvido", "Acompanhar", "Nova visita", "Aguardando cliente"]
                },
                proximoPassoAssistencia: {
                    type: "string",
                    required: false,
                    conditional: "tipoVisita = Assistência técnica após check-out"
                },
                resultado: {
                    type: "string",
                    required: false,
                    conditional: "fechamento manual"
                },
                fechamentoTipo: {
                    type: "string",
                    required: false,
                    conditional: "fechamento manual",
                    enum: ["Manual"]
                },
                fechamentoAnaliseStatus: {
                    type: "string",
                    required: false,
                    conditional: "fechamento manual",
                    enum: ["Pendente de análise"]
                },
                motivoFechamentoManual: {
                    type: "string",
                    required: false,
                    conditional: "fechamento manual"
                },
                fechamentoSolicitadoEm: {
                    type: "timestamp",
                    required: false,
                    conditional: "fechamento manual"
                },
                fechamentoSolicitadoPor: {
                    type: "string",
                    required: false,
                    conditional: "fechamento manual"
                }
            }
        },

        relatorios: {
            documentId: "string",
            fields: {
                id: { type: "string", required: true },
                atividadeId: { type: "string", required: true },
                clienteId: { type: "string", required: true },
                ptvId: { type: "string", required: true },
                codigo: { type: "string", required: true },
                textoAtual: { type: "string", required: true },
                historico: {
                    type: "array<object>",
                    required: true,
                    items: {
                        texto: { type: "string", required: true },
                        salvoEm: { type: "timestamp", required: true }
                    }
                },
                criadoEm: { type: "timestamp", required: true },
                atualizadoEm: { type: "timestamp", required: true },
                tipoVisita: { type: "string", required: false, conditional: "após check-out", enum: ["Visita comercial", "Treinamento", "Assistência técnica"] },
                checkoutDataHora: { type: "timestamp", required: false, conditional: "após check-out ou fechamento manual" },
                checkoutGps: { type: "string", required: false, conditional: "após check-out validado" },
                checkoutGpsAccuracy: { type: "number", required: false, conditional: "após check-out validado" },
                checkoutEndereco: { type: "string", required: false, conditional: "após check-out validado" },
                objetivo: { type: "string", required: false, conditional: "visita comercial após check-out" },
                oportunidadeIdentificada: { type: "string", required: false, conditional: "visita comercial após check-out", enum: ["Sim", "Não"] },
                categoriaTreinamento: { type: "string", required: false, conditional: "treinamento após check-out" },
                quantidadeParticipantes: { type: "number", required: false, conditional: "treinamento após check-out" },
                publicoAtendido: { type: "string", required: false, conditional: "treinamento após check-out" },
                assistenciaTecnica: {
                    type: "object",
                    required: false,
                    conditional: "tipoVisita = Assistência técnica",
                    fields: {
                        clienteFinal: { type: "string", required: false },
                        contato: { type: "string", required: false },
                        setor: { type: "string", required: false },
                        enderecoAplicacao: { type: "string", required: false },
                        empresaAplicacao: { type: "string", required: false },
                        responsavelEmpresa: { type: "string", required: false },
                        acompanhadoPor: { type: "string", required: false },
                        superficie: { type: "string", required: false },
                        dataAplicacao: { type: "string", required: false },
                        houveEspecificacao: { type: "string", required: false, enum: ["Sim", "Não"] },
                        numeroEspecificacao: { type: "string", required: false },
                        produto: { type: "string", required: false },
                        lote: { type: "string", required: false },
                        cor: { type: "string", required: false },
                        queixa: { type: "string", required: false },
                        esquemaPintura: { type: "string", required: false },
                        preparoSuperficie: { type: "string", required: false },
                        metodosLimpeza: { type: "array<string>", required: false },
                        impactoClimatico: { type: "string", required: false, enum: ["Sim", "Não"] },
                        impactoClimaticoDetalhe: { type: "string", required: false },
                        ferramentasAplicacao: { type: "array<string>", required: false },
                        itensVerificados: { type: "array<string>", required: false },
                        umidade: { type: "string", required: false },
                        umidadeReferencia: { type: "string", required: false },
                        constatacoes: { type: "string", required: false },
                        fotosSelecionadas: { type: "array<object>", required: false, note: "Metadados locais; armazenamento dos arquivos depende de serviço externo." },
                        acoesDefinidas: { type: "string", required: false, conditional: "checkout" },
                        conclusaoTecnica: { type: "string", required: false, conditional: "checkout" },
                        resultado: { type: "string", required: false, conditional: "checkout", enum: ["Resolvido", "Acompanhar", "Nova visita", "Aguardando cliente"] },
                        proximoPasso: { type: "string", required: false, conditional: "checkout" }
                    }
                },
                resultado: { type: "string", required: false, conditional: "fechamento manual" },
                fechamentoTipo: { type: "string", required: false, conditional: "fechamento manual", enum: ["Manual"] },
                fechamentoAnaliseStatus: { type: "string", required: false, conditional: "fechamento manual", enum: ["Pendente de análise"] },
                motivoFechamentoManual: { type: "string", required: false, conditional: "fechamento manual" },
                fechamentoSolicitadoEm: { type: "timestamp", required: false, conditional: "fechamento manual" },
                fechamentoSolicitadoPor: { type: "string", required: false, conditional: "fechamento manual" }
            }
        },

        atividades_excluidas: {
            documentId: "string",
            fields: {
                ...{}, 
                excluidoEm: { type: "timestamp", required: true },
                excluidoPor: { type: "string", required: true },
                note: "Os demais campos são uma cópia do documento correspondente da coleção 'atividades'."
            }
        }
    }
};

function baixarSchemaAdvance() {
    const schema = {
        ...ADVANCE_SCHEMA,
        exportedAt: new Date().toISOString()
    };

    const blob = new Blob(
        [JSON.stringify(schema, null, 2)],
        { type: "application/json;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "advance-check-schema.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    if (typeof window.mostrarAlerta === "function") {
        window.mostrarAlerta(
            "Schema exportado",
            "O arquivo advance-check-schema.json foi gerado sem consultar ou exportar dados reais do Firebase."
        );
    }
}

function inicializarExportadorSchema() {
    const botao = document.getElementById("btn-exportar-schema");
    if (!botao || botao.dataset.schemaReady === "true") return;

    botao.dataset.schemaReady = "true";
    botao.addEventListener("click", baixarSchemaAdvance);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarExportadorSchema, { once: true });
} else {
    inicializarExportadorSchema();
}
