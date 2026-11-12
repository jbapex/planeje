export const owner='00000000-0000-4000-8000-000000000001',account='00000000-0000-4000-8000-000000000002',executor='00000000-0000-4000-8000-000000000003';
export const role=new URLSearchParams(location.search).get('role')||'owner';
export const useAuth=()=>({user:{id:role==='owner'?owner:account},profile:{full_name:'Pessoa fictícia'}});
