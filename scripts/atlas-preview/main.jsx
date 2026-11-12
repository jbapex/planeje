import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AtlasPage from '@/components/pages/AtlasPage';
createRoot(document.getElementById('root')).render(<MemoryRouter><AtlasPage /></MemoryRouter>);
