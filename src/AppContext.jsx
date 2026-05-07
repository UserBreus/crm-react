import React, { createContext, useContext, useState, useEffect } from 'react';
import { runSmartSync } from './syncEngine';
import { execSQL, getClientesExternos } from './api';

const AppContext = createContext();

export function useAppContext() {
    return useContext(AppContext);
}

export function AppProvider({ children }) {
    const [state, setState] = useState({
        user: null,
        users: [],
        roles: [],
        notificaciones: [],
        datosConfig: [],
        rawColoresEstados: [],
        coloresEstados: {},
        view: 'dashboard',
        searchTerm: '',
        selectedClients: [],
        loading: true,
        managerView: 'ALL'
    });

    // Helper para actualizar parcialmente el estado
    const updateState = (updates) => {
        setState(prev => ({ ...prev, ...updates }));
    };

    useEffect(() => {
        if (!state.user) return;
        let isActive = true;
        let lastKnownGlobalSync = Date.now();

        const interval = setInterval(async () => {
            try {
                // 1. POLLING DE NOTIFICACIONES
                const notifRes = await execSQL("SELECT TOP 50 * FROM notificaciones ORDER BY timestamp DESC");
                if (isActive && Array.isArray(notifRes)) {
                    const mapped = notifRes.map(n => ({
                        id: n.id, title: n.titulo, message: n.mensaje, link: n.enlace, author: n.autor, timestamp: n.timestamp
                    })).sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
                    
                    setState(prev => {
                        const currentFirst = prev.notificaciones[0]?.id;
                        const newFirst = mapped[0]?.id;
                        if (currentFirst !== newFirst || prev.notificaciones.length !== mapped.length) {
                            return { ...prev, notificaciones: mapped };
                        }
                        return prev;
                    });
                }

                // 2. POLLING DE CRONGLOBAL SECUNDARIO (ESCUCHADOR NATIVO)
                const syncLogRes = await execSQL("SELECT TOP 1 modulo, estado, timestamp, mensaje FROM logs_sistema WHERE CAST(modulo AS VARCHAR(MAX)) = 'AUTOSYNC' ORDER BY timestamp DESC");
                let mostRecentSuccess = 0;
                let mostRecentMessage = '';
                
                if (Array.isArray(syncLogRes) && syncLogRes.length > 0) {
                    if (syncLogRes[0].estado === 'EXITO') {
                        mostRecentSuccess = Number(syncLogRes[0].timestamp);
                        mostRecentMessage = String(syncLogRes[0].mensaje || '');
                    }
                }
                
                // Refrescar frontend de TODOS los usuarios si un AUTOSYNC fue exitoso recientemente
                if (mostRecentSuccess > lastKnownGlobalSync && lastKnownGlobalSync > 0) {
                     lastKnownGlobalSync = mostRecentSuccess;
                     setState(prev => ({ ...prev, lastSyncTimestamp: mostRecentSuccess, lastSyncMsg: mostRecentMessage }));
                     showToast('Sincronización Autónoma Completada. Refrescando datos...');
                     forceSilentSync(false);
                     setState(prev => ({ ...prev, reloadTrigger: Date.now() }));
                } else if (lastKnownGlobalSync === 0 && mostRecentSuccess > 0) {
                     lastKnownGlobalSync = mostRecentSuccess; 
                     setState(prev => {
                         if (prev.lastSyncTimestamp === mostRecentSuccess) return prev;
                         return { ...prev, lastSyncTimestamp: mostRecentSuccess, lastSyncMsg: mostRecentMessage };
                     });
                } else if (mostRecentSuccess > 0) {
                     // Solo actualiza si cambia (protección para la magia de closures)
                     setState(prev => {
                         if (prev.lastSyncTimestamp === mostRecentSuccess) return prev;
                         return { ...prev, lastSyncTimestamp: mostRecentSuccess, lastSyncMsg: mostRecentMessage };
                     });
                }
            } catch (e) { console.error("Poller Error:", e); }
        }, 5000);
        return () => { isActive = false; clearInterval(interval); };
    }, [state.user?.id, state.user?.role, state.datosConfig]);

    const getReadNotifications = () => {
        let readArr = [];
        try {
            const readStr = localStorage.getItem('crm_read_notifs');
            if (readStr) readArr = JSON.parse(readStr);
        } catch (e) { }
        return readArr;
    };

    const markAsReadNotification = (id) => {
        const readArr = getReadNotifications();
        if (!readArr.includes(id)) {
            readArr.push(id);
            localStorage.setItem('crm_read_notifs', JSON.stringify(readArr));
            // Trigger a re-render by updating state slightly
            updateState({ notificaciones: [...state.notificaciones] });
        }
    };

    const openNotificationModal = (id) => {
        markAsReadNotification(id);
        const n = state.notificaciones.find(x => x.id === id);
        if (!n) return;
        
        let linkHtml = ''; 
        if (n.link && n.link.length > 5) { 
            linkHtml = `<a href="${n.link}" target="_blank" class="mt-6 inline-flex items-center gap-2 px-5 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold rounded-xl transition text-sm"><span class="material-icons">link</span> Abrir Enlace Adjunto</a>`; 
        }
        
        const modalHTML = `
        <div id="fullNotifModal_${n.id}" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[99999] fade-in p-4" onclick="document.getElementById('fullNotifModal_${n.id}').remove()">
            <div class="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden transform transition-all" onclick="event.stopPropagation()">
                <div class="px-8 py-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                    <div class="pr-4">
                        <p class="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2 flex items-center gap-1"><span class="material-icons text-[14px]">campaign</span> Anuncio Oficial</p>
                        <h3 class="text-2xl md:text-3xl font-black text-slate-800 leading-tight">${n.title || 'Anuncio Importante'}</h3>
                        <p class="text-xs text-slate-500 mt-3 font-semibold flex items-center gap-2"><span class="material-icons text-[16px]">account_circle</span> Emitido por ${n.author} • ${new Date(Number(n.timestamp)).toLocaleString()}</p>
                    </div>
                    <button onclick="document.getElementById('fullNotifModal_${n.id}').remove()" class="w-10 h-10 bg-white shadow-sm border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-full flex items-center justify-center transition flex-shrink-0"><span class="material-icons">close</span></button>
                </div>
                <div class="p-8 bg-white max-h-[60vh] overflow-y-auto">
                    <p class="text-base md:text-lg text-slate-700 leading-relaxed whitespace-pre-wrap">${n.message}</p>
                    ${linkHtml}
                </div>
                <div class="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-end">
                    <button onclick="document.getElementById('fullNotifModal_${n.id}').remove()" class="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition w-full md:w-auto">Entendido</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    };

    const showToast = (msg) => {
        // Simple fallback until toast UI is implemented
        console.log("TOAST:", msg);
    };

    const forceSilentSync = async (isInitialLoad = false) => {
        if (!isInitialLoad) showToast('Descargando configuraciones y usuarios (Modo Ligero)...');
        
        try {
            const [
                rolesRes, usersRes, notifRes, configRes, coloresRes, clientsRes
            ] = await Promise.all([
                execSQL("SELECT * FROM roles"),
                execSQL("SELECT * FROM usuarios"),
                execSQL("SELECT TOP 50 * FROM notificaciones ORDER BY timestamp DESC"),
                execSQL("SELECT * FROM configuracion_externa"),
                execSQL("SELECT * FROM colores_estados"),
                getClientesExternos()
            ]);

            const roles = Array.isArray(rolesRes) ? rolesRes : [];
            const users = Array.isArray(usersRes) ? usersRes.map(u => ({ 
                id: u.id, pass: u.pass, role: String(u.rol).toLowerCase() === 'admin' ? 'administrador' : u.rol, name: u.nombre_completo, cedula: u.cedula ? String(u.cedula).trim() : null 
            })) : [];
            users.push({ id: 'user', pass: 'vilardebo2031', role: 'administrador', name: 'Super Administrador', cedula: null });

            const notificaciones = Array.isArray(notifRes) ? notifRes.map(n => ({ 
                id: n.id, title: n.titulo, message: n.mensaje, link: n.enlace, author: n.autor, timestamp: n.timestamp 
            })).sort((a, b) => b.timestamp - a.timestamp) : [];

            const datosConfig = Array.isArray(configRes) ? configRes.map(d => ({ 
                servicio: d.servicio, url: d.url, sheet: d.nombre_hoja, colsView: d.cols_vista, colOrd: d.col_orden, 
                colCant: d.col_cantidad, colCli: d.col_cliente, colTrab: d.col_trabajo, colModo: d.col_modo, 
                colProd: d.col_producto, colFec: d.col_fecha, colEst: d.col_estado 
            })) : [];

            const rawColoresEstados = Array.isArray(coloresRes) ? coloresRes : [];
            const coloresEstados = {};
            rawColoresEstados.forEach(c => { coloresEstados[c.estado.toLowerCase()] = c.color; });

            updateState({
                roles, users, notificaciones, 
                datosConfig, rawColoresEstados, coloresEstados, loading: false,
                reloadTrigger: Date.now(),
                clients: Array.isArray(clientsRes) && !clientsRes.error ? clientsRes : []
            });

            if (!isInitialLoad) {
                showToast('¡Configuraciones maestras actualizadas!');
            }
        } catch (e) {
            updateState({ loading: false });
            console.error("Error fetching admin data:", e);
        }
    };

    const triggerSmartSync = async (targetService, mode = 'órdenes', options = {}) => {
        if (state.isSmartSyncing) return;
        await runSmartSync({ targetService, datosConfig: state.datosConfig, showToast, updateState, mode, options });
    };

    const hasAccess = (toolId) => {
        if (state.user?.role === 'administrador') return 'write';
        if (!state.user || !state.user.ventas_tools || typeof state.user.ventas_tools !== 'object') return 'none';
        
        const tool = state.user.ventas_tools[toolId];
        if (!tool) return 'none';
        
        return tool.access || 'none';
    };

    const hasSubAccess = (toolId, subToolId) => {
        if (state.user?.role === 'administrador') return 'write';
        if (!state.user || !state.user.ventas_tools || typeof state.user.ventas_tools !== 'object') return 'none';
        
        const tool = state.user.ventas_tools[toolId];
        if (!tool || !tool.sub) return 'none';
        
        return tool.sub[subToolId] || 'none';
    };

    const value = {
        state,
        updateState,
        showToast,
        forceSilentSync,
        triggerSmartSync,
        getReadNotifications,
        markAsReadNotification,
        openNotificationModal,
        hasAccess,
        hasSubAccess
    };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
}
