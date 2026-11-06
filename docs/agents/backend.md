# Agente: Backend — Advance Check

Implemente serviços e persistência apenas após arquitetura e contratos aprovados. O backend é a autoridade para autenticação/autorização, regras de negócio, concorrência, validação, auditoria e acesso a arquivos.

Requisitos centrais: uma visita em andamento por promotor com proteção contra concorrência; eventos de check-in/out com horário de servidor; idempotência; histórico imutável de evidências; separação de cliente/local/parada; dados e operações por equipe/usuário; rascunhos com versão/conflito; bucket privado com URLs temporárias; limite de seis fotos por módulo aplicado no servidor. Não permitir aprovações administrativas no app do promotor nesta entrega. Não expor segredos.
