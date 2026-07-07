// supabase/functions/alerta-armazenamento/index.ts
//
// Disparada periodicamente por um job do pg_cron (ver migration 0021,
// a cada 6 horas) -- confere o uso do banco de dados e do Storage contra
// os limites do plano gratuito do Supabase (500 MB banco / 1 GB Storage)
// e manda um e-mail de aviso pra administrador/gerente_financeiro quando
// cruza um novo patamar (70/85/95%). Não repete o aviso do mesmo patamar
// dentro de 7 dias, pra não virar spam enquanto o uso ficar parado no
// mesmo nível.
//
// Precisa do secret RESEND_API_KEY configurado no projeto (Project
// Settings → Edge Functions → Secrets) -- sem ele, a função só reporta o
// uso (não manda e-mail), mesmo comportamento de notificar-movimentacao.
// Sem domínio próprio verificado no Resend, RESEND_FROM pode ficar sem
// configurar -- cai no domínio de teste do Resend (onboarding@resend.dev),
// que não exige DNS nenhum.
//
// ?dry_run=true devolve a análise (percentuais, patamar cruzado) sem
// mandar e-mail nem gravar em alerta_armazenamento_historico -- útil pra
// testar sem disparar um e-mail de verdade pra administrador/gerente
// financeiro.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const LIMITE_BANCO_BYTES = 500 * 1024 * 1024;
const LIMITE_STORAGE_BYTES = 1024 * 1024 * 1024;
const PATAMARES = [95, 85, 70]; // do mais alto pro mais baixo -- pega o maior patamar já cruzado
const DIAS_SEM_REPETIR = 7;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === 'true';

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const appUrl = Deno.env.get('APP_URL') || '';
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: stats, error: statsError } = await admin.rpc('stats_armazenamento_service');
  if (statsError || !stats || !stats[0]) {
    return json({ ok: false, error: statsError?.message || 'stats_armazenamento_service sem retorno' }, 500);
  }

  const { banco_bytes, storage_bytes } = stats[0];
  const bancoPct = (Number(banco_bytes) / LIMITE_BANCO_BYTES) * 100;
  const storagePct = (Number(storage_bytes) / LIMITE_STORAGE_BYTES) * 100;
  const maiorPct = Math.max(bancoPct, storagePct);
  const origemMaior = storagePct >= bancoPct ? 'Storage (anexos)' : 'banco de dados';

  const patamarCruzado = PATAMARES.find((p) => maiorPct >= p);
  const analise = { bancoPct: Number(bancoPct.toFixed(1)), storagePct: Number(storagePct.toFixed(1)), origemMaior, patamarCruzado: patamarCruzado || null };

  if (!patamarCruzado) return json({ ok: true, skip: 'uso abaixo de 70%', ...analise });
  if (dryRun) return json({ ok: true, dry_run: true, ...analise });

  const { data: recente } = await admin
    .from('alerta_armazenamento_historico')
    .select('id')
    .gte('patamar', patamarCruzado)
    .gte('enviado_em', new Date(Date.now() - DIAS_SEM_REPETIR * 86400000).toISOString())
    .limit(1);
  if (recente && recente.length > 0) return json({ ok: true, skip: `alerta do patamar ${patamarCruzado}% (ou maior) já enviado nos últimos ${DIAS_SEM_REPETIR} dias`, ...analise });

  const { data: destinatariosData } = await admin.from('usuarios').select('email, ativo').in('role', ['administrador', 'gerente_financeiro']);
  const destinatarios = (destinatariosData || []).filter((u: any) => u.ativo && u.email).map((u: any) => u.email);

  // Registra o envio ANTES de chamar o Resend -- evita reenviar em loop
  // se o e-mail falhar e o cron rodar de novo antes do próximo intervalo
  // de 6h (o patamar continua o mesmo, então não há problema em já ter
  // marcado como avisado mesmo que a entrega em si tenha dado erro).
  await admin.from('alerta_armazenamento_historico').insert({ patamar: patamarCruzado });

  if (destinatarios.length === 0) return json({ ok: true, skip: 'sem destinatário com e-mail cadastrado', ...analise });
  if (!resendKey) return json({ ok: false, skip: 'RESEND_API_KEY não configurada — alerta desligado por enquanto', ...analise });

  const assunto = `Central CP — uso do plano gratuito Supabase passou de ${patamarCruzado}%`;
  const html = `
    <p>O uso do <strong>${origemMaior}</strong> do Central CP passou de <strong>${patamarCruzado}%</strong> do limite do plano gratuito do Supabase.</p>
    <ul>
      <li>Banco de dados: ${analise.bancoPct}% (limite 500 MB)</li>
      <li>Storage (anexos): ${analise.storagePct}% (limite 1 GB)</li>
    </ul>
    <p>Vale considerar arquivar anexos pendentes (Cadastros → Arquivos) e/ou o upgrade de plano.</p>
    ${appUrl ? `<p><a href="${appUrl}">Abrir no Central CP</a></p>` : ''}
  `;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM') || 'Central CP <onboarding@resend.dev>',
      to: destinatarios,
      subject: assunto,
      html,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('Resend falhou:', resp.status, errText);
    return json({ ok: false, error: errText, ...analise });
  }

  return json({ ok: true, destinatarios: destinatarios.length, ...analise });
});
