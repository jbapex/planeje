export const crmIaBasePath = workspace => workspace?.permissions?.customer === true ? '/cliente/crm-ia' : '/crm-ia';
