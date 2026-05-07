import React, { useEffect, useState } from 'react';
import { useAppContext } from './AppContext';
import { execSQL } from './api';

import Sidebar from './components/Sidebar';
import Header from './components/Header';

import DashboardView from './views/DashboardView';
import ClientesView from './views/ClientesView';
import InteraccionesView from './views/InteraccionesView';
import ImportacionView from './views/ImportacionView';
import VisorView from './views/VisorView';
import TeamView from './views/TeamView';
import AdminView from './views/AdminView';
import MonitorView from './views/MonitorView';

export default function App() {
    const { state, updateState, showToast, forceSilentSync, checkAccess } = useAppContext();
    const [firstLoad, setFirstLoad] = useState(true);

    useEffect(() => {
        initAuthAndFetch();

        // Escuchar eventos de logout desde otras pestañas (Portal o Stock)
        const handleStorageChange = (e) => {
            if (e.key === 'nexus_custom_user' && !e.newValue) {
                // Si alguien borró nexus_custom_user en otra pestaña, cerramos sesión acá
                updateState({ user: null });
                localStorage.removeItem('crm_session_native');
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const initAuthAndFetch = async () => {
        const ssoSaved = localStorage.getItem('nexus_custom_user');
        const localSaved = localStorage.getItem('crm_session_native');
        const saved = ssoSaved || localSaved;
        if (saved) {
            try { 
                const u = JSON.parse(saved);
                // Mapear rol 'admin' a 'administrador' por si viene del portal así
                const mappedRole = String(u.role).toLowerCase() === 'admin' ? 'administrador' : u.role;
                
                let hasVentasApp = false;
                
                if (u.is_super_admin) {
                    hasVentasApp = true;
                } else if (u.permisos_obj && Array.isArray(u.permisos_obj.apps) && u.permisos_obj.apps.includes('ventas')) {
                    hasVentasApp = true;
                }
                
                if (!hasVentasApp) {
                    updateState({ accessDenied: true, loading: false });
                    return; // Detener flujo de login
                }
                
                const finalUser = { ...u, role: mappedRole };
                
                let defaultView = mappedRole === 'administrador' ? 'admin' : (mappedRole === 'atencion' || mappedRole === 'atencion al cliente' ? 'visor' : 'dashboard');
                
                if (!finalUser.is_super_admin && finalUser.permisos_obj && finalUser.permisos_obj.ventas_tools) {
                    const vt = finalUser.permisos_obj.ventas_tools;
                    if (!vt[defaultView] || vt[defaultView].access === 'none') {
                        const available = Object.keys(vt).find(k => vt[k].access !== 'none');
                        if (available) {
                            defaultView = available;
                        } else {
                            updateState({ accessDenied: true, loading: false });
                            return;
                        }
                    }
                }
                
                updateState({ 
                    user: finalUser,
                    view: defaultView
                }); 
                
                // Si entró por SSO, sincronizamos la sesión local
                if (ssoSaved && !localSaved) {
                    localStorage.setItem('crm_session_native', JSON.stringify(finalUser));
                }
            } catch (e) { console.error("Error parsing session:", e); }
        }

        updateState({ loading: true });
        if (forceSilentSync) {
            await forceSilentSync(true);
        }
    };

    if (state.accessDenied) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
                <span className="material-icons text-6xl text-red-500 mb-4">gpp_bad</span>
                <h1 className="text-2xl font-black text-slate-100 mb-2">Acceso Denegado</h1>
                <p className="font-bold text-slate-400 mb-8 max-w-md">Tu cuenta no tiene los permisos necesarios para acceder a la aplicación de Ventas. Contacta a un administrador.</p>
                <a href="/" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-md">Volver al Portal Central</a>
            </div>
        );
    }

    if (state.loading && state.users.length === 0) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 text-white">
                <span className="material-icons text-6xl text-indigo-500 animate-spin mb-4">sync</span>
                <p className="font-bold text-slate-300">Descargando Base Maestra de SQL Server...</p>
            </div>
        );
    }

    if (!state.user) {
        window.location.href = '/';
        return null;
    }

    const renderMainContent = () => {
        // Validación final de renderizado
        if (state.user && !state.user.is_super_admin && !checkAccess(state.view)) {
            // Si intenta renderizar una vista a la que no tiene acceso, mostramos un error de seguridad
            // O forzamos silenciosamente la primera vista disponible (opcional)
            return (
                <div className="flex h-full w-full items-center justify-center flex-col text-slate-400 fade-in">
                    <span className="material-icons text-6xl text-slate-300 mb-4">lock</span>
                    <h2 className="text-xl font-bold">Vista no autorizada</h2>
                    <p className="mt-2 text-sm text-slate-500">
                        No tienes permiso para ver el módulo interno: <span className="font-mono text-indigo-400">{state.view}</span>
                    </p>
                    <p className="mt-6 text-xs text-slate-600">Utiliza el menú lateral para navegar a una sección permitida.</p>
                </div>
            );
        }

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
