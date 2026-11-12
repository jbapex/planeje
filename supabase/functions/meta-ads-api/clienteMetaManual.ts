const GRAPH_VERSION = "v24.0";

export const CLIENTE_META_MANUAL_ACTIONS = new Set([
  "validate-cliente-meta-token",
  "list-cliente-meta-token-sources",
  "reuse-cliente-meta-token",
  "discover-cliente-meta-assets",
  "activate-cliente-meta-connection",
  "test-cliente-meta-connection",
]);

function json(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeId(value: unknown) {
  return asText(value).replace(/\s/g, "");
}

function tokenLast4(token: string) {
  const secret = asText(token);
  return secret.length >= 4 ? secret.slice(-4) : "";
}

function clienteIdFromCtwaSecretName(name: string) {
  const prefix = "META_CTWA_CLIENT_";
  const raw = asText(name);
  if (!raw.startsWith(prefix)) return "";
  const id = raw.slice(prefix.length).replace(/_/g, "-").toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
    ? id
    : "";
}

function connectionObject(row: any) {
  return row?.meta_rastreamento && typeof row.meta_rastreamento === "object"
    ? row.meta_rastreamento
    : {};
}

function reuseCredentialPatch(sourceConn: Record<string, unknown>, destConn: Record<string, unknown>) {
  const destAccounts = Array.isArray(destConn.adAccountIds) ? destConn.adAccountIds : [];
  const destNamed = Array.isArray(destConn.adAccounts) ? destConn.adAccounts : [];
  return {
    status: "draft",
    credentialLabel: asText(sourceConn.credentialLabel) || asText(destConn.credentialLabel) || "Token BM da agência",
    tokenLast4: asText(sourceConn.tokenLast4),
    userName: asText(sourceConn.userName),
    businessId: asText(destConn.businessId) || asText(sourceConn.businessId),
    businessName: asText(destConn.businessName) || asText(sourceConn.businessName),
    adAccountIds: destAccounts,
    adAccounts: destNamed,
    pixelId: asText(destConn.pixelId),
    pixelName: asText(destConn.pixelName),
    pageId: asText(destConn.pageId),
    pageName: asText(destConn.pageName),
    ownerBusinessManagerId: asText(destConn.ownerBusinessManagerId),
    testMessage: "",
  };
}

function parseAdAccountIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(",") : asText(value);
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (/^\d+$/.test(item) ? `act_${item}` : item))
        .map((item) => item.replace(/^act_/i, "act_"))
        .filter((item) => /^act_\d+$/i.test(item)),
    ),
  ];
}

function graphErrorMessage(error: any) {
  return asText(error?.error_user_msg || error?.message || error) || "A Meta recusou a chamada.";
}

async function graphGet(pathAndQuery: string, token: string) {
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${pathAndQuery}${sep}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  return res.json();
}

async function graphList(path: string, fields: string, token: string) {
  const items: any[] = [];
  let url:
    | string
    | null =
      `https://graph.facebook.com/${GRAPH_VERSION}/${path}?fields=${encodeURIComponent(fields)}&limit=200&access_token=${encodeURIComponent(token)}`;
  let lastError: any = null;
  for (let page = 0; page < 5 && url; page += 1) {
    const jsonBody = await fetch(url).then((res) => res.json());
    if (jsonBody?.error) {
      lastError = jsonBody.error;
      break;
    }
    if (Array.isArray(jsonBody?.data)) items.push(...jsonBody.data);
    url = jsonBody?.paging?.next || null;
  }
  return { data: items, error: lastError };
}

function mapNamed(items: any[], extra: Record<string, unknown> = {}) {
  const out = new Map<string, { id: string; name: string } & Record<string, unknown>>();
  for (const item of items || []) {
    const id = normalizeId(item?.id);
    const name = asText(item?.name) || id;
    if (!id || out.has(id)) continue;
    out.set(id, { id, name, ...extra });
  }
  return [...out.values()];
}

async function readClientToken(supabase: any, clienteId: string) {
  const name = `META_CTWA_CLIENT_${clienteId.replace(/-/g, "_")}`;
  const { data: row } = await supabase
    .from("app_secrets")
    .select("secret_value")
    .eq("name", name)
    .maybeSingle();
  if (row?.secret_value && String(row.secret_value).trim().length > 20) {
    return String(row.secret_value).trim();
  }
  const { data } = await supabase.rpc("get_encrypted_secret", { p_secret_name: name });
  if (data && String(data).trim().length > 20) return String(data).trim();
  return null;
}

