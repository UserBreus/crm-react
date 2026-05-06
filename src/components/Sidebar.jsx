import React, { useState } from 'react';
import { useAppContext } from '../AppContext';
import { execSQL, getVendedoresExternos } from '../api';

export default function Sidebar() {
    const { state, updateState, showToast } = useAppContext();
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [profName, setProfName] = useState('');
    const [profPass, setProfPass] = useState('');
    const [extData, setExtData] = useState(null); // Para guardar datos de la matriz
    const [loadingExt, setLoadingExt] = useState(false);

    if (!state.user) return null;

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

    const handleLogout = () => {
        updateState({ user: null });
        localStorage.removeItem('crm_session_native');
        localStorage.removeItem('nexus_custom_user'); // Log out from portal too
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        if (state.user.role === 'administrador') {
            alert("El administrador maestro se edita en las variables del código directamente.");
            return;
        }
        showToast('Actualizando perfil en el servidor...');
        setIsProfileModalOpen(false);

        const res = await execSQL("UPDATE usuarios SET nombre_completo = ?, pass = ? WHERE id = ?", [profName, profPass, state.user.id]);
        if (res && !res.error) {
            showToast('Perfil actualizado');
            // Optimistic update
            updateState({ user: { ...state.user, name: profName, pass: profPass } });
        } else {
            alert('Error actualizando perfil: ' + (res?.error || 'Desconocido'));
        }
    };

    const openProfile = async () => {
        setProfName(state.user.name);
        setProfPass(state.user.pass);
        setIsProfileModalOpen(true);
        
        // Fetch external data si es un vendedor/encargado con cédula
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
                    {navItems.map((item, idx) => {
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
                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                                {state.user?.name?.[0]?.toUpperCase()}
                            </div>
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

            {isProfileModalOpen && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 fade-in" onClick={() => setIsProfileModalOpen(false)}>
                    <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-black mb-4 flex items-center gap-2">
                            <span className="material-icons text-indigo-500">manage_accounts</span> Mi Perfil
                        </h3>
                        <form onSubmit={handleSaveProfile} className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre Público</label>
                                <input type="text" value={profName} onChange={e => setProfName(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl outline-none font-bold text-slate-700" required />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Contraseña</label>
                                <input type="text" value={profPass} onChange={e => setProfPass(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl outline-none font-bold text-slate-700" required />
                            </div>

                            {/* Matrix Data Panel */}
                            {state.user.cedula ? (
                                <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                                    <h4 className="text-xs font-black text-indigo-700 uppercase tracking-widest mb-3 flex items-center gap-1"><span className="material-icons text-[14px]">badge</span> ID MATRIZ VINCULADO</h4>
                                    {loadingExt ? (
                                        <p className="text-sm font-bold text-indigo-400 animate-pulse">Sincronizando con Servidor Central...</p>
                                    ) : extData ? (
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div>
                                                <p className="text-[10px] text-indigo-400 font-bold uppercase">Cédula Oficial</p>
                                                <p className="font-black text-slate-700">{extData.VendedorID}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-indigo-400 font-bold uppercase">Nombre Legal</p>
                                                <p className="font-black text-slate-700">{extData.VendedorNombre}</p>
                                            </div>
                                            <div className="col-span-2">
                                                <p className="text-[10px] text-indigo-400 font-bold uppercase">Zona de Cobertura</p>
                                                <p className="font-black text-slate-700">{extData.Zona || 'No especificada'}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-sm font-medium text-amber-600">No se encontró información en la base externa para tu cédula.</p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-[10px] text-slate-400 font-medium italic mb-2">* Cuenta sin cédula vinculada, no lee datos de la Matriz.</p>
                            )}

                            <div className="flex gap-3 justify-end mt-6">
                                <button type="button" onClick={() => setIsProfileModalOpen(false)} className="px-5 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">Cancelar</button>
                                <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 transition">Guardar Cambios</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}