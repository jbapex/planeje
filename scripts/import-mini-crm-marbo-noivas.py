#!/usr/bin/env python3
"""Carga única da aba CRM da planilha da Marbô Noivas no mini_crm do contato.

Casa pelo telefone (últimos 8 dígitos). Linhas repetidas do mesmo telefone viram um só
contato. Contato já existente só ganha os campos da planilha: retorno e histórico ficam.
Não chama CAPI. Uso: import-mini-crm-marbo-noivas.py planilha.xlsx [--apply]
"""

import json
import re
import subprocess
import sys
import zipfile
from datetime import datetime, timedelta
from xml.etree import ElementTree as ET

CLIENTE_ID = "6911eb7e-4471-474f-831c-2b507823e790"
IMPORT_TAG = "marbo-noivas-2026-09-24"
M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
NS = {"m": M[1:-1]}

STATUSES = [
    {"key": "Novo Lead", "label": "Novo Lead", "color": "#3b82f6"},
    {"key": "Em Atendimento", "label": "Em Atendimento", "color": "#0284c7"},
    {"key": "Lead Qualificado", "label": "Lead Qualificado", "color": "#d97706"},
    {"key": "Agendado", "label": "Agendado", "color": "#7c3aed"},
    {"key": "Em Negociação", "label": "Em Negociação", "color": "#ea580c"},
    {"key": "Venda Realizada", "label": "Venda Realizada", "color": "#059669"},
    {"key": "Venda Perdida", "label": "Venda Perdida", "color": "#e11d48"},
    {"key": "Não Respondeu", "label": "Não Respondeu", "color": "#64748b"},
    {"key": "Não Compareceu", "label": "Não Compareceu", "color": "#be123c"},
    {"key": "Reagendado", "label": "Reagendado", "color": "#4f46e5"},
    {"key": "Lead Desqualificado", "label": "Lead Desqualificado", "color": "#78716c"},
]
COLUMNS = [
    {"key": "vendedor", "label": "Consultora", "kind": "text", "onCard": False},
    {"key": "data_agendamento", "label": "Data Agendamento", "kind": "day", "onCard": True},
    {"key": "compareceu", "label": "Compareceu", "kind": "simnao", "onCard": False},
    {"key": "valor", "label": "Valor Venda", "kind": "money", "onCard": False},
    {"key": "proxima_acao", "label": "Próxima Ação", "kind": "text", "onCard": False},
    {"key": "observacao", "label": "Observação", "kind": "text", "onCard": False},
]
CADENCE = {"inicial": [0, 1, 2, 3, 5], "repescagem": [30, 5], "sem_resposta": ""}
STATUS_KEYS = {s["key"].lower(): s["key"] for s in STATUSES}


def fold(text):
    return str(text or "").strip()


def phone_digits(value):
    text = fold(value)
    if re.fullmatch(r"\d+(?:\.\d+)?(?:[eE][+-]?\d+)?", text):
        text = str(int(round(float(text))))
    digits = re.sub(r"\D", "", text)
    if len(digits) in (10, 11):
        digits = "55" + digits
    return digits


def excel_dt(value, day_only=False):
    try:
        serial = float(value)
    except (TypeError, ValueError):
        return None
    if serial < 20000 or serial > 80000:
        return None
    when = datetime(1899, 12, 30) + timedelta(days=serial)
    return when.date().isoformat() if day_only else when.isoformat(timespec="seconds")


def load_rows(path):
    z = zipfile.ZipFile(path)
    ss = ["".join(t.text or "" for t in si.iter(M + "t"))
          for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS)]

    def cell_value(cell):
        value = cell.find("m:v", NS)
        if cell.attrib.get("t") == "s" and value is not None and value.text:
            return ss[int(value.text)]
        return value.text if value is not None and value.text else ""

    sheet = ET.fromstring(z.read("xl/worksheets/sheet2.xml"))
    rows = []
    for row in sheet.findall("m:sheetData/m:row", NS):
        number = int(row.attrib.get("r", "0"))
        if number < 4:
            continue
        cells = {}
        for cell in row.findall("m:c", NS):
            col = "".join(ch for ch in cell.attrib.get("r", "") if ch.isalpha())
            cells[col] = fold(cell_value(cell))
        if cells.get("D") or cells.get("E"):
            rows.append((number, cells))
    return rows


def mini_from_cells(cells):
    mini = {}
    status_raw = cells.get("G", "")
    compareceu = cells.get("I", "")
    if cells.get("F"):
        mini["vendedor"] = cells["F"]
    if status_raw:
        mini["status"] = STATUS_KEYS.get(status_raw.lower(), status_raw)
    day = excel_dt(cells.get("H"), day_only=True)
    if day:
        mini["data_agendamento"] = day
    low = compareceu.lower()
    if low == "sim":
        mini["compareceu"] = "Sim"
    elif low in ("não", "nao"):
        mini["compareceu"] = "Não"
    elif low.startswith("reagend"):
        mini["compareceu"] = "Não"
        if not status_raw:
            mini["status"] = "Reagendado"
    if cells.get("J"):
        try:
            amount = float(cells["J"].replace(",", "."))
            if amount > 0:
                mini["valor"] = amount
        except ValueError:
            pass
    if cells.get("K"):
        mini["proxima_acao"] = cells["K"]
    obs = cells.get("L", "")
    if obs and obs.upper() != "REPETIDO":
        mini["observacao"] = obs
    return mini


