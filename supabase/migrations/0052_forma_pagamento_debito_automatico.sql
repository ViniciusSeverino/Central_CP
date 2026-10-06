-- supabase/migrations/0052_forma_pagamento_debito_automatico.sql
--
-- Nova forma de pagamento "Débito automático" (pedido do dono do produto):
-- o valor cai sozinho na conta, então não pede conta bancária do
-- fornecedor nem comprovante -- só a nota fiscal (ver
-- documentos_obrigatorios.js e renderContaBancariaArea em ui_nota.js). No
-- nome do arquivo final a sigla é DDA (ver SIGLA_FORMA_PAGAMENTO em
-- anexos_pdf.js).
alter type forma_pagamento_tipo add value if not exists 'Débito automático';
