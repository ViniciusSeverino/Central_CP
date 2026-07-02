// src/js/supabaseClient.js
//
// Versão travada de propósito (mesma que package.json/package-lock.json
// resolvem pros scripts locais) — sem isso, o esm.sh serve sempre a
// última 2.x.x disponível a qualquer momento, e uma atualização de
// terceiros poderia mudar o comportamento do app em produção sem
// nenhuma mudança de código nossa. Atualize aqui deliberadamente.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