def merge_group(items):
    """Primeira linha com status manda; as outras só preenchem o que falta."""
    items = sorted(items, key=lambda it: (0 if it["mini"].get("status") else 1, it["row"]))
    head = dict(items[0])
    mini = dict(head["mini"])
    for other in items[1:]:
        for key, value in other["mini"].items():
            if key == "observacao" and mini.get("observacao") and value != mini["observacao"]:
                mini["observacao"] = f"{mini['observacao']} | {value}"
            elif key not in mini:
                mini[key] = value
    head["mini"] = mini
    whens = [it["when"] for it in items if it["when"]]
    head["when"] = min(whens) if whens else None
    if not head["origem"]:
        head["origem"] = next((it["origem"] for it in items if it["origem"]), "")
    return head


def sql_quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def psql(sql):
    result = subprocess.run(
        ["docker", "exec", "-i", "supabase-db", "psql", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
        input=sql, text=True, capture_output=True,
    )
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        raise SystemExit(result.returncode)
    return result.stdout


def main():
    path = sys.argv[1]
    apply = "--apply" in sys.argv[2:]
    raw = load_rows(path)
    skipped = 0
    groups = {}
    for number, cells in raw:
        digits = phone_digits(cells.get("E"))
        nome = cells.get("D", "")
        if not nome or len(digits) < 10:
            skipped += 1
            continue
        item = {
            "row": number,
            "digits": digits,
            "key": digits[-8:],
            "nome": nome,
            "origem": cells.get("C", ""),
            "when": excel_dt(cells.get("B")),
            "mini": mini_from_cells(cells),
        }
        groups.setdefault(item["key"], []).append(item)
    leads = [merge_group(items) for items in groups.values()]

    existing = {}
    out = psql(
        "SELECT id, coalesce(phone,''), from_jid FROM public.cliente_whatsapp_contact "
        f"WHERE cliente_id = {sql_quote(CLIENTE_ID)};"
    )
    for line in out.splitlines():
        cid, phone, jid = line.split("|", 2)
        key = phone_digits(phone or jid.split("@")[0])[-8:]
        if len(key) == 8:
            existing.setdefault(key, cid)

    sellers = sorted({lead["mini"]["vendedor"] for lead in leads if lead["mini"].get("vendedor")})
    statements = ["BEGIN;"]
    inserted = updated = sales = 0
    for lead in leads:
        mini = lead["mini"]
        sold = mini.get("status") == "Venda Realizada"
        if sold:
            sales += 1
        amount = mini.get("valor") if sold else None
        commercial = ""
        if sold:
            commercial = f", qualificado = true, comprou = true, valor_venda = {amount if amount else 'valor_venda'}"
        mini_json = sql_quote(json.dumps(mini, ensure_ascii=False)) + "::jsonb"
        tracking_patch = sql_quote(json.dumps(
            {"sheet_import": IMPORT_TAG, "sheet_origem": lead["origem"] or "Não rastreada"}, ensure_ascii=False,
        )) + "::jsonb"
        seen = sql_quote(f"{lead['when']}-03:00") if lead["when"] else "now()"
        cid = existing.get(lead["key"])
        if cid:
            updated += 1
            statements.append(
                "UPDATE public.cliente_whatsapp_contact SET "
                f"mini_crm = coalesce(mini_crm, '{{}}'::jsonb) || {mini_json}, "
                "sender_name = coalesce(nullif(btrim(sender_name), ''), "
                f"{sql_quote(lead['nome'])}), "
                "tracking_data = CASE WHEN tracking_data ? 'sheet_origem' OR coalesce(origin_source,'') <> 'nao_identificado' "
                f"THEN tracking_data ELSE coalesce(tracking_data, '{{}}'::jsonb) || {tracking_patch} END, "
                f"first_seen_at = least(first_seen_at, {seen}), updated_at = now(){commercial} "
                f"WHERE id = {sql_quote(cid)} AND cliente_id = {sql_quote(CLIENTE_ID)};"
            )
            continue
        inserted += 1
        cols = "cliente_id, from_jid, phone, sender_name, origin_source, tracking_data, first_seen_at, last_message_at, mini_crm"
        vals = (
            f"{sql_quote(CLIENTE_ID)}, {sql_quote(lead['digits'] + '@s.whatsapp.net')}, {sql_quote(lead['digits'])}, "
            f"{sql_quote(lead['nome'])}, 'nao_identificado', {tracking_patch}, {seen}, {seen}, {mini_json}"
        )
        if sold:
            cols += ", qualificado, comprou, valor_venda"
            vals += f", true, true, {amount if amount else 'NULL'}"
        statements.append(f"INSERT INTO public.cliente_whatsapp_contact ({cols}) VALUES ({vals});")

    statements.append(
        "INSERT INTO public.mini_crm_config (cliente_id, statuses, columns, sellers, cadence, updated_at) VALUES ("
        f"{sql_quote(CLIENTE_ID)}, {sql_quote(json.dumps(STATUSES, ensure_ascii=False))}::jsonb, "
        f"{sql_quote(json.dumps(COLUMNS, ensure_ascii=False))}::jsonb, "
        f"{sql_quote(json.dumps(sellers, ensure_ascii=False))}::jsonb, "
        f"{sql_quote(json.dumps(CADENCE))}::jsonb, now()) "
        "ON CONFLICT (cliente_id) DO UPDATE SET statuses = EXCLUDED.statuses, columns = EXCLUDED.columns, "
        "cadence = EXCLUDED.cadence, updated_at = now(), "
        "sellers = CASE WHEN jsonb_array_length(mini_crm_config.sellers) > 0 THEN mini_crm_config.sellers ELSE EXCLUDED.sellers END;"
    )
    statements.append("COMMIT;" if apply else "ROLLBACK;")
    psql("\n".join(statements))
    print(json.dumps({
        "planilha": len(raw), "pulados": skipped, "repetidos_unidos": len(raw) - skipped - len(leads),
        "leads": len(leads), "inseridos": inserted, "atualizados": updated, "vendas": sales,
        "consultoras": len(sellers), "gravado": apply,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
