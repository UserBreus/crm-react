import React, { useState } from 'react';
import { useAppContext } from '../AppContext';
import { execSQL } from '../api';

export default function Header() {
    const { state, updateState, forceSilentSync, getReadNotifications, markAsReadNotification, openNotificationModal, triggerSmartSync, showToast } = useAppContext();
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const [isComposingNotif, setIsComposingNotif] = useState(false);
    const [nTitle, setNTitle] = useState('');
    const [nMsg, setNMsg] = useState('');
    const [nLink, setNLink] = useState('');

    if (!state.user) return null;

    const getHeaderTitle = () => {
        const titles = { 
            'dashboard': 'Escritorio Operativo', 
            'clients': 'Analítica de Cartera', 
            'interactions': 'Gestión de Seguimientos', 
            'import': 'Base de Datos Externa', 
            'visor': 'Visor de Producción', 
            'team': 'Ranking y Mando de Equipo', 
            'admin': 'Panel de Super Administrador', 
            'monitor': 'Telemetría y Registro' 
        };
        return titles[state.view] || '';
    };

    const hasUnread = () => {
        if (!state.notificaciones || state.notificaciones.length === 0) return false;
        const readArr = getReadNotifications ? getReadNotifications() : [];
        return state.notificaciones.some(n => !readArr.includes(n.id));
    };

    const toggleNotifPanel = () => {
        setIsNotifOpen(!isNotifOpen);
    };

    const isAdmin = state.user.role === 'encargado' || state.user.role === 'administrador';
    const showManagerSelector = isAdmin && !['import', 'visor', 'team', 'admin', 'monitor'].includes(state.view);

    const sellers = state.users.filter(u => u.role === 'vendedor' || u.role === 'encargado');

    const handleSearch = (e) => {
        // AppContext expects string for searchTerm updates
        updateState({ searchTerm: e.target.value.toLowerCase() });
    };

    const submitNotif = async () => {
        if (!nTitle || !nMsg) return alert('Título y mensaje son obligatorios.');
        try {
            const notifId = Date.now().toString() + Math.floor(Math.random()*1000).toString();
            await execSQL("INSERT INTO notificaciones (id, titulo, mensaje, enlace, autor, timestamp) VALUES (?, ?, ?, ?, ?, ?)", [notifId, nTitle, nMsg, nLink, state.user.name, Date.now()]);
            showToast('Anuncio publicado con éxito.');
            setIsComposingNotif(false);
            setNTitle(''); setNMsg(''); setNLink('');
            forceSilentSync(false);
        } catch(e) {
            alert("Error publicando anuncio: " + e.message);
        }
    };

    const notificationPanel = isNotifOpen ? (
        <div className="absolute top-20 right-4 md:right-6 w-[340px] bg-white rounded-3xl shadow-2xl border border-slate-200 z-[9999] flex flex-col overflow-hidden fade-in max-h-[80vh]">
            <div className="p-4 bg-slate-800 text-white flex justify-between items-center flex-shrink-0 shadow-md z-20">
                <h4 className="font-black text-sm flex items-center gap-2"><span className="material-icons text-[18px] text-amber-400">campaign</span> Avisos</h4>
                <div className="flex items-center gap-2">
                    {isAdmin && (
                        <button onClick={() => setIsComposingNotif(!isComposingNotif)} className="text-[10px] font-bold bg-white/20 hover:bg-white/30 px-2 py-1 rounded transition whitespace-nowrap">
                            {isComposingNotif ? 'Cancelar' : '➕ Emitir'}
                        </button>
                    )}
                    <button onClick={() => { setIsNotifOpen(false); setIsComposingNotif(false); }} className="text-slate-400 hover:text-white transition w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-700">
                        <span className="material-icons text-sm">close</span>
                    </button>
                </div>
            </div>
            
            <div className="overflow-y-auto flex-1 bg-white relative">
                {isComposingNotif ? (
                    <div className="p-4 bg-slate-50 flex flex-col gap-3 h-full">
                        <input type="text" placeholder="Título del Aviso" value={nTitle} onChange={e=>setNTitle(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                        <textarea placeholder="Cuerpo del mensaje..." value={nMsg} onChange={e=>setNMsg(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"></textarea>
                        <input type="text" placeholder="Enlace adjunto (opcional)" value={nLink} onChange={e=>setNLink(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none" />
                        <button onClick={submitNotif} className="w-full mt-2 bg-indigo-600 text-white font-black text-sm py-2 rounded-lg hover:bg-indigo-700 shadow-sm flex items-center justify-center gap-2"><span className="material-icons text-[16px]">send</span> Publicar Ahora</button>
                    </div>
                ) : (!state.notificaciones || state.notificaciones.length === 0) ? (
                    <div className="p-6 text-center text-slate-400 text-xs font-bold">
                        <span className="material-icons text-3xl mb-2">notifications_paused</span><br/>No hay anuncios recientes.
                    </div>
                ) : (
                    [...state.notificaciones].sort((a,b) => b.timestamp - a.timestamp).map(n => {
                        const readArr = getReadNotifications ? getReadNotifications() : [];
                        const isUnread = !readArr.includes(n.id);
                        return (
                            <div key={n.id} onClick={() => { setIsNotifOpen(false); if (openNotificationModal) openNotificationModal(n.id); }} className={`p-4 border-b border-slate-50 last:border-0 hover:bg-indigo-50 cursor-pointer transition group ${isUnread ? 'bg-red-50/30' : ''}`}>
                                <div className="flex justify-between items-start mb-1">
                                    <p className="font-black text-sm text-slate-800 group-hover:text-indigo-700 transition leading-tight flex items-center">
                                        {n.title || 'Anuncio Importante'} {isUnread && <span className="w-2 h-2 bg-red-500 rounded-full inline-block ml-2 animate-pulse"></span>}
                                    </p>
                                </div>
                                <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1 mt-1">
                                    <span className="material-icons text-[12px]">account_circle</span> {n.author} • {new Date(Number(n.timestamp)).toLocaleDateString()}
                                </p>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    ) : null;

    return (
        <header className="p-4 md:px-6 md:pt-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50 z-[100]">
            <div className="w-full md:w-auto flex flex-col md:flex-row items-start md:items-center gap-4">
               <h2 id="header-title" className="text-2xl font-black tracking-tight text-slate-800">{getHeaderTitle()}</h2>
               
               {showManagerSelector && (
                   <select 
                       value={state.managerView || 'ALL'} 
                       onChange={e => updateState({ managerView: e.target.value })} 
                       className="bg-indigo-100 border border-indigo-200 text-indigo-800 text-[11px] font-black uppercase tracking-wider rounded-xl px-3 py-2.5 outline-none cursor-pointer shadow-sm w-full md:w-auto"
                   >
                       <option value="SELF">Mi Cartera (Personal)</option>
                       <option value="ALL">🌐 Vista Global (Todos)</option>
                       {sellers.map(s => <option key={s.id} value={s.id}>👤 Ver a: {s.name}</option>)}
                   </select>
               )}
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
               {state.view === 'visor' ? (
                   <button 
                      onClick={() => {
                          if(state.isSmartSyncing) return;
                          if(state.visorService) triggerSmartSync(state.visorService);
                      }} 
                      disabled={state.isSmartSyncing}
                      className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition shadow-sm ${state.isSmartSyncing ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'}`} 
                      title="Sincronizar Inteligente con Google Sheets">
                      <span className={`material-icons text-[18px] ${state.isSmartSyncing ? 'animate-spin' : ''}`}>sync</span> 
                      <span className="hidden sm:inline">{state.isSmartSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
                   </button>
               ) : (
                   <button onClick={() => { if(forceSilentSync) forceSilentSync(); }} className="px-4 py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-xl font-bold flex items-center gap-2 transition shadow-sm" title="Actualizar Vista">
                      <span className="material-icons text-[18px]">refresh</span> <span className="hidden sm:inline">Actualizar</span>
                   </button>
               )}
               
               <button onClick={toggleNotifPanel} className={`w-12 h-11 border rounded-xl flex items-center justify-center transition relative flex-shrink-0 ${hasUnread() ? 'bg-red-600 border-red-600 text-white hover:bg-red-700 shadow-md animate-pulse' : 'bg-white border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 shadow-sm'}`} title="Avisos y Anuncios">
                  <span className="material-icons">notifications</span>
               </button>
    
               <div className="relative flex-1 md:flex-none">
                 <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" style={{fontSize: '18px'}}>search</span>
                 <input 
                     type="text" 
                     placeholder="Buscar..." 
                     onChange={handleSearch} 
                     value={state.searchTerm || ''} 
                     className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 w-full outline-none shadow-sm text-slate-700 font-medium" 
                 />
               </div>
               
               {(state.view !== 'admin' && state.view !== 'monitor') && (
                   <button onClick={() => updateState({ view: 'interactions' })} className="px-5 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-bold shadow-md flex items-center gap-2 transition hidden sm:flex">
                       <span className="material-icons">add</span> Nuevo Hilo
                   </button>
               )}
            </div>
            
            {notificationPanel}
        </header>
    );
}