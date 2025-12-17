import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get request body
    const { action, ...body } = await req.json();

    // Get Meta token - Priority: Environment Variable > Vault RPC
    let metaToken: string | null = null;
    
    // Priority 1: Try environment variable first (Edge Function secret)
    metaToken = Deno.env.get("META_SYSTEM_USER_ACCESS_TOKEN") ?? null;
    
    if (metaToken) {
      console.log("✅ Meta token found in environment variable");
    } else {
      // Priority 2: Try to get from Vault via RPC function
      try {
        const { data: tokenData, error: tokenError } = await supabase.rpc(
          "get_encrypted_secret",
          { p_secret_name: "META_SYSTEM_USER_ACCESS_TOKEN" }
        );

        if (!tokenError && tokenData) {
          metaToken = tokenData;
          console.log("✅ Meta token found in Vault via RPC");
        } else {
          console.error("❌ Error fetching token from Vault:", tokenError);
        }
      } catch (err) {
        console.error("❌ Exception fetching Meta token from Vault:", err);
      }
    }

    if (!metaToken) {
      return new Response(
        JSON.stringify({
          error: {
            message: "META_SYSTEM_USER_ACCESS_TOKEN not found in Vault or environment variables",
            code: "TOKEN_NOT_FOUND",
          },
          connected: false,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Handle different actions
    if (action === "check-connection") {
      // Simple validation: try to get user info from Meta API
      try {
        const response = await fetch(
          `https://graph.facebook.com/v18.0/me?access_token=${metaToken}`
        );
        const data = await response.json();

        if (data.error) {
          return new Response(
            JSON.stringify({
              error: data.error,
              connected: false,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        return new Response(
          JSON.stringify({
            connected: true,
            user: data,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: {
              message: err.message || "Failed to connect to Meta API",
            },
            connected: false,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if (action === "get-ad-accounts") {
      try {
        console.log("🔍 Fetching ad accounts...");
        
        // Get business ID first (you may need to configure this)
        const businessId = Deno.env.get("META_BUSINESS_ID");
        console.log("Business ID from env:", businessId || "not set");
        
        if (!businessId) {
          // Try to get from user's businesses
          console.log("Fetching user businesses...");
          const userResponse = await fetch(
            `https://graph.facebook.com/v18.0/me?fields=businesses&access_token=${metaToken}`
          );
          const userData = await userResponse.json();
          
          console.log("User data response:", JSON.stringify(userData));
          
          if (userData.error) {
            console.error("❌ Meta API error:", userData.error);
            return new Response(
              JSON.stringify({
                error: {
                  message: userData.error.message || "Erro ao buscar businesses",
                  code: userData.error.code,
                  type: userData.error.type,
                },
                adAccounts: [],
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }

          if (!userData.businesses || userData.businesses.data.length === 0) {
            console.warn("⚠️ No businesses found for this user, trying direct ad accounts...");
            
            // Fallback: Try to get ad accounts directly from user
            try {
              const directAccountsResponse = await fetch(
                `https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_id,currency&access_token=${metaToken}`
              );
              const directAccountsData = await directAccountsResponse.json();
              
              console.log("Direct ad accounts response:", JSON.stringify(directAccountsData));
              
              if (directAccountsData.error) {
                console.error("❌ Error fetching direct ad accounts:", directAccountsData.error);
                return new Response(
                  JSON.stringify({
                    error: {
                      message: directAccountsData.error.message || "Nenhuma business encontrada e não foi possível buscar contas diretamente. Verifique se o System User tem acesso a uma Business ou contas de anúncio no Meta Business Manager.",
                      code: directAccountsData.error.code,
                      type: directAccountsData.error.type,
                    },
                    adAccounts: [],
                  }),
                  {
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                  }
                );
              }
              
              if (directAccountsData.data && directAccountsData.data.length > 0) {
                console.log(`✅ Found ${directAccountsData.data.length} ad accounts directly`);
                return new Response(
                  JSON.stringify({
                    adAccounts: directAccountsData.data || [],
                  }),
                  {
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                  }
                );
              }
            } catch (directErr) {
              console.error("❌ Exception fetching direct ad accounts:", directErr);
            }
            
            // If we get here, both methods failed
            return new Response(
              JSON.stringify({
                error: {
                  message: "Nenhuma business encontrada e não foi possível buscar contas diretamente. Verifique se o System User tem acesso a uma Business ou contas de anúncio no Meta Business Manager.",
                  hint: "Configure o System User no Meta Business Manager e atribua-o a uma Business ou contas de anúncio.",
                },
                adAccounts: [],
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }

          // Get ad accounts from first business
          const firstBusiness = userData.businesses.data[0];
          console.log("Using business:", firstBusiness.id);
          
          const accountsResponse = await fetch(
            `https://graph.facebook.com/v18.0/${firstBusiness.id}/owned_ad_accounts?access_token=${metaToken}`
          );
          const accountsData = await accountsResponse.json();

          console.log("Ad accounts response:", JSON.stringify(accountsData));

          if (accountsData.error) {
            console.error("❌ Error fetching ad accounts:", accountsData.error);
            return new Response(
              JSON.stringify({
                error: {
                  message: accountsData.error.message || "Erro ao buscar contas de anúncio",
                  code: accountsData.error.code,
                  type: accountsData.error.type,
                },
                adAccounts: [],
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }

          console.log(`✅ Found ${accountsData.data?.length || 0} ad accounts`);
          return new Response(
            JSON.stringify({
              adAccounts: accountsData.data || [],
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        } else {
          // Use configured business ID
          console.log("Using configured business ID:", businessId);
          const accountsResponse = await fetch(
            `https://graph.facebook.com/v18.0/${businessId}/owned_ad_accounts?access_token=${metaToken}`
          );
          const accountsData = await accountsResponse.json();

          console.log("Ad accounts response:", JSON.stringify(accountsData));

          if (accountsData.error) {
            console.error("❌ Error fetching ad accounts:", accountsData.error);
            return new Response(
              JSON.stringify({
                error: {
                  message: accountsData.error.message || "Erro ao buscar contas de anúncio",
                  code: accountsData.error.code,
                  type: accountsData.error.type,
                },
                adAccounts: [],
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }

          console.log(`✅ Found ${accountsData.data?.length || 0} ad accounts`);
          return new Response(
            JSON.stringify({
              adAccounts: accountsData.data || [],
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      } catch (err) {
        console.error("❌ Exception in get-ad-accounts:", err);
        return new Response(
          JSON.stringify({
            error: {
              message: err?.message || "Erro inesperado ao buscar contas de anúncio",
              details: err?.toString(),
            },
            adAccounts: [],
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Handle campaign insights and other actions
    if (action === "get-campaign-insights" || action === "get-ad-insights") {
      const { ad_account_id, time_range, metrics } = body;

      if (!ad_account_id) {
        return new Response(
          JSON.stringify({
            error: { message: "ad_account_id is required" },
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      try {
        const level = action === "get-campaign-insights" ? "campaign" : "ad";
        const fields = Array.isArray(metrics) ? metrics.join(",") : metrics || "spend,impressions,clicks";

        const url = `https://graph.facebook.com/v18.0/${ad_account_id}/insights?level=${level}&fields=${fields}&time_range=${JSON.stringify(time_range)}&access_token=${metaToken}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
          throw new Error(data.error.message);
        }

        return new Response(
          JSON.stringify({
            campaigns: data.data || [],
            paging: data.paging || null,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: {
              message: err.message || "Failed to fetch insights",
            },
            campaigns: {},
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Get campaigns for an ad account
    if (action === "get-campaigns") {
      const { adAccountId, time_range, metrics } = body;

      if (!adAccountId) {
        return new Response(
          JSON.stringify({ error: { message: "adAccountId is required" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
        const campaignFields = "id,name,status,effective_status,objective,created_time,updated_time";
        let url = `https://graph.facebook.com/v18.0/${accountId}/campaigns?fields=${campaignFields}&access_token=${metaToken}`;
        
        const campaignsResponse = await fetch(url);
        const campaignsData = await campaignsResponse.json();

        if (campaignsData.error) {
          return new Response(
            JSON.stringify({ error: campaignsData.error, campaigns: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Debug: verifica se effective_status está sendo retornado
        if (campaignsData.data && campaignsData.data.length > 0) {
          const firstCampaign = campaignsData.data[0];
          console.log(`📊 Primeira campanha retornada pela API:`, {
            id: firstCampaign.id,
            name: firstCampaign.name,
            status: firstCampaign.status,
            effective_status: firstCampaign.effective_status,
            allFields: Object.keys(firstCampaign)
          });
        }

        const metricsStr = Array.isArray(metrics) ? metrics.join(",") : metrics || "spend,impressions,clicks,results";
        
        // Garante que time_range seja válido (últimos 30 dias se não especificado)
        const validTimeRange = time_range && time_range.since && time_range.until 
          ? time_range 
          : { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], until: new Date().toISOString().split('T')[0] };
        
        console.log(`📅 Time range:`, validTimeRange);
        console.log(`📊 Metrics:`, metricsStr);
        
        // Processa campanhas sequencialmente com delay para evitar rate limiting
        // Para contas com muitas campanhas, isso é mais seguro que Promise.all
        const campaignsWithInsights = [];
        const campaignsList = campaignsData.data || [];
        
        console.log(`📊 Processando ${campaignsList.length} campanhas...`);
        
        for (let i = 0; i < campaignsList.length; i++) {
          const campaign = campaignsList[i];
          
          // Delay entre requisições para evitar rate limiting (200ms)
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
          try {
            // Usa encodeURIComponent para garantir que o JSON seja codificado corretamente
            const timeRangeParam = encodeURIComponent(JSON.stringify(validTimeRange));
            const insightsUrl = `https://graph.facebook.com/v18.0/${campaign.id}/insights?fields=${metricsStr}&time_range=${timeRangeParam}&access_token=${metaToken}`;
            
            console.log(`🔍 [${i + 1}/${campaignsList.length}] Fetching insights for campaign ${campaign.id}...`);
            const insightsResponse = await fetch(insightsUrl);
            const insightsData = await insightsResponse.json();
            
            // Garante que sempre retorna um formato consistente
            if (insightsData.error) {
              console.error(`❌ Error fetching insights for campaign ${campaign.id} (${campaign.name}):`, JSON.stringify(insightsData.error, null, 2));
              console.error(`   URL: ${insightsUrl.replace(metaToken, 'TOKEN_HIDDEN')}`);
              campaignsWithInsights.push({ ...campaign, insights: { data: [], error: insightsData.error } });
              continue;
            }
            
            // Debug: log do effective_status da campanha
            console.log(`📊 Campaign ${campaign.id} (${campaign.name}): status=${campaign.status}, effective_status=${campaign.effective_status}`);
            
            // Tenta buscar effective_status novamente se não estiver presente
            let finalCampaign = { ...campaign };
            if (!finalCampaign.effective_status) {
              try {
                // Faz uma requisição adicional para obter effective_status
                const campaignDetailsUrl = `https://graph.facebook.com/v18.0/${campaign.id}?fields=id,name,status,effective_status,objective&access_token=${metaToken}`;
                const campaignDetailsResponse = await fetch(campaignDetailsUrl);
                const campaignDetailsData = await campaignDetailsResponse.json();
                
                if (!campaignDetailsData.error && campaignDetailsData.effective_status) {
                  finalCampaign.effective_status = campaignDetailsData.effective_status;
                  console.log(`✅ effective_status obtido para campanha ${campaign.id}: ${campaignDetailsData.effective_status}`);
                } else if (campaignDetailsData.error) {
                  console.warn(`⚠️ Erro ao buscar effective_status para campanha ${campaign.id}:`, campaignDetailsData.error);
                }
              } catch (err) {
                console.warn(`⚠️ Exception ao buscar effective_status para campanha ${campaign.id}:`, err);
              }
            }
            
            // Debug: log do effective_status da campanha
            console.log(`📊 Campaign ${campaign.id} (${campaign.name}): status=${finalCampaign.status}, effective_status=${finalCampaign.effective_status}`);
            
            // Garante que data seja sempre um array
            campaignsWithInsights.push({ 
              ...finalCampaign, 
              insights: { 
                data: Array.isArray(insightsData.data) ? insightsData.data : (insightsData.data ? [insightsData.data] : []),
                paging: insightsData.paging || null
              } 
            });
          } catch (err) {
            console.error(`Exception fetching insights for campaign ${campaign.id}:`, err);
            campaignsWithInsights.push({ ...campaign, insights: { data: [], error: { message: err.message } } });
          }
        }
        );

        return new Response(
          JSON.stringify({ campaigns: campaignsWithInsights }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar campanhas" }, campaigns: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get account-level insights
    if (action === "get-account-insights") {
      const { adAccountId, time_range, metrics } = body;

      if (!adAccountId) {
        return new Response(
          JSON.stringify({ error: { message: "adAccountId is required" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
        const metricsStr = Array.isArray(metrics) ? metrics.join(",") : metrics || "spend,impressions,clicks,results";
        const validTimeRange = time_range && time_range.since && time_range.until 
          ? time_range 
          : { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], until: new Date().toISOString().split('T')[0] };
        const timeRangeParam = encodeURIComponent(JSON.stringify(validTimeRange));
        const url = `https://graph.facebook.com/v18.0/${accountId}/insights?fields=${metricsStr}&time_range=${timeRangeParam}&access_token=${metaToken}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
          return new Response(
            JSON.stringify({ error: data.error, insights: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ insights: data.data?.[0] || data.data || null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar insights" }, insights: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get ad sets for a campaign or account
    if (action === "get-adsets") {
      const { campaignId, adAccountId, time_range, metrics } = body;

      // Permite buscar por campanha ou por conta
      if (!campaignId && !adAccountId) {
        return new Response(
          JSON.stringify({ error: { message: "campaignId or adAccountId is required" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const adsetFields = "id,name,status,effective_status,campaign_id,created_time,updated_time";
        const metricsStr = Array.isArray(metrics) ? metrics.join(",") : metrics || "spend,impressions,clicks,results";
        // Se campaignId fornecido, busca ad sets da campanha; senão, busca da conta
        const entityId = campaignId || adAccountId;
        const endpoint = campaignId ? `${campaignId}/adsets` : `${adAccountId}/adsets`;
        let url = `https://graph.facebook.com/v18.0/${endpoint}?fields=${adsetFields}&access_token=${metaToken}`;
        
        const adsetsResponse = await fetch(url);
        const adsetsData = await adsetsResponse.json();

        console.log(`📊 [get-adsets] Resposta bruta do Meta para campanha ${campaignId}:`, JSON.stringify(adsetsData, null, 2));

        if (adsetsData.error) {
          console.error(`❌ [get-adsets] Erro do Meta:`, adsetsData.error);
          return new Response(
            JSON.stringify({ error: adsetsData.error, adsets: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const rawAdsets = adsetsData.data || [];
        console.log(`📋 [get-adsets] ${rawAdsets.length} conjuntos brutos encontrados do Meta`);

        // Processa ad sets com delay maior para evitar rate limiting
        // Limita a 20 ad sets por vez para evitar rate limiting
        const maxAdsets = 20;
        const adsetsToProcess = rawAdsets.slice(0, maxAdsets);
        console.log(`🔄 [get-adsets] Processando ${adsetsToProcess.length} conjuntos...`);
        
        const adsetsWithInsights: any[] = [];
        for (let i = 0; i < adsetsToProcess.length; i++) {
          const adset = adsetsToProcess[i];
          
          // Adiciona delay maior entre requisições para evitar rate limiting (500ms)
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
          }
          
          try {
            const validTimeRange = time_range && time_range.since && time_range.until 
              ? time_range 
              : { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], until: new Date().toISOString().split('T')[0] };
            const timeRangeParam = encodeURIComponent(JSON.stringify(validTimeRange));
            const insightsUrl = `https://graph.facebook.com/v18.0/${adset.id}/insights?fields=${metricsStr}&time_range=${timeRangeParam}&access_token=${metaToken}`;
            const insightsResponse = await fetch(insightsUrl);
            const insightsData = await insightsResponse.json();
            
            // Trata rate limiting
            if (insightsData.error) {
              if (insightsData.error.code === 4 || insightsData.error.message?.includes('limit') || insightsData.error.message?.includes('rate')) {
                console.warn(`Rate limit atingido para adset ${adset.id}, pulando...`);
                // Em vez de tentar novamente, apenas adiciona sem insights para não piorar o rate limit
                adsetsWithInsights.push({ ...adset, insights: { data: [], error: insightsData.error } });
                continue;
              } else {
                adsetsWithInsights.push({ ...adset, insights: { data: [], error: insightsData.error } });
                continue;
              }
            }
            
            adsetsWithInsights.push({ 
              ...adset, 
              insights: { 
                data: Array.isArray(insightsData.data) ? insightsData.data : (insightsData.data ? [insightsData.data] : []),
                paging: insightsData.paging || null
              } 
            });
          } catch (err) {
            console.error(`Erro ao buscar insights para adset ${adset.id}:`, err);
            adsetsWithInsights.push({ ...adset, insights: { data: [], error: { message: err.message } } });
          }
        }

        return new Response(
          JSON.stringify({ adsets: adsetsWithInsights }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar ad sets" }, adsets: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get ads for an ad set or account
    if (action === "get-ads") {
      const { adsetId, adAccountId, time_range, metrics } = body;

      // Permite buscar por ad set ou por conta
      if (!adsetId && !adAccountId) {
        return new Response(
          JSON.stringify({ error: { message: "adsetId or adAccountId is required" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const adFields = "id,name,status,effective_status,adset_id,created_time,updated_time";
        const metricsStr = Array.isArray(metrics) ? metrics.join(",") : metrics || "spend,impressions,clicks,results";
        // Se adsetId fornecido, busca ads do ad set; senão, busca da conta
        const entityId = adsetId || adAccountId;
        const endpoint = adsetId ? `${adsetId}/ads` : `${adAccountId}/ads`;
        let url = `https://graph.facebook.com/v18.0/${endpoint}?fields=${adFields}&access_token=${metaToken}`;
        
        const adsResponse = await fetch(url);
        const adsData = await adsResponse.json();

        if (adsData.error) {
          return new Response(
            JSON.stringify({ error: adsData.error, ads: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Processa ads com delay maior para evitar rate limiting
        // Limita a 20 ads por vez para evitar rate limiting
        const maxAds = 20;
        const adsToProcess = (adsData.data || []).slice(0, maxAds);
        
        const adsWithInsights: any[] = [];
        for (let i = 0; i < adsToProcess.length; i++) {
          const ad = adsToProcess[i];
          
          // Adiciona delay maior entre requisições para evitar rate limiting (500ms)
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
          }
          
          try {
            const validTimeRange = time_range && time_range.since && time_range.until 
              ? time_range 
              : { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], until: new Date().toISOString().split('T')[0] };
            const timeRangeParam = encodeURIComponent(JSON.stringify(validTimeRange));
            const insightsUrl = `https://graph.facebook.com/v18.0/${ad.id}/insights?fields=${metricsStr}&time_range=${timeRangeParam}&access_token=${metaToken}`;
            const insightsResponse = await fetch(insightsUrl);
            const insightsData = await insightsResponse.json();
            
            // Trata rate limiting
            if (insightsData.error) {
              if (insightsData.error.code === 4 || insightsData.error.message?.includes('limit') || insightsData.error.message?.includes('rate')) {
                console.warn(`Rate limit atingido para ad ${ad.id}, pulando...`);
                // Em vez de tentar novamente, apenas adiciona sem insights para não piorar o rate limit
                adsWithInsights.push({ ...ad, insights: { data: [], error: insightsData.error } });
                continue;
              } else {
                adsWithInsights.push({ ...ad, insights: { data: [], error: insightsData.error } });
                continue;
              }
            }
            
            // Tenta buscar effective_status novamente se não estiver presente
            let finalAd = { ...ad };
            if (!finalAd.effective_status) {
              try {
                const adDetailsUrl = `https://graph.facebook.com/v18.0/${ad.id}?fields=id,name,status,effective_status&access_token=${metaToken}`;
                const adDetailsResponse = await fetch(adDetailsUrl);
                const adDetailsData = await adDetailsResponse.json();
                
                if (!adDetailsData.error && adDetailsData.effective_status) {
                  finalAd.effective_status = adDetailsData.effective_status;
                }
              } catch (err) {
                // Ignora erro
              }
            }
            
            adsWithInsights.push({ 
              ...finalAd, 
              insights: { 
                data: Array.isArray(insightsData.data) ? insightsData.data : (insightsData.data ? [insightsData.data] : []),
                paging: insightsData.paging || null
              } 
            });
          } catch (err) {
            console.error(`Erro ao buscar insights para ad ${ad.id}:`, err);
            adsWithInsights.push({ ...ad, insights: { data: [], error: { message: err.message } } });
          }
        }

        return new Response(
          JSON.stringify({ ads: adsWithInsights }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar anúncios" }, ads: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Unknown action
    return new Response(
      JSON.stringify({
        error: { message: `Unknown action: ${action}` },
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: {
          message: error.message || "Internal server error",
        },
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

