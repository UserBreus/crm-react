import React, { useState } from 'react';
import { useAppContext } from '../AppContext';
import { execSQL, getVendedoresExternos } from '../api';

export default function Sidebar() {
    const { state, updateState, showToast, checkAccess } = useAppContext();
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('perfil');
    const [profName, setProfName] = useState('');
    const [profPass, setProfPass] = useState('');
    const [extData, setExtData] = useState(null);
    const [loadingExt, setLoadingExt] = useState(false);
    const [teamUsers, setTeamUsers] = useState([]);
    const [loadingTeam, setLoadingTeam] = useState(false);
    const [avatarSeed, setAvatarSeed] = useState('');
    const [avatarBase64, setAvatarBase64] = useState(null);
    const [savingAvatar, setSavingAvatar] = useState(false);

    if (!state.user) return null;

    const isAdmin = state.user.role === 'administrador' || state.user.is_super_admin;
    const isEncargado = state.user.role === 'encargado';
    const canSeeTeam = isAdmin || isEncargado;

    // ═══ NAV ITEMS ═══
    const navItems = [];
    if (state.user.role === 'administrador') {
        navItems.push(
            { id: 'admin', icon: 'manage_accounts', label: 'Panel de Control' },
            { id: 'monitor', icon: 'monitor_heart', label: 'Monitor de Red' },
            { id: 'div', label: 'Auditoría Global' },
            { id: 'dashboard', icon: 'dashboard', label: 'Panel General' },
            { id: 'clients', icon: 'insights', label: 'Cartera Global' },
            { id: 'interactions', icon: 'forum', label: 'Seguimiento / Hilos' },
            { id: 'visor', icon: 'visibility', label: 'Visor Local' },
            { id: 'import', icon: 'dns', label: 'Clientes en BASE' },
            { id: 'team', icon: 'military_tech', label: 'Ranking de Equipo' }
        );
    } else if (state.user.role === 'atencion' || state.user.role === 'atencion al cliente') {
        navItems.push(
            { id: 'visor', icon: 'visibility', label: 'Visor Local' },
            { id: 'import', icon: 'dns', label: 'Directorio Global' }
        );
    } else {
        navItems.push(
            { id: 'dashboard', icon: 'dashboard', label: 'Panel General' },
            { id: 'clients', icon: 'insights', label: 'Mis Clientes' },
            { id: 'interactions', icon: 'forum', label: 'Seguimiento / Hilos' },
            { id: 'visor', icon: 'visibility', label: 'Visor Local' },
            { id: 'import', icon: 'dns', label: 'Directorio Global' }
        );
        if (state.user.role === 'encargado') {
            navItems.push(
                { id: 'div', label: 'Supervisor' },
                { id: 'team', icon: 'military_tech', label: 'Ranking de Equipo' }
            );
        }
    }

    let finalNavItems = navItems;
    if (!state.user.is_super_admin && state.user.permisos_obj) {
        finalNavItems = finalNavItems.filter(item => {
            if (item.id === 'div') return true;
            return checkAccess(item.id);
        });
        finalNavItems = finalNavItems.filter((item, i, arr) => {
            if (item.id === 'div') {
                const nextItem = arr[i + 1];
                return nextItem && nextItem.id !== 'div';
            }
            return true;
        });
    }

    // ═══ HANDLERS ═══
    const handleLogout = () => {
        updateState({ user: null });
        localStorage.removeItem('crm_session_native');
        localStorage.removeItem('nexus_custom_user');
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        showToast('Actualizando perfil en el servidor...');
        try {
            let updateQuery = "UPDATE usuarios SET nombre_completo = ?";
            const params = [profName];
            if (profPass.trim()) {
                updateQuery += ", pass = ?";
                params.push(profPass);
            }
            if (avatarBase64) {
                updateQuery += ", avatar = ?";
                params.push(avatarBase64);
            }
            updateQuery += " WHERE id = ?";
            params.push(state.user.id);

            const res = await execSQL(updateQuery, params);
            if (res && !res.error) {
                showToast('Perfil actualizado correctamente.');
                updateState({ user: { ...state.user, name: profName, avatar: avatarBase64 || state.user.avatar, ...(profPass.trim() ? { pass: profPass } : {}) } });
                setIsProfileModalOpen(false);
            } else {
                showToast('Error actualizando perfil.');
            }
        } catch (err) {
            showToast('Error de red al guardar perfil.');
        }
    };

    const fetchTeamUsers = async () => {
        setLoadingTeam(true);
        try {
            const res = await execSQL("SELECT id, nombre_completo, rol, cedula, avatar FROM usuarios ORDER BY nombre_completo");
            if (Array.isArray(res)) {
                let filtered = res;
                if (isEncargado && !isAdmin) {
                    filtered = res.filter(u => String(u.rol).toLowerCase().trim() === 'vendedor');
                }
                setTeamUsers(filtered);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingTeam(false);
        }
    };

    const openProfile = async () => {
        setProfName(state.user.name);
        setProfPass('');
        setAvatarSeed(state.user.id || 'nexus');
        setAvatarBase64(state.user.avatar || null);
        setActiveTab('perfil');
        setIsProfileModalOpen(true);
        if (state.user.cedula) {
            setLoadingExt(true);
            const vends = await getVendedoresExternos();
            if (!vends.error) {
                const found = vends.find(v => String(v.VendedorID) === String(state.user.cedula));
                setExtData(found || null);
            }
            setLoadingExt(false);
        }
    };

    const generateAvatarFromSeed = async () => {
        setSavingAvatar(true);
        try {
            const url = `https://api.dicebear.com/7.x/avataaars/png?seed=${avatarSeed}&backgroundColor=b6e3f4,c0aede,d1d4f9&size=256`;
            const response = await fetch(url);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
                setAvatarBase64(reader.result);
                setSavingAvatar(false);
                showToast('Avatar generado. Guarda tu perfil para aplicarlo.');
            };
            reader.readAsDataURL(blob);
        } catch (err) {
            console.error(err);
            setSavingAvatar(false);
            showToast('Error generando avatar.');
        }
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        if (tab === 'equipo' && teamUsers.length === 0) fetchTeamUsers();
    };

    const diceBearPreview = `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed || state.user?.id || 'nexus'}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
    const currentAvatar = avatarBase64 || state.user?.avatar || diceBearPreview;
    const sidebarAvatar = state.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${state.user?.id || 'nexus'}&backgroundColor=b6e3f4,c0aede,d1d4f9`;

    const getRoleBadge = (rol) => {
        const r = String(rol).toLowerCase().trim();
        const badges = {
            'administrador': { bg: 'bg-red-100 text-red-700', icon: 'admin_panel_settings' },
            'admin': { bg: 'bg-red-100 text-red-700', icon: 'admin_panel_settings' },
            'encargado': { bg: 'bg-amber-100 text-amber-700', icon: 'supervisor_account' },
            'vendedor': { bg: 'bg-emerald-100 text-emerald-700', icon: 'storefront' },
            'atencion': { bg: 'bg-blue-100 text-blue-700', icon: 'support_agent' },
        };
        return badges[r] || { bg: 'bg-slate-100 text-slate-600', icon: 'person' };
    };

    // ═══ RENDER ═══
    return (
        <>
            <aside id="sidebar" className="w-full md:w-64 bg-slate-900 text-white flex flex-col p-4 z-40">
                <div className="flex items-center gap-3 mb-6 px-2">
                    <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Logo" className="w-12 h-12 object-contain" />
                    <h1 className="font-black text-xl tracking-tight leading-tight">CRM user<br/><span className="text-indigo-400">ventas</span></h1>
                </div>
                
                <a href="/" className="flex items-center justify-center gap-2 mb-6 mx-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 py-2.5 px-4 rounded-xl font-bold text-sm transition-all shadow-sm">
                    <span className="material-icons text-[18px]">arrow_back</span>
                    Volver al Portal
                </a>
                <nav id="sidebar-nav" className="space-y-1 flex-1 overflow-y-auto">
                    {finalNavItems.map((item, idx) => {
                        if (item.id === 'div') {
                            return <div key={`div-${idx}`} className="pt-4 pb-2 px-3 text-[10px] uppercase font-bold text-slate-500 tracking-widest">{item.label}</div>;
                        }
                        const active = state.view === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white';
                        return (
                            <button key={item.id} onClick={() => updateState({ view: item.id, searchTerm: '', selectedClients: [] })} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${active}`}>
                                <span className="material-icons">{item.icon}</span><span className="font-semibold text-sm">{item.label}</span>
                            </button>
                        );
                    })}
                </nav>
                <div className="mt-auto pt-4 border-t border-slate-800">
                    <div className="px-3 flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <img src={sidebarAvatar} alt="Avatar" className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-700" />
                            <div className="overflow-hidden">
                                <p className="text-sm font-bold truncate">{state.user?.name}</p>
                                <p className="text-[10px] text-indigo-400 capitalize font-medium">{state.user?.role}</p>
                            </div>
                        </div>
                        <button onClick={openProfile} className="text-slate-400 hover:text-white transition" title="Editar Mi Perfil">
                            <span className="material-icons text-[20px]">edit</span>
                        </button>
                    </div>
                    <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-slate-800 rounded-lg transition">
                        <span className="material-icons">logout</span> Cerrar Sesión
                    </button>
                </div>
            </aside>

            {/* PROFILE MODAL */}
            {isProfileModalOpen && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 fade-in" onClick={() => setIsProfileModalOpen(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        
                        {/* TABS */}
                        <div className="flex border-b border-slate-200 px-6">
                            <button onClick={() => handleTabChange('perfil')} className={`px-4 py-4 text-sm font-black tracking-widest uppercase transition-colors relative flex items-center gap-2 ${activeTab === 'perfil' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
                                <span className="material-icons text-[18px]">person</span> Mis Datos
                                {activeTab === 'perfil' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600" />}
                            </button>
                            {canSeeTeam && (
                                <button onClick={() => handleTabChange('equipo')} className={`px-4 py-4 text-sm font-black tracking-widest uppercase transition-colors relative flex items-center gap-2 ${activeTab === 'equipo' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
                                    <span className="material-icons text-[18px]">groups</span> Personal
                                    {activeTab === 'equipo' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600" />}
                                </button>
                            )}
                        </div>

                        {/* CONTENT */}
                        <div className="p-6 max-h-[65vh] overflow-y-auto">
                            {activeTab === 'perfil' ? (
                                <form id="profileFormCRM" onSubmit={handleSaveProfile} className="space-y-6">
                                    {/* Avatar */}
                                    <div className="flex flex-col items-center justify-center mb-4">
                                        <img src={currentAvatar} alt="Avatar" className="w-24 h-24 rounded-3xl object-cover ring-4 ring-slate-100 shadow-xl" />
                                        <div className="mt-3 flex flex-col items-center gap-2 w-full max-w-xs">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Generar Avatar con Semilla</label>
                                            <div className="flex gap-2 w-full">
                                                <input type="text" value={avatarSeed} onChange={e => setAvatarSeed(e.target.value)} placeholder="Escribe tu nombre..." className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-center outline-none focus:border-indigo-500" />
                                                <button type="button" onClick={generateAvatarFromSeed} disabled={savingAvatar} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition active:scale-95 disabled:opacity-50 flex items-center gap-1">
                                                    <span className="material-icons text-[16px]">{savingAvatar ? 'sync' : 'auto_awesome'}</span>
                                                    {savingAvatar ? '...' : 'Generar'}
                                                </button>
                                            </div>
                                            <img src={diceBearPreview} alt="Preview" className="w-16 h-16 rounded-xl opacity-60 border border-slate-200 mt-1" title="Vista previa del avatar que se generará" />
                                        </div>
                                    </div>

                                    {/* Fields */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Usuario (ID)</label>
                                            <input type="text" value={state.user.id} readOnly className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 font-mono font-bold text-slate-400 cursor-not-allowed" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nombre Completo</label>
                                            <input type="text" value={profName} onChange={e => setProfName(e.target.value)} required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-indigo-500" />
                                        </div>
                                        <div className="space-y-1 md:col-span-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nueva Contraseña (Opcional)</label>
                                            <div className="relative">
                                                <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">key</span>
                                                <input type="password" placeholder="Dejar en blanco para no cambiar..." value={profPass} onChange={e => setProfPass(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 font-mono font-bold outline-none focus:border-indigo-500" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Role */}
                                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
                                        <span className="material-icons text-indigo-500">shield</span>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">Rol asignado: <span className="capitalize">{state.user.role}</span></p>
                                            <p className="text-[10px] text-slate-500">Para cambiar tu rol, contacta con un administrador del sistema.</p>
                                        </div>
                                    </div>

                                    {/* Matrix Data */}
                                    {state.user.cedula ? (
                                        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                                            <h4 className="text-xs font-black text-indigo-700 uppercase tracking-widest mb-3 flex items-center gap-1"><span className="material-icons text-[14px]">badge</span> ID MATRIZ VINCULADO</h4>
                                            {loadingExt ? (
                                                <p className="text-sm font-bold text-indigo-400 animate-pulse">Sincronizando con Servidor Central...</p>
                                            ) : extData ? (
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div><p className="text-[10px] text-indigo-400 font-bold uppercase">Cédula Oficial</p><p className="font-black text-slate-700">{extData.VendedorID}</p></div>
                                                    <div><p className="text-[10px] text-indigo-400 font-bold uppercase">Nombre Legal</p><p className="font-black text-slate-700">{extData.VendedorNombre}</p></div>
                                                    <div className="col-span-2"><p className="text-[10px] text-indigo-400 font-bold uppercase">Zona de Cobertura</p><p className="font-black text-slate-700">{extData.Zona || 'No especificada'}</p></div>
                                                </div>
                                            ) : (
                                                <p className="text-sm font-medium text-amber-600">No se encontró información en la base externa para tu cédula.</p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-[10px] text-slate-400 font-medium italic">* Cuenta sin cédula vinculada, no lee datos de la Matriz.</p>
                                    )}
                                </form>
                            ) : (
                                /* TEAM TAB */
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                            <span className="material-icons text-indigo-500 text-[18px]">groups</span>
                                            {isEncargado && !isAdmin ? 'Vendedores del Equipo' : 'Todo el Personal'}
                                        </h4>
                                        <button onClick={fetchTeamUsers} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                                            <span className="material-icons text-[14px]">refresh</span> Actualizar
                                        </button>
                                    </div>
                                    {loadingTeam ? (
                                        <div className="flex justify-center py-10"><span className="material-icons text-4xl text-indigo-400 animate-spin">sync</span></div>
                                    ) : teamUsers.length === 0 ? (
                                        <p className="text-center text-slate-400 font-medium py-8">No se encontraron usuarios.</p>
                                    ) : (
                                        teamUsers.map((u, i) => {
                                            const badge = getRoleBadge(u.rol);
                                            return (
                                                <div key={u.id || i} className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 transition">
                                                    <img src={u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}&backgroundColor=b6e3f4,c0aede`} alt="Avatar" className="w-12 h-12 rounded-xl object-cover ring-2 ring-white shadow-sm" />
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-bold text-sm text-slate-800 leading-none mb-1 truncate">{u.nombre_completo || u.id}</h4>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${badge.bg}`}>
                                                                <span className="material-icons text-[12px]">{badge.icon}</span>
                                                                {String(u.rol).toLowerCase().trim()}
                                                            </span>
                                                            {u.cedula && <span className="text-[10px] text-slate-400 font-mono">CI: {u.cedula}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>

                        {/* FOOTER */}
                        <div className="p-4 border-t border-slate-100 flex justify-end gap-3">
                            <button type="button" onClick={() => setIsProfileModalOpen(false)} className="px-5 py-2.5 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition">Cerrar</button>
                            {activeTab === 'perfil' && (
                                <button type="submit" form="profileFormCRM" className="px-6 py-2.5 font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 rounded-xl transition-transform active:scale-95 flex items-center gap-2">
                                    <span className="material-icons text-[18px]">check_circle</span> Guardar Cambios
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}