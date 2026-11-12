import './media-fixture.js';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import AtlasTeamAssistant from '@/components/atlas/AtlasTeamAssistant';
import AtlasPage from '@/components/pages/AtlasPage';
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/assistant/atlas']}><AtlasPage/><AtlasTeamAssistant/></MemoryRouter>);
