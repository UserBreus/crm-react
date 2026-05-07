import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { asignarVendedorExterno } from '../api';

const SELLER_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6366f1'];

export default function ImportacionView() {
  const { state, updateState, showToast, forceSilentSync } = useAppContext();

  const isAdmin = state.user?.role === 'administrador' || state.user?.role === 'encargado' || state.user?.is_super_admin;
  const isVendedor = !isAdmin;

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const [filter, setFilter] = useState('unassigned');
  const [selectedClients, setSelectedClients] = useState([]);
  const [assignTargetSeller, setAssignTargetSeller] = useState('');

  const [modalClient, setModalClient] = useState(null);

  const validSellers = useMemo(() => state.users.filter(u => u.role === 'vendedor' || u.role === 'encargado'), [state.users]);
  
  const sellerColorMap = useMemo(() => {
     const map = {};
     validSellers.forEach((u, i) => { map[u.id] = SELLER_COLORS[i % SELLER_COLORS.length]; });
     return map;
  }, [validSellers]);

  if (!assignTargetSeller && validSellers.length > 0) {
      setAssignTargetSeller(validSellers[0].id);
  }

  const safeFilter = useMemo(() => {
     if (!isAdmin && filter !== 'unassigned' && String(filter) !== String(state.user?.id)) {
         return 'unassigned';
     }
     return filter;
  }, [filter, isAdmin, state.user]);

  const [paginatedClients, setPaginatedClients] = useState([]);
  const [totalFiltered, setTotalFiltered] = useState(0);

  useEffect(() => {
      const term = (state.searchTerm || '').replace(/'/g, '').toLowerCase().trim();
      
      let filtered = state.clients || [];

      // Aplicar filtro de búsqueda textual
      if (term) {
          filtered = filtered.filter(c => 
              (c.id && c.id.toLowerCase().includes(term)) ||
              (c.name && c.name.toLowerCase().includes(term)) ||
              (c.phone && c.phone.toLowerCase().includes(term)) ||
              (c.mail && c.mail.toLowerCase().includes(term))
          );
      }

      // Aplicar candado del filtro de vendedores por Cédula (relación)
      if (!isAdmin) {
          if (safeFilter === 'unassigned') {
              filtered = filtered.filter(c => !c.cedulaVendedor || String(c.cedulaVendedor).trim() === '' || String(c.cedulaVendedor) === 'null');
          } else if (String(safeFilter) === String(state.user?.id)) {
              filtered = filtered.filter(c => String(c.cedulaVendedor) === String(state.user?.cedula));
          } else {
              filtered = [];
          }
      } else {
          if (safeFilter === 'unassigned') {
              filtered = filtered.filter(c => !c.cedulaVendedor || String(c.cedulaVendedor).trim() === '' || String(c.cedulaVendedor) === 'null');
          } else if (safeFilter === 'assigned') {
              filtered = filtered.filter(c => c.cedulaVendedor && String(c.cedulaVendedor).trim() !== '' && String(c.cedulaVendedor) !== 'null');
          } else if (safeFilter !== 'all') {
              const targetCedula = state.users.find(u => String(u.id) === String(safeFilter))?.cedula;
              filtered = filtered.filter(c => String(c.cedulaVendedor) === String(targetCedula));
          }
      }

      setTotalFiltered(filtered.length);

      const maxPage = Math.ceil(filtered.length / itemsPerPage) || 1;
      const safePage = Math.min(currentPage, maxPage);
      if (currentPage !== safePage && safePage > 0) {
          setCurrentPage(safePage);
      }

      const startIndex = (safePage - 1) * itemsPerPage;
      const pageData = filtered.slice(startIndex, startIndex + itemsPerPage);
      
      setPaginatedClients(pageData);
  }, [state.searchTerm, safeFilter, currentPage, isVendedor, state.user, state.clients]);

  const totalPages = Math.ceil(totalFiltered / itemsPerPage) || 1;
  const startIdx = (currentPage - 1) * itemsPerPage;

  const isAllCurrentPageSelected = paginatedClients.length > 0 && paginatedClients.every(c => {
      const isLibre = !c.cedulaVendedor || String(c.cedulaVendedor).trim() === '' || String(c.cedulaVendedor) === 'null';
      if (!isLibre) return true;
      return selectedClients.some(sc => sc.id === c.id);
  });

  const handleFilterChange = (val) => {
      setFilter(val);
      setCurrentPage(1);
      setSelectedClients([]);
  };

  const handleCheckboxToggle = (e, client) => {
      e.stopPropagation();
      if (e.target.checked) {
          if (!selectedClients.some(c => c.id === client.id)) setSelectedClients([...selectedClients, { id: client.id, internalId: client.internalId, codNum: client.codNum }]);
      } else {
          setSelectedClients(selectedClients.filter(c => c.id !== client.id));
      }
  };

  const handleMasterCheckboxToggle = (e) => {
      if (e.target.checked) {
          const newSelections = [...selectedClients];
          paginatedClients.forEach(c => {
              const isLibre = !c.cedulaVendedor || String(c.cedulaVendedor).trim() === '' || String(c.cedulaVendedor) === 'null';
              if (isLibre && !newSelections.some(sc => sc.id === c.id)) {
                  newSelections.push({ id: c.id, internalId: c.internalId, codNum: c.codNum });
              }
          });
          setSelectedClients(newSelections);
      } else {
          const pageIds = paginatedClients.map(c => c.id);
          setSelectedClients(selectedClients.filter(sc => !pageIds.includes(sc.id)));
      }
  };

  const commitAssignments = async () => {
      if (selectedClients.length === 0) return;

      let targetId = state.user?.id;
      if (state.user?.role === 'encargado' || state.user?.role === 'administrador') {
          targetId = assignTargetSeller;
      }

      const targetUser = state.users.find(u => u.id === targetId);
      if (!targetUser || !targetUser.cedula) {
          alert('El vendedor seleccionado no tiene una Cédula Oficial atada para la Matriz.');
          return;
      }

      showToast(`Asignando ${selectedClients.length} clientes en Matriz remota...`);
      let successCount = 0;

      // Iterar e invocar el endpoint Externo MATRIX a través del proxy/función
      for (let c of selectedClients) {
          const remoteId = c.internalId || c.codNum || c.id;
          const res = await asignarVendedorExterno(remoteId, targetUser.cedula);
          if (res && res.success) {
              successCount++;
          }
      }

      setSelectedClients([]);
      showToast(`¡Completado! ${successCount} clientes asignados a ${targetUser.name}. Sincronizando sistema.`);
      forceSilentSync(false); // Recarga silenciosa de state.clients desde la API Externa
  };

  const openClientModal = (c) => {
      setModalClient(c);
  };

  return (
    <div className="space-y-6 fade-in h-full flex flex-col pb-4">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex-shrink-0 gap-4">
        <div>
           <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3"><span className="material-icons text-indigo-500 bg-indigo-50 p-2 rounded-xl">dns</span> Directorio Global (Matriz)</h3>
           <p className="text-sm text-slate-500 mt-1">Navegador maestro sincronizado en vivo con la Base Externa. <span className="font-bold text-indigo-600">{totalFiltered} conectados</span>.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
           <select value={safeFilter} onChange={e => handleFilterChange(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm w-full sm:w-auto cursor-pointer">
              {!isAdmin ? (
                  <>
                     <option value="unassigned">Filtrar: IDs LIBRES</option>
                     <option value={state.user?.id}>Ver: Mis Clientes (Personal)</option>
                  </>
              ) : (
                  <>
                     <option value="unassigned">Filtrar: IDs LIBRES</option>
                     <option value="all">Mostrar Todos los IDs</option>
                     {validSellers.map(s => <option key={s.id} value={s.id}>Ver Cartera de: {s.name}</option>)}
                  </>
              )}
           </select>
        </div>
      </div>

      {/* BANNER DE ASIGNACIÓN */}
      {selectedClients.length > 0 && (
        <div className="bg-indigo-600 text-white p-4 rounded-2xl shadow-lg flex flex-col sm:flex-row justify-between items-center gap-4 fade-in flex-shrink-0">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-black font-mono text-lg">{selectedClients.length}</div>
              <div>
                 <p className="font-black text-sm">IDs Seleccionados</p>
                 <p className="text-[10px] text-indigo-200 font-medium">{isVendedor ? 'Listos para ser apropiados.' : 'Listos para sincronizar a un comercial.'}</p>
              </div>
           </div>
           <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              {!isVendedor && (state.user?.role === 'encargado' || state.user?.role === 'administrador') && (
                  <select value={assignTargetSeller} onChange={e => setAssignTargetSeller(e.target.value)} className="bg-white border border-indigo-200 text-indigo-800 text-sm font-bold rounded-xl px-4 py-2 outline-none shadow-sm cursor-pointer h-10 w-full sm:w-auto">
                     {validSellers.map(s => <option key={s.id} value={s.id}>Asignar a Comercial: {s.name}</option>)}
                  </select>
              )}
              <button onClick={commitAssignments} className="w-full sm:w-auto px-6 h-10 bg-white text-indigo-700 font-black rounded-xl hover:bg-indigo-50 hover:scale-105 transition-all shadow-sm flex items-center justify-center gap-2">
                 <span className="material-icons text-[18px]">how_to_reg</span> {isVendedor ? '¡Auto-Asignarme en Matriz!' : 'Sincronizar a Comercial'}
              </button>
           </div>
        </div>
      )}

      {/* TABLA PRINCIPAL */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto overflow-y-auto flex-1">
          <table className="w-full text-left border-collapse min-w-max">
            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
              <tr>
                <th className="px-4 py-4 w-12 text-center">
                  <input type="checkbox" disabled={isVendedor} checked={isAllCurrentPageSelected} onChange={handleMasterCheckboxToggle} className={`w-4 h-4 rounded border-slate-300 ${isVendedor ? 'bg-slate-100 cursor-not-allowed opacity-50' : 'text-indigo-600 cursor-pointer focus:ring-indigo-500'}`} title={isVendedor ? 'Bloqueado' : 'Seleccionar IDs libres de esta página'} />
                </th>
                <th className="px-4 py-4 pl-0 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-4 text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider">ID Cliente</th>
                <th className="px-4 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Contacto Matrix</th>
                <th className="px-4 py-4 text-center text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Ficha Completa</th>
              </tr>
            </thead>
            <tbody>
              {paginatedClients.length === 0 ? (
                <tr><td colSpan="5" className="p-16 text-center"><span className="material-icons text-slate-300 text-5xl mb-3 block">search_off</span><p className="text-slate-500 font-medium text-lg">No hay IDs que coincidan con los filtros actuales en la Matriz.</p></td></tr>
              ) : paginatedClients.map(c => {
                  const isLibre = !c.cedulaVendedor || String(c.cedulaVendedor).trim() === '' || String(c.cedulaVendedor) === 'null';
                  const canSelect = isLibre || !isVendedor;
                  const isChecked = selectedClients.some(sc => sc.id === c.id);
                  let ownerBadge = null;

                  if (!isLibre) {
                      const owner = validSellers.find(u => String(u.cedula) === String(c.cedulaVendedor));
                      const ownerName = owner ? owner.name.split(' ')[0] : 'Vendedor Matriz';
                      const color = sellerColorMap[owner ? owner.id : 'default'] || '#64748b';
                      ownerBadge = <span style={{backgroundColor:`${color}15`, color, borderColor:`${color}40`}} className="px-2 py-1 rounded-lg border font-black text-[10px] uppercase tracking-wider flex items-center w-max gap-1 shadow-sm"><span className="material-icons text-[12px]">how_to_reg</span> {ownerName}</span>;
                  } else {
                      ownerBadge = <span className="bg-emerald-100 text-emerald-700 border-emerald-200 px-2 py-1 rounded-lg border font-black text-[10px] uppercase tracking-wider flex items-center w-max gap-1 shadow-sm"><span className="material-icons text-[12px]">person_add_disabled</span> LIBRE</span>;
                  }

                  return (
                    <tr key={c.id} onClick={() => openClientModal(c)} className="border-b border-slate-100 hover:bg-indigo-50/50 transition cursor-pointer group">
                       <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" disabled={!canSelect} checked={isChecked} onChange={e => handleCheckboxToggle(e, c)} className={`w-4 h-4 rounded border-slate-300 ${!canSelect ? 'bg-slate-100 cursor-not-allowed opacity-50' : 'text-indigo-600 cursor-pointer focus:ring-indigo-500'}`} />
                       </td>
                       <td className="px-4 py-3 pl-0">{ownerBadge}</td>
                       <td className="px-4 py-3">
                         <p className="font-black text-xl text-indigo-600 font-mono tracking-wider group-hover:text-indigo-800 transition">{c.id}</p>
                         <p className="text-[9px] font-bold text-slate-400 mt-0.5 truncate max-w-[200px] uppercase tracking-wider" title={c.name || ''}>{c.name || 'Sin Nombre'}</p>
                       </td>
                       <td className="px-4 py-3">
                         <p className="text-xs font-mono font-bold text-slate-600 flex items-center gap-1"><span className="material-icons text-[12px] text-slate-400">phone</span> {c.phone || '-'}</p>
                         <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5 truncate max-w-[200px]" title={c.mail || ''}><span className="material-icons text-[12px] text-slate-400">mail</span> {c.mail || '-'}</p>
                       </td>
                       <td className="px-4 py-3 text-center"><span className="material-icons text-slate-300 group-hover:text-indigo-500 transition text-[18px]">visibility</span></td>
                    </tr>
                  )
              })}
            </tbody>
          </table>
        </div>
        
        {/* PAGINACIÓN */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4 flex-shrink-0">
           <p className="text-xs font-bold text-slate-500">
              Mostrando página <span className="text-slate-800">{currentPage}</span> de <span className="text-indigo-600">{totalFiltered}</span> conectados
           </p>
           <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm">
                 <span className="material-icons">chevron_left</span>
              </button>
              <div className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-700 shadow-sm">
                 Pág. {currentPage} de {totalPages}
              </div>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm">
                 <span className="material-icons">chevron_right</span>
              </button>
           </div>
        </div>
      </div>

      {/* MODAL GESTION CLIENTE IMPORTACION */}
      {modalClient && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[9999] fade-in p-4" onClick={() => setModalClient(null)}>
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-start bg-slate-50 flex-shrink-0">
                 <div>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2 flex items-center gap-1"><span className="material-icons text-[14px]">contact_page</span> Ficha Matriz</p>
                    <h3 className="text-4xl font-black text-indigo-600 font-mono leading-tight flex items-center flex-wrap gap-y-2">
                      {modalClient.id} 
                      {(!modalClient.cedulaVendedor || modalClient.cedulaVendedor === 'null') ? (
                          <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-lg ml-3 uppercase shadow-sm border border-emerald-200 font-sans">ID LIBRE</span>
                      ) : (
                          <span className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-2 py-1 rounded-lg ml-3 uppercase shadow-sm border border-indigo-200 font-sans">CEDULA COMERCIAL: {modalClient.cedulaVendedor}</span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 mt-2 font-bold uppercase tracking-wider">{modalClient.name || 'Sin Nombre Registrado'}</p>
                 </div>
                 <button onClick={() => setModalClient(null)} className="w-10 h-10 bg-white shadow-sm border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-full flex items-center justify-center transition flex-shrink-0"><span className="material-icons">close</span></button>
              </div>
              
              <div className="p-8 bg-white max-h-[65vh] overflow-y-auto flex flex-col gap-6">
                 
                 <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100">
                    <div className="flex justify-between items-center mb-4">
                       <h4 className="text-xs font-black text-indigo-700 uppercase tracking-wider flex items-center gap-2"><span className="material-icons">perm_contact_calendar</span> Contacto en Matriz</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Teléfono Principal</p>
                          <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <span className="material-icons text-slate-400 text-[18px]">phone</span> 
                            {modalClient.phone || <span className="italic text-slate-400 font-normal">No registrado</span>}
                          </p>
                       </div>
                       <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Correo Electrónico</p>
                          <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <span className="material-icons text-slate-400 text-[18px]">mail</span> 
                            {modalClient.mail || <span className="italic text-slate-400 font-normal">No registrado</span>}
                          </p>
                       </div>
                    </div>
                 </div>

                 <div>
                    <h4 className="text-xs font-black text-slate-700 mb-4 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2"><span className="material-icons text-slate-400">business</span> Datos Extra</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                       <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dirección de Trabajo</p><p className="text-sm font-bold text-slate-800">{modalClient.address || '-'}</p></div>
                       <div className="md:col-span-2"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nombre Fantasía</p><p className="text-sm font-bold text-slate-800">{modalClient.fantasyName || '-'}</p></div>
                    </div>
                 </div>
                 
              </div>
              
              <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-end">
                 <button onClick={() => setModalClient(null)} className="px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white font-black rounded-xl shadow-md transition">Cerrar Ficha</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
