import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import AtlasPage from '@/components/pages/AtlasPage';
import AtlasTeamAssistant from '@/components/atlas/AtlasTeamAssistant';
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/assistant/atlas?view=conversation']}><AtlasPage/><AtlasTeamAssistant/></MemoryRouter>);
