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
    let action: string;
    let body: any = {};
    try {
      const requestBody = await req.json();
      action = requestBody.action;
      body = { ...requestBody };
      delete body.action;
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: {
            message: "Invalid request body",
            code: "INVALID_REQUEST",
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!action) {
      return new Response(
        JSON.stringify({
          error: {
            message: "Action is required",
            code: "MISSING_ACTION",
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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
      // Retorna status 200 para que o cliente possa tratar o erro
      return new Response(
        JSON.stringify({
          error: {
            message: "META_SYSTEM_USER_ACCESS_TOKEN not found in Vault or environment variables",
            code: "TOKEN_NOT_FOUND",
          },
          connected: false,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Handle different actions
    if (action === "check-connection") {
      // Simple validation: try to get user info from Meta API
      try {
        const response = await fetch(
          `https://graph.facebook.com/v24.0/me?access_token=${metaToken}`
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

    if (action === "get-ad-by-id") {
      const { adId } = body;
      if (!adId || typeof adId !== "string" || !adId.trim()) {
        return new Response(
          JSON.stringify({ error: { message: "adId is required", code: "MISSING_AD_ID" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const id = String(adId).trim();
      try {
        const fields = "name,campaign{name,account_id},adset{name},creative{thumbnail_url}";
        const params = new URLSearchParams({
          fields,
          thumbnail_width: "80",
          thumbnail_height: "80",
          access_token: metaToken,
        });
        const url = `https://graph.facebook.com/v24.0/${id}?${params.toString()}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) {
          console.error("[get-ad-by-id] Meta API error:", data.error);
          return new Response(
            JSON.stringify({ error: { message: data.error.message || "Erro ao buscar anúncio", code: data.error.code || "META_API_ERROR" } }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const campaign = data.campaign || {};
        const creative = data.creative || {};
        const thumbnailUrl = (creative && typeof creative === "object" && creative.thumbnail_url) ? String(creative.thumbnail_url) : null;
        let accountName: string | null = null;
        if (campaign.account_id) {
          const actId = campaign.account_id.toString().startsWith("act_") ? campaign.account_id : `act_${campaign.account_id}`;
          try {
            const accUrl = `https://graph.facebook.com/v24.0/${actId}?fields=name&access_token=${metaToken}`;
            const accRes = await fetch(accUrl);
            const accData = await accRes.json();
            if (!accData.error && accData.name) accountName = accData.name;
          } catch (_) {
            // ignore
          }
        }
        return new Response(
          JSON.stringify({
            ad: {
              id: data.id,
              name: data.name || null,
              campaign: { name: campaign.name || null },
              adset: (data.adset && { name: data.adset.name || null }) || null,
              thumbnail_url: thumbnailUrl ?? null,
            },
            accountName: accountName || null,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        console.error("[get-ad-by-id] Exception:", err);
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Falha ao buscar dados do anúncio", code: "REQUEST_FAILED" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // --- Lead Ads (Gestão de leads dos anúncios) ---
    function normalizeLeadFieldData(fieldData: { name: string; values: string[] }[]): { nome: string | null; email: string | null; telefone: string | null; field_data: Record<string, string> } {
      const map: Record<string, string> = {};
      (fieldData || []).forEach((f) => {
        const v = Array.isArray(f.values) && f.values[0] != null ? String(f.values[0]).trim() : "";
        if (f.name && v) map[f.name] = v;
      });
      const fullName = map.full_name || null;
      const nome = fullName || (map.first_name || map.last_name ? [map.first_name, map.last_name].filter(Boolean).join(" ").trim() || null : null) || null;
      const email = map.email || null;
      const telefone = map.phone_number || map.phone || map.telefone || null;
      return { nome, email, telefone, field_data: map };
    }

    if (action === "get-leads-by-form") {
      const { form_id, since, limit, after } = body;
      if (!form_id || typeof form_id !== "string" || !form_id.trim()) {
        return new Response(
          JSON.stringify({ error: { message: "form_id is required", code: "MISSING_FORM_ID" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const formId = String(form_id).trim();
        const fields = "created_time,id,ad_id,form_id,field_data";
        let url = `https://graph.facebook.com/v24.0/${formId}/leads?fields=${encodeURIComponent(fields)}&limit=${Math.min(Number(limit) || 100, 500)}`;
        if (since != null && (typeof since === "number" || (typeof since === "string" && /^\d+$/.test(since)))) {
          const ts = typeof since === "string" ? parseInt(since, 10) : since;
          url += `&filtering=${encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: ts }]))}`;
        }
        if (after && typeof after === "string" && after.trim()) url += `&after=${encodeURIComponent(after.trim())}`;
        url += `&access_token=${metaToken}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) {
          return new Response(
            JSON.stringify({ error: data.error, leads: [], paging: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const leads = (data.data || []).map((lead: any) => {
          const normalized = normalizeLeadFieldData(lead.field_data || []);
          return {
            id: lead.id,
            created_time: lead.created_time,
            ad_id: lead.ad_id || null,
            form_id: lead.form_id || formId,
            nome: normalized.nome,
            email: normalized.email,
            telefone: normalized.telefone,
            field_data: normalized.field_data,
          };
        });
        return new Response(
          JSON.stringify({ leads, paging: data.paging || null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Falha ao buscar leads do formulário", code: "REQUEST_FAILED" }, leads: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "get-lead-by-id") {
      const { leadgen_id } = body;
      if (!leadgen_id || typeof leadgen_id !== "string" || !leadgen_id.trim()) {
        return new Response(
          JSON.stringify({ error: { message: "leadgen_id is required", code: "MISSING_LEADGEN_ID" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const id = String(leadgen_id).trim();
        const fields = "created_time,id,ad_id,form_id,field_data";
        const url = `https://graph.facebook.com/v24.0/${id}?fields=${encodeURIComponent(fields)}&access_token=${metaToken}`;
        const response = await fetch(url);
        const lead = await response.json();
        if (lead.error) {
          return new Response(
            JSON.stringify({ error: lead.error, lead: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const normalized = normalizeLeadFieldData(lead.field_data || []);
        const out = {
          id: lead.id,
          created_time: lead.created_time,
          ad_id: lead.ad_id || null,
          form_id: lead.form_id || null,
          nome: normalized.nome,
          email: normalized.email,
          telefone: normalized.telefone,
          field_data: normalized.field_data,
        };
        return new Response(
          JSON.stringify({ lead: out }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Falha ao buscar lead", code: "REQUEST_FAILED" }, lead: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "get-leads-by-ad") {
      const { ad_id, since, limit, after } = body;
      if (!ad_id || typeof ad_id !== "string" || !ad_id.trim()) {
        return new Response(
          JSON.stringify({ error: { message: "ad_id is required", code: "MISSING_AD_ID" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const adId = String(ad_id).trim();
        const fields = "created_time,id,ad_id,form_id,field_data";
        let url = `https://graph.facebook.com/v24.0/${adId}/leads?fields=${encodeURIComponent(fields)}&limit=${Math.min(Number(limit) || 100, 500)}`;
        if (since != null && (typeof since === "number" || (typeof since === "string" && /^\d+$/.test(since)))) {
          const ts = typeof since === "string" ? parseInt(since, 10) : since;
          url += `&filtering=${encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: ts }]))}`;
        }
        if (after && typeof after === "string" && after.trim()) url += `&after=${encodeURIComponent(after.trim())}`;
        url += `&access_token=${metaToken}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) {
          return new Response(
            JSON.stringify({ error: data.error, leads: [], paging: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const leads = (data.data || []).map((lead: any) => {
          const normalized = normalizeLeadFieldData(lead.field_data || []);
          return {
            id: lead.id,
            created_time: lead.created_time,
            ad_id: lead.ad_id || adId,
            form_id: lead.form_id || null,
            nome: normalized.nome,
            email: normalized.email,
            telefone: normalized.telefone,
            field_data: normalized.field_data,
          };
        });
        return new Response(
          JSON.stringify({ leads, paging: data.paging || null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Falha ao buscar leads do anúncio", code: "REQUEST_FAILED" }, leads: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "get-ad-accounts") {
      try {
        console.log("🔍 Fetching ad accounts...");
        
        // Get business ID first (you may need to configure this)
        const businessId = Deno.env.get("META_BUSINESS_ID");
        console.log("Business ID from env:", businessId || "not set");
        console.log("🔍 Starting comprehensive ad accounts search...");
        
        if (!businessId) {
          // Try to get from user's businesses
          console.log("Fetching user businesses...");
          const userResponse = await fetch(
            `https://graph.facebook.com/v24.0/me?fields=businesses&access_token=${metaToken}`
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

          // Helper function to fetch all pages from paginated API
          const fetchAllPages = async (url: string): Promise<any[]> => {
            const allData: any[] = [];
            let currentUrl = url;
            
            while (currentUrl) {
              const response = await fetch(currentUrl);
              const data = await response.json();
              
              if (data.error) {
                console.error("❌ Error in pagination:", data.error);
                break;
              }
              
              if (data.data) {
                allData.push(...data.data);
              }
              
              // Check for next page
              currentUrl = data.paging?.next || null;
            }
            
            return allData;
          };

          // Helper function to remove duplicates by ID
          const removeDuplicates = (accounts: any[]): any[] => {
            const seen = new Set();
            return accounts.filter(account => {
              if (seen.has(account.id)) {
                return false;
              }
              seen.add(account.id);
              return true;
            });
          };

          const allAccounts: any[] = [];

          // Method 1: Try to get ad accounts directly from user (includes all accessible accounts)
          try {
            console.log("🔍 Fetching ad accounts directly from user (me/adaccounts)...");
            const directAccountsUrl = `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
            const directAccounts = await fetchAllPages(directAccountsUrl);
            
            if (directAccounts.length > 0) {
              console.log(`✅ Found ${directAccounts.length} ad accounts directly from user`);
              allAccounts.push(...directAccounts);
            } else {
              console.log("⚠️ No accounts found via me/adaccounts");
            }
          } catch (directErr) {
            console.warn("⚠️ Could not fetch direct ad accounts:", directErr);
          }
          
          // Method 1.5: Try to get ad accounts from System User's assigned assets
          try {
            console.log("🔍 Fetching ad accounts from System User assigned assets...");
            // Get the System User ID first
            const systemUserResponse = await fetch(
              `https://graph.facebook.com/v24.0/me?fields=id&access_token=${metaToken}`
            );
            const systemUserData = await systemUserResponse.json();
            
            if (systemUserData.id && !systemUserData.error) {
              const systemUserId = systemUserData.id;
              console.log(`System User ID: ${systemUserId}`);
              
              // Try to get ad accounts assigned to this system user
              const assignedAccountsUrl = `https://graph.facebook.com/v24.0/${systemUserId}/assigned_ad_accounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
              const assignedAccounts = await fetchAllPages(assignedAccountsUrl);
              
              if (assignedAccounts.length > 0) {
                console.log(`✅ Found ${assignedAccounts.length} assigned ad accounts from System User`);
                allAccounts.push(...assignedAccounts);
              }
            }
          } catch (systemUserErr) {
            console.warn("⚠️ Could not fetch System User assigned accounts:", systemUserErr);
          }

          // Method 2: Get accounts from all businesses (if available)
          if (userData.businesses && userData.businesses.data.length > 0) {
            console.log(`🔍 Fetching ad accounts from ${userData.businesses.data.length} businesses...`);
            console.log(`📋 Business IDs:`, userData.businesses.data.map((b: any) => `${b.id} (${b.name || 'no name'})`).join(', '));
            
            for (const business of userData.businesses.data) {
              try {
                console.log(`  📦 Processing business: ${business.id} (${business.name || 'no name'})`);
                
                // Get owned accounts
                const ownedUrl = `https://graph.facebook.com/v24.0/${business.id}/owned_ad_accounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
                const ownedAccounts = await fetchAllPages(ownedUrl);
                if (ownedAccounts.length > 0) {
                  console.log(`    ✅ Found ${ownedAccounts.length} owned accounts from business ${business.id}`);
                  allAccounts.push(...ownedAccounts);
                } else {
                  console.log(`    ⚠️ No owned accounts found for business ${business.id}`);
                }

                // Get assigned accounts (accounts the System User has access to but doesn't own)
                // This is the key endpoint - it returns ALL accounts the System User can access
                const assignedUrl = `https://graph.facebook.com/v24.0/${business.id}/ad_accounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
                const assignedAccounts = await fetchAllPages(assignedUrl);
                if (assignedAccounts.length > 0) {
                  console.log(`    ✅ Found ${assignedAccounts.length} assigned accounts from business ${business.id}`);
                  console.log(`    📋 Account IDs from ${business.id}:`, assignedAccounts.map((acc: any) => acc.id).join(', '));
                  allAccounts.push(...assignedAccounts);
                } else {
                  console.log(`    ⚠️ No assigned accounts found for business ${business.id}`);
                }
                
                // Also try the client_ad_accounts endpoint (for client accounts)
                try {
                  const clientAccountsUrl = `https://graph.facebook.com/v24.0/${business.id}/client_ad_accounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
                  const clientAccounts = await fetchAllPages(clientAccountsUrl);
                  if (clientAccounts.length > 0) {
                    console.log(`    ✅ Found ${clientAccounts.length} client accounts from business ${business.id}`);
                    allAccounts.push(...clientAccounts);
                  }
                } catch (clientErr) {
                  // This endpoint might not be available, ignore
                  console.log(`    ℹ️ client_ad_accounts endpoint not available for business ${business.id}`);
                }
              } catch (businessErr) {
                console.warn(`    ❌ Error fetching accounts from business ${business.id}:`, businessErr);
                if (businessErr instanceof Error) {
                  console.warn(`    Error message: ${businessErr.message}`);
                }
              }
            }
          } else {
            console.warn("⚠️ No businesses found for System User");
          }

          // Remove duplicates and return
          const uniqueAccounts = removeDuplicates(allAccounts);
          console.log(`✅ Total unique ad accounts found: ${uniqueAccounts.length}`);
          console.log(`📋 Account IDs:`, uniqueAccounts.map(acc => acc.id).join(', '));

          if (uniqueAccounts.length === 0) {
            return new Response(
              JSON.stringify({
                error: {
                  message: "Nenhuma conta de anúncio encontrada. Verifique se o System User tem acesso a contas de anúncio no Meta Business Manager.",
                  hint: "Configure o System User no Meta Business Manager e atribua-o a contas de anúncio.",
                },
                adAccounts: [],
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }

          return new Response(
            JSON.stringify({
              adAccounts: uniqueAccounts,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        } else {
          // Use configured business ID - but still fetch all types of accounts
          console.log("Using configured business ID:", businessId);
          
          // Helper function to fetch all pages from paginated API
          const fetchAllPages = async (url: string): Promise<any[]> => {
            const allData: any[] = [];
            let currentUrl = url;
            
            while (currentUrl) {
              const response = await fetch(currentUrl);
              const data = await response.json();
              
              if (data.error) {
                console.error("❌ Error in pagination:", data.error);
                break;
              }
              
              if (data.data) {
                allData.push(...data.data);
              }
              
              // Check for next page
              currentUrl = data.paging?.next || null;
            }
            
            return allData;
          };

          // Helper function to remove duplicates by ID
          const removeDuplicates = (accounts: any[]): any[] => {
            const seen = new Set();
            return accounts.filter(account => {
              if (seen.has(account.id)) {
                return false;
              }
              seen.add(account.id);
              return true;
            });
          };

          const allAccounts: any[] = [];

          // Get owned accounts
          try {
            const ownedUrl = `https://graph.facebook.com/v24.0/${businessId}/owned_ad_accounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
            const ownedAccounts = await fetchAllPages(ownedUrl);
            if (ownedAccounts.length > 0) {
              console.log(`✅ Found ${ownedAccounts.length} owned accounts`);
              allAccounts.push(...ownedAccounts);
            }
          } catch (err) {
            console.warn("⚠️ Error fetching owned accounts:", err);
          }

          // Get assigned accounts (accounts the System User has access to)
          try {
            const assignedUrl = `https://graph.facebook.com/v24.0/${businessId}/ad_accounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
            const assignedAccounts = await fetchAllPages(assignedUrl);
            if (assignedAccounts.length > 0) {
              console.log(`✅ Found ${assignedAccounts.length} assigned accounts`);
              allAccounts.push(...assignedAccounts);
            }
          } catch (err) {
            console.warn("⚠️ Error fetching assigned accounts:", err);
          }

          // Also try direct method as fallback
          try {
            const directUrl = `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
            const directAccounts = await fetchAllPages(directUrl);
            if (directAccounts.length > 0) {
              console.log(`✅ Found ${directAccounts.length} accounts directly from user`);
              allAccounts.push(...directAccounts);
            }
          } catch (err) {
            console.warn("⚠️ Error fetching direct accounts:", err);
          }

          // Remove duplicates
          const uniqueAccounts = removeDuplicates(allAccounts);
          console.log(`✅ Total unique ad accounts found: ${uniqueAccounts.length}`);

          if (uniqueAccounts.length === 0) {
            return new Response(
              JSON.stringify({
                error: {
                  message: "Nenhuma conta de anúncio encontrada. Verifique se o System User tem acesso a contas de anúncio no Meta Business Manager.",
                  hint: "Configure o System User no Meta Business Manager e atribua-o a contas de anúncio.",
                },
                adAccounts: [],
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }

          return new Response(
            JSON.stringify({
              adAccounts: uniqueAccounts,
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

        const url = `https://graph.facebook.com/v24.0/${ad_account_id}/insights?level=${level}&fields=${fields}&time_range=${JSON.stringify(time_range)}&access_token=${metaToken}`;
        
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
        let url = `https://graph.facebook.com/v24.0/${accountId}/campaigns?fields=${campaignFields}&access_token=${metaToken}`;
        
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
        
        // Processa TODAS as campanhas em paralelo para máxima velocidade
        const campaignsWithInsights = [];
        const campaignsList = campaignsData.data || [];
        
        console.log(`📊 Processando ${campaignsList.length} campanhas em paralelo...`);
        
        // Processa todas as campanhas simultaneamente
        const allCampaignPromises = campaignsList.map(async (campaign, index) => {
          try {
            // Busca insights
            const timeRangeParam = encodeURIComponent(JSON.stringify(validTimeRange));
            const insightsUrl = `https://graph.facebook.com/v24.0/${campaign.id}/insights?fields=${metricsStr}&time_range=${timeRangeParam}&access_token=${metaToken}`;
            
            const insightsResponse = await fetch(insightsUrl);
            const insightsData = await insightsResponse.json();
            
            // Garante que sempre retorna um formato consistente
            if (insightsData.error) {
              console.error(`❌ Error fetching insights for campaign ${campaign.id}:`, insightsData.error);
              return { ...campaign, insights: { data: [], error: insightsData.error } };
            }
            
            // Busca effective_status apenas se não estiver presente
            let finalCampaign = { ...campaign };
            if (!finalCampaign.effective_status) {
              try {
                const campaignDetailsUrl = `https://graph.facebook.com/v24.0/${campaign.id}?fields=effective_status&access_token=${metaToken}`;
                const campaignDetailsResponse = await fetch(campaignDetailsUrl);
                const campaignDetailsData = await campaignDetailsResponse.json();
                
                if (!campaignDetailsData.error && campaignDetailsData.effective_status) {
                  finalCampaign.effective_status = campaignDetailsData.effective_status;
                }
              } catch (err) {
                // Ignora erro de effective_status, não é crítico
              }
            }
            
            // Garante que data seja sempre um array
            return { 
              ...finalCampaign, 
              insights: { 
                data: Array.isArray(insightsData.data) ? insightsData.data : (insightsData.data ? [insightsData.data] : []),
                paging: insightsData.paging || null
              } 
            };
          } catch (err) {
            console.error(`Exception fetching insights for campaign ${campaign.id}:`, err);
            return { ...campaign, insights: { data: [], error: { message: err.message } } };
          }
        });
        
        // Aguarda todas as campanhas processarem
        const allResults = await Promise.all(allCampaignPromises);
        campaignsWithInsights.push(...allResults);
        
        console.log(`✅ Todas as ${campaignsWithInsights.length} campanhas processadas!`);

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
        const url = `https://graph.facebook.com/v24.0/${accountId}/insights?fields=${metricsStr}&time_range=${timeRangeParam}&access_token=${metaToken}`;
        
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
        let url = `https://graph.facebook.com/v24.0/${endpoint}?fields=${adsetFields}&access_token=${metaToken}`;
        
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
            const insightsUrl = `https://graph.facebook.com/v24.0/${adset.id}/insights?fields=${metricsStr}&time_range=${timeRangeParam}&access_token=${metaToken}`;
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
        let url = `https://graph.facebook.com/v24.0/${endpoint}?fields=${adFields}&access_token=${metaToken}`;
        
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
            const insightsUrl = `https://graph.facebook.com/v24.0/${ad.id}/insights?fields=${metricsStr}&time_range=${timeRangeParam}&access_token=${metaToken}`;
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
                const adDetailsUrl = `https://graph.facebook.com/v24.0/${ad.id}?fields=id,name,status,effective_status&access_token=${metaToken}`;
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

    // Get Facebook Pages
    if (action === "get-pages") {
      try {
        console.log("🔍 Fetching Facebook pages...");
        
        // Busca páginas do System User
        const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?fields=id,name,access_token,category,picture&limit=500&access_token=${metaToken}`;
        const pagesResponse = await fetch(pagesUrl);
        const pagesData = await pagesResponse.json();

        if (pagesData.error) {
          return new Response(
            JSON.stringify({
              error: {
                message: pagesData.error.message || "Erro ao buscar páginas",
                code: pagesData.error.code,
                type: pagesData.error.type,
              },
              pages: [],
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        return new Response(
          JSON.stringify({
            pages: pagesData.data || [],
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (err) {
        console.error("❌ Exception in get-pages:", err);
        return new Response(
          JSON.stringify({
            error: {
              message: err?.message || "Erro inesperado ao buscar páginas",
              details: err?.toString(),
            },
            pages: [],
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Get Instagram Business Accounts
    if (action === "get-instagram-accounts") {
      try {
        console.log("🔍 Fetching Instagram Business accounts...");
        
        // Primeiro busca as páginas do Facebook (que podem ter Instagram conectado)
        const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?fields=id,name,instagram_business_account&limit=500&access_token=${metaToken}`;
        const pagesResponse = await fetch(pagesUrl);
        const pagesData = await pagesResponse.json();

        if (pagesData.error) {
          return new Response(
            JSON.stringify({
              error: {
                message: pagesData.error.message || "Erro ao buscar contas Instagram",
                code: pagesData.error.code,
              },
              instagramAccounts: [],
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Filtra apenas páginas com Instagram Business conectado
        const instagramAccounts = [];
        for (const page of pagesData.data || []) {
          if (page.instagram_business_account) {
            try {
              // Busca detalhes da conta Instagram
              const instagramUrl = `https://graph.facebook.com/v24.0/${page.instagram_business_account.id}?fields=id,username,name,profile_picture_url&access_token=${metaToken}`;
              const instagramResponse = await fetch(instagramUrl);
              const instagramData = await instagramResponse.json();
              
              if (!instagramData.error && instagramData.id) {
                instagramAccounts.push({
                  id: instagramData.id,
                  username: instagramData.username,
                  name: instagramData.name || instagramData.username,
                  profile_picture_url: instagramData.profile_picture_url,
                  page_id: page.id,
                  page_name: page.name,
                });
              }
            } catch (err) {
              console.warn(`⚠️ Erro ao buscar detalhes do Instagram ${page.instagram_business_account.id}:`, err);
            }
          }
        }

        return new Response(
          JSON.stringify({
            instagramAccounts: instagramAccounts,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (err) {
        console.error("❌ Exception in get-instagram-accounts:", err);
        return new Response(
          JSON.stringify({
            error: {
              message: err?.message || "Erro inesperado ao buscar contas Instagram",
              details: err?.toString(),
            },
            instagramAccounts: [],
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Get Page Insights
    if (action === "get-page-insights") {
      const { page_id, time_range, metrics } = body;

      if (!page_id) {
        return new Response(
          JSON.stringify({ error: { message: "page_id is required" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        // Métricas válidas para v18 - usando apenas métricas básicas e testadas
        const metricsStr = Array.isArray(metrics) ? metrics.join(",") : metrics || "page_follows,page_reach,page_post_engagements";
        const validTimeRange = time_range && time_range.since && time_range.until 
          ? time_range 
          : { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], until: new Date().toISOString().split('T')[0] };
        
        // Para insights de página, precisamos chamar cada métrica separadamente se houver erro
        // Tenta buscar insights - se uma métrica falhar, tenta individualmente
        let url = `https://graph.facebook.com/v24.0/${page_id}/insights?metric=${metricsStr}&period=day&since=${validTimeRange.since}&until=${validTimeRange.until}&access_token=${metaToken}`;
        
        let response = await fetch(url);
        let data = await response.json();

        // Se houver erro de métrica inválida, tenta buscar métricas individualmente
        if (data.error && data.error.message?.includes('valid insights metric')) {
          console.warn("⚠️ Alguma métrica inválida detectada, tentando métricas individuais...");
          const validMetrics = ['page_follows', 'page_reach', 'page_post_engagements'];
          const insightsResults = [];
          
          for (const metric of validMetrics) {
            try {
              const singleMetricUrl = `https://graph.facebook.com/v24.0/${page_id}/insights?metric=${metric}&period=day&since=${validTimeRange.since}&until=${validTimeRange.until}&access_token=${metaToken}`;
              const singleResponse = await fetch(singleMetricUrl);
              const singleData = await singleResponse.json();
              
              if (!singleData.error && singleData.data) {
                insightsResults.push(...singleData.data);
              }
            } catch (err) {
              console.warn(`⚠️ Erro ao buscar métrica ${metric}:`, err);
            }
          }
          
          return new Response(
            JSON.stringify({ insights: insightsResults }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (data.error) {
          return new Response(
            JSON.stringify({ error: data.error, insights: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ insights: data.data || [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar insights da página" }, insights: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get Page Posts
    if (action === "get-page-posts") {
      const { page_id, time_range } = body;

      if (!page_id) {
        return new Response(
          JSON.stringify({ error: { message: "page_id is required" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        // Primeiro precisa obter o access_token da página
        const pageUrl = `https://graph.facebook.com/v24.0/${page_id}?fields=access_token&access_token=${metaToken}`;
        const pageResponse = await fetch(pageUrl);
        const pageData = await pageResponse.json();

        if (pageData.error || !pageData.access_token) {
          return new Response(
            JSON.stringify({ error: { message: "Não foi possível obter o token de acesso da página" }, posts: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const pageAccessToken = pageData.access_token;
        const validTimeRange = time_range && time_range.since && time_range.until 
          ? time_range 
          : { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], until: new Date().toISOString().split('T')[0] };
        
        // Busca posts com insights básicos
        const postsUrl = `https://graph.facebook.com/v24.0/${page_id}/posts?fields=id,message,created_time,type,permalink_url,insights.metric(reach,post_engagements)&since=${validTimeRange.since}&until=${validTimeRange.until}&limit=100&access_token=${pageAccessToken}`;
        const postsResponse = await fetch(postsUrl);
        const postsData = await postsResponse.json();

        if (postsData.error) {
          return new Response(
            JSON.stringify({ error: postsData.error, posts: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Processa posts para incluir insights de forma mais acessível
        const processedPosts = (postsData.data || []).map((post: any) => {
          const insights: any = {};
          if (post.insights && post.insights.data) {
            post.insights.data.forEach((insight: any) => {
              if (insight.values && insight.values.length > 0) {
                insights[insight.name] = insight.values[0].value;
              }
            });
          }
          return {
            ...post,
            insights,
          };
        });

        return new Response(
          JSON.stringify({ posts: processedPosts }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar posts da página" }, posts: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get Instagram Insights
    if (action === "get-instagram-insights") {
      const { instagram_account_id, time_range, metrics } = body;

      if (!instagram_account_id) {
        return new Response(
          JSON.stringify({ error: { message: "instagram_account_id is required" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        // Métricas válidas para Instagram Business Account
        // Algumas métricas precisam de metric_type=total_value
        const metricsStr = Array.isArray(metrics) ? metrics.join(",") : metrics || "reach,follower_count,profile_views,total_interactions";
        const validTimeRange = time_range && time_range.since && time_range.until 
          ? time_range 
          : { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], until: new Date().toISOString().split('T')[0] };
        
        // Métricas que precisam de metric_type=total_value
        const metricsNeedingTotalValue = ['profile_views', 'website_clicks', 'total_interactions'];
        const metricsNeedingPeriod = ['reach', 'follower_count'];
        
        const insightsResults = [];
        
        // Busca métricas que precisam de period (dia a dia)
        for (const metric of metricsNeedingPeriod) {
          try {
            const periodUrl = `https://graph.facebook.com/v24.0/${instagram_account_id}/insights?metric=${metric}&period=day&since=${validTimeRange.since}&until=${validTimeRange.until}&access_token=${metaToken}`;
            const periodResponse = await fetch(periodUrl);
            const periodData = await periodResponse.json();
            
            if (!periodData.error && periodData.data) {
              console.log(`✅ Métrica ${metric} com period retornada:`, periodData.data);
              insightsResults.push(...periodData.data);
            } else if (periodData.error) {
              console.warn(`⚠️ Erro ao buscar ${metric} com period:`, periodData.error);
            }
          } catch (err) {
            console.warn(`⚠️ Erro ao buscar métrica ${metric}:`, err);
          }
        }
        
        // Busca métricas que precisam de metric_type=total_value (valor total agregado)
        // Para total_value, usamos timeframe ao invés de period/since/until
        for (const metric of metricsNeedingTotalValue) {
          try {
            // Calcula o número de dias entre since e until para usar como timeframe
            const sinceDate = new Date(validTimeRange.since);
            const untilDate = new Date(validTimeRange.until);
            const daysDiff = Math.ceil((untilDate.getTime() - sinceDate.getTime()) / (1000 * 60 * 60 * 24));
            
            // Usa timeframe baseado no número de dias (máximo 30 dias para total_value)
            let timeframe = 'last_30_days';
            if (daysDiff <= 7) {
              timeframe = 'last_7_days';
            } else if (daysDiff <= 30) {
              timeframe = 'last_30_days';
            } else {
              timeframe = 'last_30_days'; // Limita a 30 dias para total_value
            }
            
            const totalValueUrl = `https://graph.facebook.com/v24.0/${instagram_account_id}/insights?metric=${metric}&metric_type=total_value&timeframe=${timeframe}&access_token=${metaToken}`;
            const totalValueResponse = await fetch(totalValueUrl);
            const totalValueData = await totalValueResponse.json();
            
            if (!totalValueData.error && totalValueData.data) {
              console.log(`✅ Métrica ${metric} com total_value retornada:`, totalValueData.data);
              insightsResults.push(...totalValueData.data);
            } else if (totalValueData.error) {
              console.warn(`⚠️ Erro ao buscar ${metric} com total_value:`, totalValueData.error);
            }
          } catch (err) {
            console.warn(`⚠️ Erro ao buscar métrica ${metric} com total_value:`, err);
          }
        }
        
        console.log(`📊 Total de insights retornados para Instagram ${instagram_account_id}:`, insightsResults.length);
        
        return new Response(
          JSON.stringify({ insights: insightsResults }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar insights do Instagram" }, insights: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get Instagram Media
    if (action === "get-instagram-media") {
      const { instagram_account_id, time_range } = body;

      if (!instagram_account_id) {
        return new Response(
          JSON.stringify({ error: { message: "instagram_account_id is required" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const validTimeRange = time_range && time_range.since && time_range.until 
          ? time_range 
          : { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], until: new Date().toISOString().split('T')[0] };
        
        // Busca mídia do Instagram (impressions foi deprecado, usar reach e total_interactions)
        const mediaUrl = `https://graph.facebook.com/v24.0/${instagram_account_id}/media?fields=id,media_type,media_url,thumbnail_url,caption,permalink,timestamp,like_count,comments_count,insights.metric(reach,engagement)&since=${validTimeRange.since}&until=${validTimeRange.until}&limit=100&access_token=${metaToken}`;
        const mediaResponse = await fetch(mediaUrl);
        const mediaData = await mediaResponse.json();

        if (mediaData.error) {
          return new Response(
            JSON.stringify({ error: mediaData.error, media: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Processa mídia para incluir insights de forma mais acessível
        const processedMedia = (mediaData.data || []).map((item: any) => {
          const insights: any = {};
          if (item.insights && item.insights.data) {
            item.insights.data.forEach((insight: any) => {
              if (insight.values && insight.values.length > 0) {
                insights[insight.name] = insight.values[0].value;
              }
            });
          }
          return {
            ...item,
            insights,
          };
        });

        return new Response(
          JSON.stringify({ media: processedMedia }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar mídia do Instagram" }, media: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Publish Page Post
    if (action === "publish-page-post") {
      const { page_id, message, link, scheduled_publish_time } = body;

      if (!page_id) {
        return new Response(
          JSON.stringify({ error: { message: "page_id is required" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        // Primeiro precisa obter o access_token da página
        const pageUrl = `https://graph.facebook.com/v24.0/${page_id}?fields=access_token&access_token=${metaToken}`;
        const pageResponse = await fetch(pageUrl);
        const pageData = await pageResponse.json();

        if (pageData.error || !pageData.access_token) {
          return new Response(
            JSON.stringify({ error: { message: "Não foi possível obter o token de acesso da página" } }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const pageAccessToken = pageData.access_token;
        
        // Monta o body da requisição
        const postBody: any = {};
        if (message) postBody.message = message;
        if (link) postBody.link = link;
        if (scheduled_publish_time) postBody.scheduled_publish_time = scheduled_publish_time;

        const publishUrl = `https://graph.facebook.com/v24.0/${page_id}/feed?${new URLSearchParams(postBody).toString()}&access_token=${pageAccessToken}`;
        const publishResponse = await fetch(publishUrl, {
          method: 'POST',
        });
        const publishData = await publishResponse.json();

        if (publishData.error) {
          return new Response(
            JSON.stringify({ error: publishData.error, post_id: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ post_id: publishData.id, success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao publicar post na página" }, post_id: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Publish Instagram Content
    if (action === "publish-instagram-content") {
      const { instagram_account_id, image_url, caption, media_type } = body;

      if (!instagram_account_id) {
        return new Response(
          JSON.stringify({ error: { message: "instagram_account_id is required" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        // Instagram Graph API requer criação de container primeiro
        const containerUrl = `https://graph.facebook.com/v24.0/${instagram_account_id}/media?image_url=${encodeURIComponent(image_url)}&caption=${encodeURIComponent(caption || '')}&access_token=${metaToken}`;
        const containerResponse = await fetch(containerUrl, {
          method: 'POST',
        });
        const containerData = await containerResponse.json();

        if (containerData.error) {
          return new Response(
            JSON.stringify({ error: containerData.error, media_id: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const creationId = containerData.id;

        // Publica o conteúdo
        const publishUrl = `https://graph.facebook.com/v24.0/${instagram_account_id}/media_publish?creation_id=${creationId}&access_token=${metaToken}`;
        const publishResponse = await fetch(publishUrl, {
          method: 'POST',
        });
        const publishData = await publishResponse.json();

        if (publishData.error) {
          return new Response(
            JSON.stringify({ error: publishData.error, media_id: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ media_id: publishData.id, success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao publicar conteúdo no Instagram" }, media_id: null }),
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
        status: 200,
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