async function saveClientToken(
  supabase: any,
  clienteId: string,
  token: string,
  businessId?: string,
) {
  const { error } = await supabase.rpc("set_cliente_meta_ctwa_token", {
    p_cliente_id: clienteId,
    p_token: token,
    p_business_id: businessId || null,
    p_update_token: true,
  });
  if (error) throw error;
}

async function readClienteRow(supabase: any, clienteId: string) {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, empresa, nome_contato, meta_ctwa_business_id, meta_rastreamento")
    .eq("id", clienteId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function writeConnection(supabase: any, clienteId: string, patch: Record<string, unknown>) {
  const row = await readClienteRow(supabase, clienteId);
  const current =
    row?.meta_rastreamento && typeof row.meta_rastreamento === "object"
      ? row.meta_rastreamento
      : {};
  const next = { ...current, ...patch, mode: "manual" };
  const { error } = await supabase
    .from("clientes")
    .update({
      meta_rastreamento: next,
      meta_ctwa_business_id: patch.businessId || row?.meta_ctwa_business_id || null,
    })
    .eq("id", clienteId);
  if (error) throw error;
  return next;
}

async function inspectToken(token: string) {
  const me = await graphGet("me?fields=id,name", token);
  if (me?.error) {
    return { connected: false, error: me.error, user: null, permissions: [], businesses: [] };
  }
  const [permJson, bizJson] = await Promise.all([
    graphGet("me/permissions", token),
    graphList("me/businesses", "id,name,verification_status", token),
  ]);
  const permissions = (permJson?.data || [])
    .filter((row: any) => row?.status === "granted")
    .map((row: any) => asText(row.permission))
    .filter(Boolean);
  return {
    connected: true,
    error: null,
    user: { id: asText(me.id), name: asText(me.name) || asText(me.id) },
    permissions,
    businesses: mapNamed(bizJson.data),
    businessListError: bizJson.error ? graphErrorMessage(bizJson.error) : null,
  };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const out = new Map<string, T>();
  for (const item of items || []) {
    if (!item?.id || out.has(item.id)) continue;
    out.set(item.id, item);
  }
  return [...out.values()];
}

async function discoverAccountDestinations(token: string, adAccountIds: string[]) {
  const ids = adAccountIds.slice(0, 12);
  const pixelItems: { id: string; name: string; adAccountId: string }[] = [];
  const pageItems: { id: string; name: string; adAccountId: string }[] = [];
  await Promise.all(
    ids.map(async (accountId) => {
      const [pix, promote, assigned] = await Promise.all([
        graphList(`${encodeURIComponent(accountId)}/adspixels`, "id,name", token),
        graphList(`${encodeURIComponent(accountId)}/promote_pages`, "id,name", token),
        graphList(`${encodeURIComponent(accountId)}/assigned_pages`, "id,name", token),
      ]);
      pixelItems.push(...mapNamed(pix.data, { adAccountId: accountId }));
      pageItems.push(
        ...mapNamed([...promote.data, ...assigned.data], { adAccountId: accountId }),
      );
    }),
  );
  return {
    pixels: uniqueById(pixelItems),
    pages: uniqueById(pageItems),
  };
}

async function discoverAssets(token: string, businessId: string | null, adAccountIds: string[] = []) {
  const businesses: { id: string; name: string }[] = [];
  let selectedBusiness: { id: string; name: string } | null = null;

  const listed = await graphList("me/businesses", "id,name,verification_status", token);
  businesses.push(...mapNamed(listed.data));

  if (businessId) {
    const biz = await graphGet(`${encodeURIComponent(businessId)}?fields=id,name,verification_status`, token);
    if (biz?.error) {
      return {
        ok: false,
        error: { message: graphErrorMessage(biz.error), code: "INVALID_BUSINESS" },
        businesses,
        adAccounts: [],
        pixels: [],
        pages: [],
      };
    }
    selectedBusiness = { id: asText(biz.id) || businessId, name: asText(biz.name) || businessId };
    if (!businesses.some((item) => item.id === selectedBusiness!.id)) {
      businesses.unshift(selectedBusiness);
    }
  } else {
    selectedBusiness = businesses[0] || null;
  }

  const bm = selectedBusiness?.id || "";
  const [ownedAccounts, clientAccounts, bmAccounts, meAccounts] = bm
    ? await Promise.all([
        graphList(`${encodeURIComponent(bm)}/owned_ad_accounts`, "id,name,account_status,currency", token),
        graphList(`${encodeURIComponent(bm)}/client_ad_accounts`, "id,name,account_status,currency", token),
        graphList(`${encodeURIComponent(bm)}/ad_accounts`, "id,name,account_status,currency", token),
        graphList("me/adaccounts", "id,name,account_id,currency", token),
      ])
    : await Promise.all([
        Promise.resolve({ data: [], error: null }),
        Promise.resolve({ data: [], error: null }),
        Promise.resolve({ data: [], error: null }),
        graphList("me/adaccounts", "id,name,account_id,currency", token),
      ]);

  const fromBm = mapNamed(
    [...ownedAccounts.data, ...clientAccounts.data, ...bmAccounts.data],
    { businessId: bm || null },
  );
  const fromMe = mapNamed(
    meAccounts.data.map((row: any) => ({
      id: row.id || (row.account_id ? `act_${row.account_id}` : ""),
      name: row.name,
    })),
    { businessId: bm || null },
  );
  const adAccounts = fromBm.length ? fromBm : fromMe;
  const scopedIds = adAccountIds.filter((id) => /^act_\d+$/i.test(id));
  const destinations = scopedIds.length
    ? await discoverAccountDestinations(token, scopedIds)
    : { pixels: [], pages: [] };

  return {
    ok: true,
    error: null,
    businesses,
    selectedBusiness,
    adAccounts,
    pixels: destinations.pixels,
    pages: destinations.pages,
  };
}

async function confirmAsset(token: string, id: string, label: string) {
  const jsonBody = await graphGet(`${encodeURIComponent(id)}?fields=id,name`, token);
  if (jsonBody?.error) {
    return { ok: false as const, error: graphErrorMessage(jsonBody.error), label };
  }
  return {
    ok: true as const,
    id: asText(jsonBody.id) || id,
    name: asText(jsonBody.name) || id,
    label,
  };
}

export async function handleClienteMetaManual(input: {
  supabase: any;
  action: string;
  body: any;
  corsHeaders: Record<string, string>;
}) {
  const { supabase, action, body, corsHeaders } = input;
  const clienteId = asText(body?.clienteId);
  if (!clienteId) {
    return json(corsHeaders, {
      ok: false,
      error: { message: "clienteId é obrigatório", code: "MISSING_CLIENTE_ID" },
    });
  }

  if (action === "validate-cliente-meta-token") {
    const incoming = asText(body?.accessToken);
    const saved = await readClientToken(supabase, clienteId);
    const token = incoming || saved;
    if (!token || token.length < 20) {
      return json(corsHeaders, {
        ok: false,
        connected: false,
        error: { message: "Cole o token permanente do System User.", code: "MISSING_TOKEN" },
      });
    }
    const inspect = await inspectToken(token);
    if (!inspect.connected) {
      return json(corsHeaders, {
        ok: false,
        connected: false,
        error: {
          message: graphErrorMessage(inspect.error),
          code: inspect.error?.code || "INVALID_TOKEN",
        },
      });
    }
    if (incoming) {
      await saveClientToken(supabase, clienteId, incoming);
    }
    const connection = await writeConnection(supabase, clienteId, {
      status: "draft",
      credentialLabel: asText(body?.credentialLabel) || "Token BM do cliente",
      tokenLast4: tokenLast4(token),
      validatedAt: new Date().toISOString(),
      userName: inspect.user?.name || "",
      testMessage: "",
    });
    const discovery = await discoverAssets(token, asText(body?.businessId) || null);
    return json(corsHeaders, {
      ok: true,
      connected: true,
      tokenLast4: tokenLast4(token),
      user: inspect.user,
      permissions: inspect.permissions,
      connection,
      discovery,
    });
  }

  if (action === "list-cliente-meta-token-sources") {
    const { data: secrets, error: secretsError } = await supabase
      .from("app_secrets")
      .select("name, secret_value, updated_at")
      .like("name", "META_CTWA_CLIENT_%");
    if (secretsError) throw secretsError;
    const secretMeta = new Map<string, { last4: string; updatedAt: unknown }>();
    for (const row of secrets || []) {
      const id = clienteIdFromCtwaSecretName(row.name);
      const token = asText(row?.secret_value);
      if (!id || token.length <= 20) continue;
      secretMeta.set(id, { last4: tokenLast4(token), updatedAt: row.updated_at });
    }
    const sourceIds = [...secretMeta.keys()].filter((id) => id !== clienteId);
    if (!sourceIds.length) {
      return json(corsHeaders, { ok: true, sources: [] });
    }
    const { data: clientes, error: clientesError } = await supabase
      .from("clientes")
      .select("id, empresa, nome_contato, meta_ctwa_business_id, meta_ctwa_token_updated_at, meta_rastreamento")
      .in("id", sourceIds);
    if (clientesError) throw clientesError;
    const sources = (clientes || [])
      .map((row: any) => {
        const conn = connectionObject(row);
        const secret = secretMeta.get(row.id);
        return {
          cliente_id: row.id,
          cliente_nome: asText(row.empresa) || asText(row.nome_contato) || row.id,
          credential_label: asText(conn.credentialLabel) || "Token BM do cliente",
          token_last4: asText(conn.tokenLast4) || secret?.last4 || "",
          business_id: asText(row.meta_ctwa_business_id) || asText(conn.businessId),
          business_name: asText(conn.businessName),
          status: asText(conn.status),
          token_updated_at: row.meta_ctwa_token_updated_at || secret?.updatedAt || null,
        };
      })
      .filter((row: any) => row.token_last4)
      .sort((a: any, b: any) => String(b.token_updated_at || "").localeCompare(String(a.token_updated_at || "")));
    return json(corsHeaders, { ok: true, sources });
  }

  if (action === "reuse-cliente-meta-token") {
    const sourceClienteId = asText(body?.sourceClienteId || body?.source_cliente_id);
    if (!sourceClienteId) {
      return json(corsHeaders, {
        ok: false,
        error: { message: "Escolha uma conta já conectada para reaproveitar o token.", code: "MISSING_SOURCE" },
      });
    }
    if (sourceClienteId === clienteId) {
      return json(corsHeaders, {
        ok: false,
        error: { message: "Escolha outra conta — origem e destino são o mesmo cliente.", code: "SAME_CLIENTE" },
      });
    }
    const sourceToken = await readClientToken(supabase, sourceClienteId);
    if (!sourceToken) {
      return json(corsHeaders, {
        ok: false,
        error: {
          message: "A conta escolhida não tem token Meta salvo. Cole o token permanente nesta tela.",
          code: "SOURCE_TOKEN_MISSING",
        },
      });
    }
    const inspect = await inspectToken(sourceToken);
    if (!inspect.connected) {
      return json(corsHeaders, {
        ok: false,
        connected: false,
        error: {
          message: graphErrorMessage(inspect.error),
          code: inspect.error?.code || "INVALID_TOKEN",
        },
      });
    }
    const sourceRow = await readClienteRow(supabase, sourceClienteId);
    const destRow = await readClienteRow(supabase, clienteId);
    const sourceConn = connectionObject(sourceRow);
    const destConn = connectionObject(destRow);
    const sourceBusinessId =
      asText(destConn.businessId) ||
      asText(sourceRow?.meta_ctwa_business_id) ||
      asText(sourceConn.businessId);
    await saveClientToken(supabase, clienteId, sourceToken, sourceBusinessId);
    const patch = reuseCredentialPatch(
      {
        ...sourceConn,
        tokenLast4: tokenLast4(sourceToken),
        userName: inspect.user?.name || asText(sourceConn.userName),
        businessId: sourceBusinessId,
        businessName: asText(sourceConn.businessName),
      },
      destConn,
    );
    const connection = await writeConnection(supabase, clienteId, {
      ...patch,
      reusedFromClienteId: sourceClienteId,
      validatedAt: new Date().toISOString(),
    });
    const discovery = await discoverAssets(sourceToken, asText(connection.businessId) || sourceBusinessId || null);
    return json(corsHeaders, {
      ok: true,
      connected: true,
      reused: true,
      tokenLast4: tokenLast4(sourceToken),
      user: inspect.user,
      permissions: inspect.permissions,
      reusedFrom: {
        clienteId: sourceClienteId,
        clienteNome: asText(sourceRow?.empresa) || asText(sourceRow?.nome_contato) || sourceClienteId,
      },
      connection,
      discovery,
    });
  }

  const token = await readClientToken(supabase, clienteId);
  if (!token) {
    return json(corsHeaders, {
      ok: false,
      error: {
        message: "Token Meta do cliente não configurado. Valide e proteja o token primeiro.",
        code: "CLIENT_META_TOKEN_NOT_CONFIGURED",
      },
    });
  }

  if (action === "discover-cliente-meta-assets") {
    const businessId = normalizeId(body?.businessId);
    const adAccountIds = parseAdAccountIds(body?.adAccountIds);
    const discovery = await discoverAssets(token, businessId || null, adAccountIds);
    if (!discovery.ok) {
      return json(corsHeaders, { ok: false, error: discovery.error, discovery });
    }
    return json(corsHeaders, { ok: true, discovery });
  }

  if (action === "activate-cliente-meta-connection") {
    const businessId = normalizeId(body?.businessId);
    const pixelId = normalizeId(body?.pixelId);
    const pageId = normalizeId(body?.pageId);
    const ownerBusinessManagerId = normalizeId(body?.ownerBusinessManagerId);
    const adAccountIds = parseAdAccountIds(body?.adAccountIds);
    if (!businessId || !pixelId || !pageId || adAccountIds.length === 0) {
      return json(corsHeaders, {
        ok: false,
        error: {
          message: "Informe BM, pelo menos uma conta, Pixel/Dataset e Página.",
          code: "INCOMPLETE_CONNECTION",
        },
      });
    }
    const [biz, pixel, page, ...accounts] = await Promise.all([
      confirmAsset(token, businessId, "BM"),
      confirmAsset(token, pixelId, "Pixel"),
      confirmAsset(token, pageId, "Página"),
      ...adAccountIds.slice(0, 12).map((id) => confirmAsset(token, id, "Conta")),
    ]);
    const failed = [biz, pixel, page, ...accounts].find((item) => !item.ok);
    if (failed && "error" in failed) {
      await writeConnection(supabase, clienteId, {
        status: "error",
        testMessage: `${failed.label}: ${failed.error}`,
      });
      return json(corsHeaders, {
        ok: false,
        error: { message: `${failed.label}: ${failed.error}`, code: "ASSET_INVALID" },
      });
    }
    const namedAccounts = accounts
      .filter((item): item is { ok: true; id: string; name: string; label: string } => item.ok)
      .map((item) => ({ id: item.id, name: item.name }));
    const connection = await writeConnection(supabase, clienteId, {
      status: "active",
      credentialLabel: asText(body?.credentialLabel) || "Token BM do cliente",
      businessId: biz.ok ? biz.id : businessId,
      businessName: biz.ok ? biz.name : businessId,
      pixelId: pixel.ok ? pixel.id : pixelId,
      pixelName: pixel.ok ? pixel.name : pixelId,
      pageId: page.ok ? page.id : pageId,
      pageName: page.ok ? page.name : pageId,
      ownerBusinessManagerId: ownerBusinessManagerId || null,
      adAccountIds,
      adAccounts: namedAccounts,
      testedAt: new Date().toISOString(),
      testMessage: "Estrutura validada na Meta. Destino gravado nos canais já ligados.",
    });
    await supabase
      .from("cliente_whatsapp_config")
      .update({
        meta_page_id: page.ok ? page.id : pageId,
        meta_dataset_id: pixel.ok ? pixel.id : pixelId,
        updated_at: new Date().toISOString(),
      })
      .eq("cliente_id", clienteId);
    return json(corsHeaders, { ok: true, connection });
  }

  if (action === "test-cliente-meta-connection") {
    const row = await readClienteRow(supabase, clienteId);
    const saved =
      row?.meta_rastreamento && typeof row.meta_rastreamento === "object"
        ? row.meta_rastreamento
        : {};
    const businessId = normalizeId(body?.businessId || saved.businessId || row?.meta_ctwa_business_id);
    const pixelId = normalizeId(body?.pixelId || saved.pixelId);
    const pageId = normalizeId(body?.pageId || saved.pageId);
    const me = await inspectToken(token);
    if (!me.connected) {
      const message = graphErrorMessage(me.error);
      await writeConnection(supabase, clienteId, {
        status: "error",
        testedAt: new Date().toISOString(),
        testMessage: message,
      });
      return json(corsHeaders, { ok: false, connected: false, error: { message, code: "INVALID_TOKEN" } });
    }
    const checks = [];
    if (businessId) checks.push(confirmAsset(token, businessId, "BM"));
    if (pixelId) checks.push(confirmAsset(token, pixelId, "Pixel"));
    if (pageId) checks.push(confirmAsset(token, pageId, "Página"));
    const results = await Promise.all(checks);
    const failed = results.find((item) => !item.ok);
    if (failed && "error" in failed) {
      const message = `${failed.label}: ${failed.error}`;
      await writeConnection(supabase, clienteId, {
        status: "error",
        testedAt: new Date().toISOString(),
        testMessage: message,
      });
      return json(corsHeaders, { ok: false, connected: false, error: { message, code: "TEST_FAILED" } });
    }
    const message = "Token, BM, Pixel e Página respondem na Meta.";
    const connection = await writeConnection(supabase, clienteId, {
      status: saved.status === "active" ? "active" : "draft",
      testedAt: new Date().toISOString(),
      testMessage: message,
      userName: me.user?.name || saved.userName || "",
    });
    return json(corsHeaders, { ok: true, connected: true, message, connection, user: me.user });
  }

  return json(corsHeaders, {
    ok: false,
    error: { message: `Unknown action: ${action}` },
  });
}
