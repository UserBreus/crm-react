import React, { useState } from 'react';
import { useAppContext } from '../AppContext';
import { execSQL } from '../api';

export default function Sidebar() {
    const { state, updateState, showToast } = useAppContext();
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [profName, setProfName] = useState('');
    const [profPass, setProfPass] = useState('');

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
    } else {
        navItems.push(
            { id: 'dashboard', icon: 'dashboard', label: 'Panel General' },
            { id: 'clients', icon: 'insights', label: 'Mis Clientes' },
            { id: 'interactions', icon: 'forum', label: 'Seguimiento / Hilos' },
            { id: 'visor', icon: 'visibility', label: 'Visor Local' },
            { id: 'import', icon: 'dns', label: 'Clientes en BASE' }
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

    const openProfile = () => {
        setProfName(state.user.name);
        setProfPass(state.user.pass);
        setIsProfileModalOpen(true);
    };

    return (
        <>
            <aside id="sidebar" className="w-full md:w-64 bg-slate-900 text-white flex flex-col p-4 z-40">
                <div className="flex items-center gap-3 mb-8 px-2">
                    <div className="p-2 bg-indigo-500 rounded-lg"><span className="material-icons">bolt</span></div>
                    <h1 className="font-bold text-xl">Ventas Master</h1>
                </div>
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