import React from 'react';
import{createRoot}from'react-dom/client';
import{MemoryRouter}from'react-router-dom';
import '@/index.css';
import AtlasEventPanel from '@/components/atlas/AtlasEventPanel';
import AtlasDemandCentral from '@/components/atlas/AtlasDemandCentral';
createRoot(document.getElementById('root')).render(<MemoryRouter><div style={{maxWidth:1100,margin:'20px auto',padding:12}}><p style={{fontSize:12,color:'#8a739c'}}>PRÉVIA FICTÍCIA · sem banco, IA ou mensagens reais</p><h1 style={{fontSize:24}}>Minha caixa · Atlas</h1>{new URLSearchParams(location.search).has('central')?<AtlasDemandCentral/>:<AtlasEventPanel/>}</div></MemoryRouter>);
