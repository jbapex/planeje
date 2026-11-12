#!/usr/bin/env python3
"""Carga única da planilha do JR CAR no mini_crm do contato, casando pelo telefone."""

import json
import re
import subprocess
import sys
import zipfile
from datetime import datetime, timedelta
from xml.etree import ElementTree as ET

CLIENTE_ID = "bcba48ba-a1ef-411a-bd6e-65b4fadc1e6f"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def phone_digits(value):
    if value is None:
        return ""
    text = str(value).strip()
    if re.fullmatch(r"\d+(?:\.\d+)?(?:[eE][+-]?\d+)?", text):
        text = str(int(round(float(text))))
    return re.sub(r"\D", "", text)


def phone_key(value):
    digits = phone_digits(value)
    return digits[-8:] if len(digits) >= 8 else ""


def excel_date(value):
    try:
        serial = float(value)
    except (TypeError, ValueError):
        return None
    if serial < 20000 or serial > 80000:
        return None
    return (datetime(1899, 12, 30) + timedelta(days=serial)).isoformat(timespec="seconds")


def load_rows(path):
    z = zipfile.ZipFile(path)
    ss = []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    for si in root.findall("m:si", NS):
        ss.append("".join(t.text or "" for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")))

    def cell_value(cell):
        kind = cell.attrib.get("t")
        value = cell.find("m:v", NS)
        if kind == "s" and value is not None and value.text:
            return ss[int(value.text)]
        if value is not None:
            return value.text or ""
        return ""

    sheet = ET.fromstring(z.read("xl/worksheets/sheet2.xml"))
    rows = []
    for row in sheet.findall("m:sheetData/m:row", NS):
        number = int(row.attrib.get("r", "0"))
        if number < 4:
            continue
        cells = {}
        for cell in row.findall("m:c", NS):
            ref = cell.attrib.get("r", "")
            col = "".join(ch for ch in ref if ch.isalpha())
            cells[col] = cell_value(cell)
        if not (cells.get("D") or cells.get("E")):
            continue
        mini = {}
        if str(cells.get("F") or "").strip():
            mini["vendedor"] = str(cells["F"]).strip()
        if str(cells.get("G") or "").strip():
            mini["status"] = str(cells["G"]).strip()
        if str(cells.get("H") or "").strip():
            mini["revenda"] = str(cells["H"]).strip()
        if str(cells.get("I") or "").strip():
            mini["qualificado"] = str(cells["I"]).strip()
        if str(cells.get("J") or "").strip():
            try:
                mini["valor"] = float(cells["J"])
            except ValueError:
                pass
        if str(cells.get("K") or "").strip():
            mini["proxima_acao"] = str(cells["K"]).strip()
        if str(cells.get("L") or "").strip():
            mini["observacao"] = str(cells["L"]).strip()
        origem = str(cells.get("C") or "").strip()
        rows.append({
            "row": number,
            "key": phone_key(cells.get("E")),
            "digits": phone_digits(cells.get("E")),
            "nome": str(cells.get("D") or "").strip(),
            "origem": origem,
            "when": excel_date(cells.get("B")),
            "mini": mini,
        })
    return rows


def sql_quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def psql(sql):
    result = subprocess.run(
        ["docker", "exec", "-i", "supabase-db", "psql", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
        input=sql,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        raise SystemExit(result.returncode)
    return result.stdout


def main():
    path = sys.argv[1]
    sheet_rows = [row for row in load_rows(path) if row["nome"] or row["digits"]]
    used_jids = set()
    statements = [
        "BEGIN;",
        "UPDATE public.clientes SET nicho = 'Loja de Carros' "
        f"WHERE id = '{CLIENTE_ID}' AND (nicho IS NULL OR btrim(nicho) = '');",
    ]
    for row in sheet_rows:
        base = row["digits"] or f"sem-telefone-{row['row']}"
        jid = f"{base}@s.whatsapp.net"
        suffix = 2
        while jid in used_jids:
            jid = f"{base}~{suffix}@s.whatsapp.net"
            suffix += 1
        used_jids.add(jid)
        when = f"{row['when']}-03:00" if row["when"] else None
        tracking = {
            "sheet_import": "jr-car-2026-09-23",
            "sheet_origem": row["origem"] or "Não rastreada",
        }
        seen = "now()" if not when else sql_quote(when)
        statements.append(
            "INSERT INTO public.cliente_whatsapp_contact "
            "(cliente_id, from_jid, phone, sender_name, origin_source, tracking_data, first_seen_at, last_message_at, mini_crm) "
            f"VALUES ({sql_quote(CLIENTE_ID)}, {sql_quote(jid)}, {sql_quote(row['digits'])}, "
            f"{sql_quote(row['nome'])}, 'nao_identificado', {sql_quote(json.dumps(tracking, ensure_ascii=False))}::jsonb, "
            f"{seen}, {seen}, {sql_quote(json.dumps(row['mini'], ensure_ascii=False))}::jsonb) "
            "ON CONFLICT (cliente_id, from_jid) DO UPDATE SET "
            "sender_name = EXCLUDED.sender_name, "
            "mini_crm = EXCLUDED.mini_crm, "
            "tracking_data = EXCLUDED.tracking_data, "
            "first_seen_at = EXCLUDED.first_seen_at, "
            "last_message_at = EXCLUDED.last_message_at "
            "WHERE cliente_whatsapp_contact.tracking_data->>'sheet_import' = 'jr-car-2026-09-23' "
            "OR cliente_whatsapp_contact.mini_crm = '{}'::jsonb;"
        )
    statements.append("COMMIT;")
    psql("\n".join(statements))
    print(f"planilha={len(sheet_rows)} jids={len(used_jids)}")


if __name__ == "__main__":
    main()
