// Edge Function para busca no DuckDuckGo (gratuito, sem API key)
// Alternativa ao Google Search que não requer configuração

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Extrai a query do body
    const requestBody = await req.json();
    const { query, num = 5 } = requestBody;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Query de busca inválida ou vazia' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Buscando no DuckDuckGo: "${query}"`);

    // DuckDuckGo Instant Answer API (gratuita, sem API key)
    // Usa DuckDuckGo HTML para extrair resultados
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Erro ao buscar: ${response.status}`);
    }

    const html = await response.text();
    
    // Extrair resultados do HTML (parsing simples)
    const results: any[] = [];
    const resultRegex = /<a class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
    const snippetRegex = /<a class="result__snippet"[^>]*>([^<]*)<\/a>/g;
    
    let match;
    const links: string[] = [];
    const titles: string[] = [];
    const snippets: string[] = [];
    
    // Extrair links e títulos
    while ((match = resultRegex.exec(html)) !== null && results.length < num) {
      links.push(match[1]);
      titles.push(match[2]);
    }
    
    // Extrair snippets
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < num) {
      snippets.push(match[1]);
    }
    
    // Combinar resultados
    for (let i = 0; i < Math.min(links.length, num); i++) {
      if (links[i] && titles[i]) {
        results.push({
          title: titles[i].trim(),
          link: links[i],
          snippet: snippets[i]?.trim() || '',
          displayLink: new URL(links[i]).hostname.replace('www.', ''),
        });
      }
    }

    // Se não conseguir extrair do HTML, usar DuckDuckGo Instant Answer API como fallback
    if (results.length === 0) {
      try {
        const instantUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const instantResponse = await fetch(instantUrl);
        const instantData = await instantResponse.json();
        
        if (instantData.AbstractText) {
          results.push({
            title: instantData.Heading || query,
            link: instantData.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
            snippet: instantData.AbstractText,
            displayLink: instantData.AbstractURL ? new URL(instantData.AbstractURL).hostname : 'duckduckgo.com',
          });
        }
      } catch (e) {
        console.warn('Erro ao usar Instant Answer API:', e);
      }
    }

    return new Response(
      JSON.stringify({ 
        results,
        source: 'duckduckgo'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Erro inesperado na Edge Function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao buscar na web',
        message: error.message,
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

