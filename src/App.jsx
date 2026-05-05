import React, { useEffect, useState } from 'react';
import { useAppContext } from './AppContext';
import { execSQL } from './api';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './components/Login';

import DashboardView from './views/DashboardView';
import ClientesView from './views/ClientesView';
import InteraccionesView from './views/InteraccionesView';
import ImportacionView from './views/ImportacionView';
import VisorView from './views/VisorView';
import TeamView from './views/TeamView';
import AdminView from './views/AdminView';
import MonitorView from './views/MonitorView';

export default function App() {
    const { state, updateState, showToast, forceSilentSync } = useAppContext();
    const [firstLoad, setFirstLoad] = useState(true);

    useEffect(() => {
        initAuthAndFetch();
    }, []);

    const initAuthAndFetch = async () => {
        const saved = localStorage.getItem('crm_session_native');
        if (saved) {
            try { 
                const u = JSON.parse(saved);
                updateState({ 
                    user: u,
                    view: u.role === 'administrador' ? 'admin' : (u.role === 'atencion' || u.role === 'atencion al cliente' ? 'visor' : 'dashboard')
                }); 
            } catch (e) { }
        }

        updateState({ loading: true });
        if (forceSilentSync) {
            await forceSilentSync(true);
        }
    };

    if (state.loading && state.users.length === 0) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 text-white">
                <span className="material-icons text-6xl text-indigo-500 animate-spin mb-4">sync</span>
                <p className="font-bold text-slate-300">Descargando Base Maestra de SQL Server...</p>
            </div>
        );
    }

    if (!state.user) {
        return <Login />;
    }

    const renderMainContent = () => {
        switch (state.view) {
            case 'dashboard': return <DashboardView />;
            case 'clients': return <ClientesView />;
            case 'interactions': return <InteraccionesView />;
            case 'import': return <ImportacionView />;
            case 'visor': return <VisorView />;
            case 'team': return <TeamView />;
            case 'admin': return <AdminView />;
            case 'monitor': return <MonitorView />;
            default: return <DashboardView />;
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-slate-50 relative font-sans text-slate-700">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden relative">
                <Header />
                <main id="main-content" className="flex-1 overflow-y-auto p-4 md:p-6 fade-in relative">
                    {renderMainContent()}
                </main>
            </div>
            <div id="modal-container"></div>
            <div id="toast-container" className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"></div>
        </div>
    );
}
