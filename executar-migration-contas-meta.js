#!/usr/bin/env node

/**
 * Script para executar a migration de criação da tabela cliente_meta_accounts
 * 
 * USO:
 * 1. Certifique-se de ter a service_role key do Supabase
 * 2. Execute: node executar-migration-contas-meta.js
 * 
 * OU execute diretamente no Supabase SQL Editor:
 * - Copie o conteúdo de EXECUTAR_MIGRATION_CONTAS_META.sql
 * - Cole no SQL Editor do Supabase Dashboard
 * - Execute
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lê o arquivo SQL
const sqlFile = path.join(__dirname, 'EXECUTAR_MIGRATION_CONTAS_META.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');

console.log('📋 Script de Migration: cliente_meta_accounts');
console.log('==============================================\n');

console.log('⚠️  ATENÇÃO:');
console.log('Para executar este script, você precisa:');
console.log('1. Acessar o Supabase Dashboard');
console.log('2. Ir em SQL Editor');
console.log('3. Copiar o conteúdo do arquivo: EXECUTAR_MIGRATION_CONTAS_META.sql');
console.log('4. Colar e executar\n');

console.log('📄 Conteúdo do SQL (primeiras 10 linhas):');
console.log('----------------------------------------');
const lines = sql.split('\n').slice(0, 10);
lines.forEach(line => console.log(line));
console.log('...\n');

console.log('✅ Arquivo SQL criado em: EXECUTAR_MIGRATION_CONTAS_META.sql');
console.log('📝 Execute no Supabase SQL Editor para criar a tabela.\n');

