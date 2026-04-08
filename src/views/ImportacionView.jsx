import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { execSQL } from '../api';

const SELLER_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6366f1'];

export default function ImportacionView() {
  const { state, updateState, showToast } = useAppContext();

  const isVendedor = state.user?.role === 'vendedor';

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Defaults to 'unassigned' if no explicit filter is given
  const [filter, setFilter] = useState(isVendedor ? 'unassigned' : 'unassigned');
  
  const [selectedClients, setSelectedClients] = useState([]);
  const [assignTargetSeller, setAssignTargetSeller] = useState('');

  const [modalClient, setModalClient] = useState(null);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editMail, setEditMail] = useState('');

  const validSellers = useMemo(() => state.users.filter(u => u.role === 'vendedor' || u.role === 'encargado'), [state.users]);
  
  const sellerColorMap = useMemo(() => {
     const map = {};
     validSellers.forEach((u, i) => { map[u.id] = SELLER_COLORS[i % SELLER_COLORS.length]; });
     return map;
  }, [validSellers]);

  // Initial target assigning (for admins)
  if (!assignTargetSeller && validSellers.length > 0) {
      setAssignTargetSeller(validSellers[0].id);
  }

  // Candado 1: Forzar filtro de vendedor si intenta ver algo prohibido
  const safeFilter = useMemo(() => {
     if (isVendedor && filter !== 'unassigned' && String(filter) !== String(state.user?.id)) {
         return 'unassigned';
     }
     return filter;
  }, [filter, isVendedor, state.user]);

  const [paginatedClients, setPaginatedClients] = useState([]);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
      let mounted = true;
      const fetchClients = async () => {
          setLoading(true);
          const term = (state.searchTerm || '').replace(/'/g, '').toLowerCase().trim();
          
          let whereClause = '1=1';
          if (term) {
              whereClause += ` AND (id LIKE '%${term}%' OR nombre_completo LIKE '%${term}%' OR telefono LIKE '%${term}%' OR mail LIKE '%${term}%' OR rut LIKE '%${term}%')`;
          }

          if (isVendedor) {
              if (safeFilter === 'unassigned') {
                  whereClause += ` AND (vendedor_id IS NULL OR vendedor_id = '' OR vendedor_id = 'null')`;
              } else if (String(safeFilter) === String(state.user?.id)) {
                  whereClause += ` AND vendedor_id = '${state.user?.id}'`;
              } else {
                  whereClause += ' AND 1=0'; // Should not happen
              }
          } else {
              if (safeFilter === 'unassigned') {
                  whereClause += ` AND (vendedor_id IS NULL OR vendedor_id = '' OR vendedor_id = 'null')`;
              } else if (safeFilter === 'assigned') {
                  whereClause += ` AND (vendedor_id IS NOT NULL AND vendedor_id != '' AND vendedor_id != 'null')`;
              } else if (safeFilter !== 'all') {
                  whereClause += ` AND vendedor_id = '${safeFilter}'`;
              }
          }

          try {
              const countRes = await execSQL(`SELECT COUNT(1) as total FROM clientes WHERE ${whereClause}`);
              const total = (countRes && countRes[0]) ? parseInt(countRes[0].total) : 0;
              if (!mounted) return;
              setTotalFiltered(total);

              const maxPage = Math.ceil(total / itemsPerPage) || 1;
              const safePage = Math.min(currentPage, maxPage);
              if (currentPage !== safePage && safePage > 0) {
                  setCurrentPage(safePage);
              }

              const q = `SELECT * FROM clientes WHERE ${whereClause} ORDER BY fecha_registro DESC OFFSET ${(safePage - 1) * itemsPerPage} ROWS FETCH NEXT ${itemsPerPage} ROWS ONLY`;
              const pageRes = await execSQL(q);

              if (mounted) {
                  if (Array.isArray(pageRes)) {
                      const mapped = pageRes.map(c => ({
                      id: c.id,
                      name: c.nombre_completo,
                      sellerId: c.vendedor_id,
                      phone: c.telefono,
                      mail: c.mail,
                      rut: c.rut,
                      departamento: c.departamento,
                      localidad: c.localidad,
                      direccion: c.direccion_exacta,
                      tipoRetiro: c.tipo_retiro,
                      empresa: c.empresa,
                      createdAt: c.fecha_creacion,
                      timestamp: c.fecha_registro
                  }));
                  setPaginatedClients(mapped);
              }
              setLoading(false);
          }
      } catch(e) { console.error(e); if(mounted) setLoading(false); }
      };
      fetchClients();
      return () => mounted = false;
  }, [state.searchTerm, safeFilter, currentPage, isVendedor, state.user]);

  const totalPages = Math.ceil(totalFiltered / itemsPerPage) || 1;
  const startIdx = (currentPage - 1) * itemsPerPage;

  const isAllCurrentPageSelected = paginatedClients.length > 0 && paginatedClients.every(c => {
      const isLibre = !c.sellerId || String(c.sellerId).trim() === '' || String(c.sellerId) === 'null';
                  const canSelect = isLibre || !isVendedor;
      if (!isLibre) return true;
      return selectedClients.some(sc => sc.id === c.id);
  });

  const handleFilterChange = (val) => {
      setFilter(val);
      setCurrentPage(1);
      setSelectedClients([]);
  };

  const handleCheckboxToggle = (e, id) => {
      e.stopPropagation();

      if (e.target.checked) {
          if (!selectedClients.some(c => c.id === id)) setSelectedClients([...selectedClients, { id }]);
      } else {
          setSelectedClients(selectedClients.filter(c => c.id !== id));
      }
  };

  const handleMasterCheckboxToggle = (e) => {

      if (e.target.checked) {
          const newSelections = [...selectedClients];
          paginatedClients.forEach(c => {
              const isLibre = !c.sellerId || String(c.sellerId).trim() === '' || String(c.sellerId) === 'null';
                  const canSelect = isLibre || !isVendedor;
              if (isLibre && !newSelections.some(sc => sc.id === c.id)) {
                  newSelections.push({ id: c.id });
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

      if (!targetId) {
          alert('Selecciona un vendedor destino.');
          return;
      }

      const clientIdsToAssign = selectedClients.map(c => c.id);
      setSelectedClients([]);
      showToast('Asignando cartera en Base de Datos...');

      try {
          const placeholders = clientIdsToAssign.map(() => '?').join(',');
          const query = `UPDATE clientes SET vendedor_id = ? WHERE id IN (${placeholders})`;
          const params = [targetId, ...clientIdsToAssign];
          
          const res = await execSQL(query, params);
          if (res?.error) {
              alert("Error asignando clientes: " + res.error);
              return;
          }
          showToast('¡Asignación completada exitosamente! Por favor recarga para ver los cambios locales.');
      } catch (err) {
          console.error(err);
          alert("Error asignando clientes.");
      }
  };

  const openClientModal = (c) => {
      setModalClient(c);
      setIsEditingContact(false);
      setEditPhone(c.phone || '');
      setEditMail(c.mail || '');
  };

  const saveContactChanges = async () => {
      if (!modalClient) return;
      showToast('Guardando nuevo contacto...');
      
      const query = "UPDATE clientes SET telefono = ?, mail = ? WHERE id = ?";
      const res = await execSQL(query, [editPhone, editMail, modalClient.id]);
      
      if (res?.error) {
          alert("Error actualizando contacto: " + res.error);
          return;
      }

      showToast('¡Contacto actualizado correctamente!');
      
      const updatedClients = state.clients.map(c => 
          c.id === modalClient.id ? { ...c, phone: editPhone, mail: editMail } : c
      );
      updateState({ clients: updatedClients });
      setModalClient({ ...modalClient, phone: editPhone, mail: editMail });
      setIsEditingContact(false);
  };

  return (
    <div className="space-y-6 fade-in h-full flex flex-col pb-4">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex-shrink-0 gap-4">
        <div>
           <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3"><span className="material-icons text-indigo-500 bg-indigo-50 p-2 rounded-xl">dns</span> Cartera Global (Base)</h3>
           <p className="text-sm text-slate-500 mt-1">Directorio maestro de clientes enfocado en el ID. <span className="font-bold text-indigo-600">{totalFiltered} registros</span>.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
           <select value={safeFilter} onChange={e => handleFilterChange(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm w-full sm:w-auto cursor-pointer">
              {isVendedor ? (
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
                 <p className="text-[10px] text-indigo-200 font-medium">{isVendedor ? 'Listos para ser apropiados.' : 'Listos para ser asignados a un comercial.'}</p>
              </div>
           </div>
           <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              {!isVendedor && (state.user?.role === 'encargado' || state.user?.role === 'administrador') && (
                  <select value={assignTargetSeller} onChange={e => setAssignTargetSeller(e.target.value)} className="bg-white border border-indigo-200 text-indigo-800 text-sm font-bold rounded-xl px-4 py-2 outline-none shadow-sm cursor-pointer h-10 w-full sm:w-auto">
                     {validSellers.map(s => <option key={s.id} value={s.id}>Asignar a ID: {s.id}</option>)}
                  </select>
              )}
              <button onClick={commitAssignments} className="w-full sm:w-auto px-6 h-10 bg-white text-indigo-700 font-black rounded-xl hover:bg-indigo-50 hover:scale-105 transition-all shadow-sm flex items-center justify-center gap-2">
                 <span className="material-icons text-[18px]">how_to_reg</span> {isVendedor ? '¡Auto-Asignarme!' : 'Confirmar Asignación'}
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
                <th className="px-4 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Contacto</th>
                <th className="px-4 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Datos Fiscales</th>
                <th className="px-4 py-4 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Ubicación</th>
                <th className="px-4 py-4 text-center text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Ficha</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="p-16 text-center"><span className="material-icons text-indigo-300 animate-spin text-5xl mb-3 block">sync</span><p className="text-slate-500 font-medium text-lg">Cargando base de datos...</p></td></tr>
              ) : paginatedClients.length === 0 ? (
                <tr><td colSpan="7" className="p-16 text-center"><span className="material-icons text-slate-300 text-5xl mb-3 block">search_off</span><p className="text-slate-500 font-medium text-lg">No hay IDs que coincidan con los filtros actuales.</p></td></tr>
              ) : paginatedClients.map(c => {
                  const isLibre = !c.sellerId || String(c.sellerId).trim() === '' || String(c.sellerId) === 'null';
                  const canSelect = isLibre || !isVendedor;
                  const isChecked = selectedClients.some(sc => sc.id === c.id);
                  let ownerBadge = null;

                  if (!isLibre) {
                      const owner = validSellers.find(u => String(u.id) === String(c.sellerId));
                      const ownerName = owner ? owner.name.split(' ')[0] : 'Desc.';
                      const color = sellerColorMap[c.sellerId] || '#64748b';
                      ownerBadge = <span style={{backgroundColor:`${color}15`, color, borderColor:`${color}40`}} className="px-2 py-1 rounded-lg border font-black text-[10px] uppercase tracking-wider flex items-center w-max gap-1 shadow-sm"><span className="material-icons text-[12px]">how_to_reg</span> {ownerName}</span>;
                  } else {
                      ownerBadge = <span className="bg-emerald-100 text-emerald-700 border-emerald-200 px-2 py-1 rounded-lg border font-black text-[10px] uppercase tracking-wider flex items-center w-max gap-1 shadow-sm"><span className="material-icons text-[12px]">person_add_disabled</span> LIBRE</span>;
                  }

                  return (
                    <tr key={c.id} onClick={() => openClientModal(c)} className="border-b border-slate-100 hover:bg-indigo-50/50 transition cursor-pointer group">
                       <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" disabled={!canSelect} checked={isChecked} onChange={e => handleCheckboxToggle(e, c.id)} className={`w-4 h-4 rounded border-slate-300 ${!canSelect ? 'bg-slate-100 cursor-not-allowed opacity-50' : 'text-indigo-600 cursor-pointer focus:ring-indigo-500'}`} />
                       </td>
                       <td className="px-4 py-3 pl-0">{ownerBadge}</td>
                       <td className="px-4 py-3">
                         <p className="font-black text-xl text-indigo-600 font-mono tracking-wider group-hover:text-indigo-800 transition">{c.id}</p>
                         <p className="text-[9px] font-bold text-slate-400 mt-0.5 truncate max-w-[150px] uppercase tracking-wider" title={c.name || ''}>{c.name || 'Sin Nombre'}</p>
                       </td>
                       <td className="px-4 py-3">
                         <p className="text-xs font-mono font-bold text-slate-600 flex items-center gap-1"><span className="material-icons text-[12px] text-slate-400">phone</span> {c.phone || '-'}</p>
                         <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5 truncate max-w-[140px]" title={c.mail || ''}><span className="material-icons text-[12px] text-slate-400">mail</span> {c.mail || '-'}</p>
                       </td>
                       <td className="px-4 py-3"><p className="text-[10px] font-mono text-slate-500 mt-0.5">RUT: {c.rut || '-'}</p></td>
                       <td className="px-4 py-3"><p className="text-xs font-medium text-slate-600">{c.departamento || '-'}, {c.localidad || '-'}</p></td>
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
              Mostrando <span className="text-slate-800">{paginatedClients.length > 0 ? startIdx + 1 : 0}</span> al <span className="text-slate-800">{startIdx + paginatedClients.length}</span> de <span className="text-indigo-600">{totalFiltered}</span> IDs
           </p>
           <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1 || loading} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm">
                 <span className="material-icons">chevron_left</span>
              </button>
              <div className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-700 shadow-sm">
                 Pág. {currentPage} de {totalPages}
              </div>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages || loading} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm">
                 <span className="material-icons">chevron_right</span>
              </button>
           </div>
        </div>
      </div>

      {/* MODAL GESTION CLIENTE IMPORTACION */}
      {modalClient && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[9999] fade-in p-4" onClick={() => setModalClient(null)}>
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-start bg-slate-50 flex-shrink-0">
                 <div>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2 flex items-center gap-1"><span className="material-icons text-[14px]">contact_page</span> Ficha Maestra</p>
                    <h3 className="text-4xl font-black text-indigo-600 font-mono leading-tight flex items-center flex-wrap gap-y-2">
                      {modalClient.id} 
                      {(!modalClient.sellerId || modalClient.sellerId === 'null') ? (
                          <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-lg ml-3 uppercase shadow-sm border border-emerald-200 font-sans">ID LIBRE</span>
                      ) : (
                          <span className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-2 py-1 rounded-lg ml-3 uppercase shadow-sm border border-indigo-200 font-sans">COMERCIAL ID: {modalClient.sellerId}</span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 mt-2 font-bold uppercase tracking-wider">{modalClient.name || 'Sin Nombre Registrado'}</p>
                    <p className="text-[10px] text-slate-400 mt-3 font-medium flex items-center gap-4">
                       <span className="flex items-center gap-1"><span className="material-icons text-[14px]">event</span> Ingresado el: {modalClient.createdAt || '-'}</span>
                    </p>
                 </div>
                 <button onClick={() => setModalClient(null)} className="w-10 h-10 bg-white shadow-sm border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-full flex items-center justify-center transition flex-shrink-0"><span className="material-icons">close</span></button>
              </div>
              
              <div className="p-8 bg-white max-h-[65vh] overflow-y-auto flex flex-col gap-6">
                 
                 <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100">
                    <div className="flex justify-between items-center mb-4">
                       <h4 className="text-xs font-black text-indigo-700 uppercase tracking-wider flex items-center gap-2"><span className="material-icons">perm_contact_calendar</span> Contacto para ID: {modalClient.id}</h4>
                       {!isEditingContact && (
                          <button onClick={() => setIsEditingContact(true)} className="text-[10px] bg-white border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-100 transition shadow-sm flex items-center gap-1"><span className="material-icons text-[14px]">edit</span> Editar Contacto</button>
                       )}
                    </div>
                    
                    {!isEditingContact ? (
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
                    ) : (
                      <div className="flex flex-col gap-4">
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                               <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Nuevo Teléfono</label>
                               <input type="text" value={editPhone} onChange={e => setEditPhone(e.target.value)} className="w-full p-2.5 rounded-xl border border-indigo-200 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500" placeholder="Ej: 099123456" />
                            </div>
                            <div>
                               <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Nuevo Correo</label>
                               <input type="email" value={editMail} onChange={e => setEditMail(e.target.value)} className="w-full p-2.5 rounded-xl border border-indigo-200 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500" placeholder="Ej: correo@empresa.com" />
                            </div>
                         </div>
                         <div className="flex justify-end gap-2 mt-2">
                            <button onClick={() => { setIsEditingContact(false); setEditPhone(modalClient.phone || ''); setEditMail(modalClient.mail || ''); }} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200 rounded-lg transition">Cancelar</button>
                            <button onClick={saveContactChanges} className="px-5 py-2 text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg shadow-md transition flex items-center gap-1"><span className="material-icons text-[16px]">save</span> Guardar Cambios</button>
                         </div>
                      </div>
                    )}
                 </div>
  
                 <div>
                    <h4 className="text-xs font-black text-slate-700 mb-4 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2"><span className="material-icons text-slate-400">business</span> Datos Extra</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                       <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Empresa / Marca</p><p className="text-sm font-bold text-slate-800">{modalClient.empresa || '-'}</p></div>
                       <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">RUT / Cédula</p><p className="text-sm font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded inline-block">{modalClient.rut || '-'}</p></div>
                       <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Departamento</p><p className="text-sm font-bold text-slate-800">{modalClient.departamento || '-'}</p></div>
                       <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Localidad</p><p className="text-sm font-bold text-slate-800">{modalClient.localidad || '-'}</p></div>
                       <div className="md:col-span-2"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dirección Exacta</p><p className="text-sm font-bold text-slate-800">{modalClient.direccion || '-'}</p></div>
                       <div className="md:col-span-2"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipo de Retiro / Envío</p><p className="text-sm font-bold text-slate-800 bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-lg border border-emerald-100 inline-block mt-1">{modalClient.tipoRetiro || '-'}</p></div>
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
