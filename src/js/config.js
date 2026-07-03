// src/js/config.js
//
// Preencha com os dados do seu projeto Supabase (Project Settings → API).
// A "anon key" é pública por design — quem protege os dados é o RLS
// (ver supabase/migrations/), não o segredo dessa chave. Por isso é seguro
// deixá-la aqui no código do frontend.
//
// NUNCA coloque a "service_role key" aqui — essa é só para o script de
// importação (supabase/seed.mjs), que roda no seu computador, não no navegador.

export const SUPABASE_URL = 'https://ofzqboxmlfogstpjaxdq.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9menFib3htbGZvZ3N0cGpheGRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNjY4MTUsImV4cCI6MjA5Nzc0MjgxNX0.li2PLlz0eE68WhenrX4DE5WhZR4tw814VOgHRD2PF2w';

// Limite de alçada: notas com valor_bruto acima disto precisam de
// aprovação do gerente financeiro. Igual ou abaixo, vão direto pro
// contas a pagar.
export const LIMITE_APROVACAO_GESTOR = 5000;

export const SETORES = ['Marketing', 'Operações', 'Financeiro'];
