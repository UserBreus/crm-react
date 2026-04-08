import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { execSQL } from '../api';

// MatemÃ¡tica de contraste inteligente
function getContrastYIQ(hexcolor) {
    if (!hexcolor) return '#1e293b';
    hexcolor = hexcolor.replace("#", "");
    if (hexcolor.length === 3) {
        hexcolor = hexcolor.split('').map(c => c + c).join('');
    }
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#1e293b' : '#ffffff';
}

function formatDateReal(dateStr) {
    if (!dateStr || dateStr === '-') return '-';
    try {
        const d = new Date(dateStr.toString().replace('Z', '').replace(' ', 'T'));
        if (isNaN(d.getTime())) return dateStr;
        const pad = n => n.toString().padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch(e) { return dateStr; }
}

export default function VisorView() {
  const { state, updateState } = useAppContext();

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  
  const serviceList = useMemo(() => state.datosConfig?.filter(c => c.servicio !== 'APPSCRIPT_BRIDGE').map(c => c.servicio) || [], [state.datosConfig]);
  const [currentService, setCurrentService] = useState('');
  
  useEffect(() => {
     if (!currentService && serviceList.length > 0) {
         setCurrentService(serviceList[0]);
         updateState({ visorService: serviceList[0] });
     }
  }, [serviceList, currentService]);

  const handleSelectService = (s) => {
      setCurrentService(s);
      setCurrentPage(1);
      updateState({ visorService: s });
  };

  const [modalOrder, setModalOrder] = useState(null);
  const [paginatedOrders, setPaginatedOrders] = useState([]);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
     let mounted = true;
     if (!currentService) return;

     const fetchVisor = async () => {
         setLoading(true);
         const term = (state.searchTerm || '').replace(/'/g, '').toLowerCase().trim();
         
         let whereClause = `srv.servicio = '${currentService}'`;
         if (term) {
              whereClause += ` AND (m.orden_id LIKE '%${term}%' OR m.cliente_id LIKE '%${term}%' OR srv.trabajo LIKE '%${term}%' OR srv.producto LIKE '%${term}%' OR srv.modo LIKE '%${term}%' OR srv.estado LIKE '%${term}%')`;
         }

         try {
             // 1. Exact count for pagination
             const countRes = await execSQL(`SELECT COUNT(1) as total FROM ordenes_servicios srv JOIN ordenes_maestras m ON srv.orden_id = m.orden_id WHERE ${whereClause}`);
             const total = (countRes && countRes[0] && countRes[0].total) ? parseInt(countRes[0].total) : 0;
             if (!mounted) return;
             setTotalFiltered(total);

             const maxPage = Math.ceil(total / itemsPerPage) || 1;
             const safePage = Math.min(currentPage, maxPage);
             if (currentPage !== safePage && safePage > 0) {
                 setCurrentPage(safePage);
             }

             // 2. Fetch data via SQL Server OFFSET FETCH
             const q = `
                SELECT m.orden_id as orden, m.cliente_id as clientId, m.fecha_ingreso as fecha,
                       srv.servicio, srv.trabajo, srv.producto, srv.modo, srv.cantidad, srv.estado
                FROM ordenes_servicios srv JOIN ordenes_maestras m ON srv.orden_id = m.orden_id
                WHERE ${whereClause}
                ORDER BY m.fecha_ingreso DESC
                OFFSET ${(safePage - 1) * itemsPerPage} ROWS FETCH NEXT ${itemsPerPage} ROWS ONLY
             `;
             const pageRes = await execSQL(q);
             if (mounted) {
                 const arr = Array.isArray(pageRes) ? pageRes : [];
                 const mappedRows = arr.map(row => {
                     return {
                         orden: row.orden,
                         clientId: row.clientId,
                         fecha: row.fecha,
                         timestamp: row.fecha ? new Date(row.fecha.replace('Z', '').replace(' ', 'T')).getTime() : 0,
                         detalleServicios: {
                             [row.servicio]: {
                                 trabajo: row.trabajo,
                                 producto: row.producto,
                                 modo: row.modo,
                                 cantidad: row.cantidad,
                                 estado: row.estado
                             }
                         }
                     }
                 });
                 setPaginatedOrders(mappedRows);
                 setLoading(false);
             }
         } catch (e) {
             console.error("SQL Error in VisorView", e);
             if (mounted) setLoading(false);
         }
     };
     fetchVisor();
     return () => mounted = false;
  }, [currentService, state.searchTerm, currentPage, state.reloadTrigger]);

  const totalPages = Math.ceil(totalFiltered / itemsPerPage) || 1;
  const startIdx = (currentPage - 1) * itemsPerPage;

  const handlePageChange = (val) => {
     let p = parseInt(val);
     if (isNaN(p) || p < 1) p = 1;
     if (p > totalPages) p = totalPages;
     setCurrentPage(p);
  };

  if (serviceList.length === 0) {
      return <div className="bg-white p-12 rounded-3xl shadow-sm border border-slate-200 text-center text-slate-500 font-bold">No hay servicios configurados en la base de datos.</div>;
  }

  // Precalcula modal si existe
  let modalClientName = 'No registrado en Directorio';
  let modalClientPhone = '-';
  if (modalOrder) {
      const clientInfo = (state.clients || []).find(c => String(c.id).toLowerCase() === String(modalOrder.clientId).toLowerCase());
      if (clientInfo) {
          modalClientName = clientInfo.name || modalClientName;
          modalClientPhone = clientInfo.phone || modalClientPhone;
      }
  }

  return (
    <div className="flex flex-col h-full fade-in max-w-[1600px] mx-auto w-full pb-8 gap-6">
      
      {/* CABECERA */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between flex-shrink-0">
         <div>
           <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2"><span className="material-icons text-indigo-500">visibility</span> Visor de Producción Local</h3>
           <p className="text-sm text-slate-500 mt-1">Busca y filtra a máxima velocidad usando la base de datos descargada en tu memoria.</p>
           {state.lastSyncTimestamp && (
             <p className="text-[11px] font-bold text-slate-400 mt-2 flex items-center gap-1">
               <span className="material-icons text-[14px]">cloud_sync</span> 
               Última actualización: {new Date(state.lastSyncTimestamp).toLocaleTimeString()} 
               {state.lastSyncMsg && <span className="ml-2 text-indigo-500">• {state.lastSyncMsg}</span>}
             </p>
           )}
         </div>
         <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
           <select value={currentService} onChange={e => handleSelectService(e.target.value)} className="p-3 border border-slate-200 rounded-xl outline-none font-bold text-indigo-700 bg-slate-50 flex-1 w-full sm:min-w-[250px] cursor-pointer shadow-sm">
             {serviceList.map(s => <option key={s} value={s}>{s}</option>)}
           </select>
         </div>
      </div>

      {/* CONTENEDOR TABLA */}
      <div className="flex-1 bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col relative min-h-[400px]">
         {/* SUBTLE BACKGROUND LOADING INDICATOR */}
         {loading && paginatedOrders.length > 0 && (
             <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-100 overflow-hidden z-20">
                 <div className="h-full bg-indigo-500 rounded-r-full animate-[progress_1s_ease-in-out_infinite]" style={{ width: '30%' }}></div>
             </div>
         )}

         {loading && paginatedOrders.length === 0 ? (
             <div className="p-10 h-full flex flex-col items-center justify-center text-slate-500 flex-1 bg-slate-50">
               <span className="material-icons text-6xl mb-3 text-indigo-300 animate-spin">sync</span>
               <p className="font-bold text-lg text-slate-600">Conectando a Motor SQL...</p>
               <p className="text-sm text-slate-400 mt-1">Sincronizando el padrón.</p>
             </div>
         ) : paginatedOrders.length === 0 ? (
             <div className="p-10 h-full flex flex-col items-center justify-center text-slate-500 flex-1 bg-slate-50">
               <span className="material-icons text-6xl mb-3 text-slate-300">search_off</span>
               <p className="font-bold text-lg text-slate-600">No hay resultados.</p>
               <p className="text-sm text-slate-400 mt-1">No se encontraron coincidencias para "{state.searchTerm}".</p>
            </div>
         ) : (
             <div className="overflow-x-auto overflow-y-auto h-full w-full flex-1">
                 <table className="w-full text-left border-collapse min-w-max">
                    <thead className="bg-white sticky top-0 z-10 shadow-sm border-b border-slate-200">
                       <tr>
                          <th className="px-4 py-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider whitespace-nowrap">NÂ° Orden</th>
                          <th className="px-4 py-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider whitespace-nowrap">ID Cliente</th>
                          <th className="px-4 py-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider whitespace-nowrap">Trabajo</th>
                          <th className="px-4 py-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider whitespace-nowrap">Producto</th>
                          <th className="px-4 py-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider text-center">Modo</th>
                          <th className="px-4 py-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider text-right whitespace-nowrap">Cant.</th>
                          <th className="px-4 py-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap">Estado</th>
                          <th className="px-4 py-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider whitespace-nowrap">Fecha Ingreso</th>
                       </tr>
                    </thead>
                    <tbody>
                       {paginatedOrders.map(o => {
                           const det = o.detalleServicios[currentService] || {};
                           const estadoVal = (det.estado || '').trim().toLowerCase();
                           
                           let rowStyle = {};
                           let bgClass = "bg-white hover:bg-slate-50 border-slate-100";
                           
                           const customHexColor = state.coloresEstados ? state.coloresEstados[estadoVal] : null;
                           if (customHexColor && customHexColor.startsWith('#')) {
                               rowStyle = { backgroundColor: customHexColor, color: getContrastYIQ(customHexColor) };
                               bgClass = "border-transparent hover:brightness-95";
                           }

                           return (
                               <tr key={o.orden} onClick={() => setModalOrder(o)} className={`transition border-b cursor-pointer group ${bgClass}`} style={rowStyle}>
                                   <td className="px-4 py-3 text-xs font-black whitespace-nowrap transition">{o.orden || '-'}</td>
                                   <td className="px-4 py-3 text-xs font-black font-mono tracking-wider whitespace-nowrap">{o.clientId || '-'}</td>
                                   <td className="px-4 py-3 text-xs max-w-[200px] truncate" title={det.trabajo || ''}>{det.trabajo || '-'}</td>
                                   <td className="px-4 py-3 text-xs max-w-[200px] truncate" title={det.producto || ''}>{det.producto || '-'}</td>
                                   <td className="px-4 py-3 text-[10px] font-bold uppercase whitespace-nowrap text-center">{det.modo || '-'}</td>
                                   <td className="px-4 py-3 text-sm font-black text-right whitespace-nowrap">{(parseFloat(det.cantidad) || 0).toLocaleString()}</td>
                                   <td className="px-4 py-3 text-center">
                                       {det.estado && det.estado.trim() !== '' ? (
                                           <span className="px-2 py-1 rounded-md font-bold uppercase text-[10px] border whitespace-nowrap shadow-sm" style={{borderColor:'currentColor', color: rowStyle.color || '#1e293b'}}>{det.estado}</span>
                                       ) : '-'}
                                   </td>
                                   <td className="px-4 py-3 text-[10px] font-mono font-bold whitespace-nowrap">{formatDateReal(o.fecha)}</td>
                               </tr>
                           );
                       })}
                    </tbody>
                 </table>
             </div>
         )}
         
         <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4 flex-shrink-0">
            <p className="text-xs font-bold text-slate-500">
               Mostrando <span className="text-slate-800">{totalFiltered > 0 ? startIdx + 1 : 0}</span> al <span className="text-slate-800">{startIdx + paginatedOrders.length}</span> de <span className="text-indigo-600">{totalFiltered}</span> en la Base de Datos.
            </p>
            <div className="flex items-center gap-2">
               <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1 || loading} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm">
                  <span className="material-icons">chevron_left</span>
               </button>
               <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-700 shadow-sm flex items-center gap-2">
                  PÃ¡g. <input type="number" min="1" max={totalPages} value={currentPage} onChange={e => handlePageChange(e.target.value)} onClick={e => e.stopPropagation()} className="w-12 text-center border border-slate-300 rounded-md outline-none py-1 focus:border-indigo-500 bg-slate-50" /> de {totalPages}
               </div>
               <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages || loading} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm">
                  <span className="material-icons">chevron_right</span>
               </button>
            </div>
         </div>
      </div>

      {/* MODAL FICHA ORDEN */}
      {modalOrder && (
         <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[9999] fade-in p-4 md:p-6" onClick={() => setModalOrder(null)}>
            <div className="bg-slate-50 rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
               <div className="px-8 py-6 border-b border-slate-200 bg-white flex justify-between items-start flex-shrink-0">
                  <div>
                     <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1 flex items-center gap-1"><span className="material-icons text-[14px]">receipt_long</span> Ficha Técnica de Orden</p>
                     <h3 className="text-3xl font-black text-slate-800 font-mono">{modalOrder.orden}</h3>
                     <div className="flex flex-wrap items-center gap-4 mt-3">
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg flex items-center gap-1"><span className="material-icons text-[14px]">calendar_today</span> Ingreso: {formatDateReal(modalOrder.fecha)}</span>
                     </div>
                  </div>
                  <button onClick={() => setModalOrder(null)} className="w-10 h-10 bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 rounded-full flex items-center justify-center transition flex-shrink-0"><span className="material-icons text-sm">close</span></button>
               </div>
               
               <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                     <h4 className="font-black text-xs text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2 flex items-center gap-2"><span className="material-icons text-[16px]">person</span> Datos del Cliente</h4>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">ID Cliente (Llave)</p><p className="text-base font-black font-mono text-indigo-600 bg-indigo-50 px-2 py-1 rounded inline-block shadow-sm">{modalOrder.clientId}</p></div>
                        <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Nombre Registrado</p><p className="text-sm font-bold text-slate-700">{modalClientName}</p></div>
                        <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">TelÃ©fono</p><p className="text-sm font-bold text-slate-700">{modalClientPhone}</p></div>
                     </div>
                  </div>

                  <div>
                     <h4 className="font-black text-xs text-slate-400 uppercase tracking-widest mb-3 ml-2 flex items-center gap-2"><span className="material-icons text-[16px]">layers</span> Ruta de ProducciÃ³n</h4>
                     {modalOrder.detalleServicios && Object.keys(modalOrder.detalleServicios).length > 0 ? (
                         Object.keys(modalOrder.detalleServicios).map(srv => {
                             const detail = modalOrder.detalleServicios[srv];
                             const estadoVal = (detail.estado || '').trim().toLowerCase();
                             const customHexColor = state.coloresEstados ? state.coloresEstados[estadoVal] : null;

                             let customStyle = {};
                             let estadoColorClass = 'text-indigo-700 bg-indigo-50 border-indigo-100';

                             if (customHexColor && customHexColor.startsWith('#')) {
                                 const textColor = getContrastYIQ(customHexColor);
                                 customStyle = { backgroundColor: customHexColor, color: textColor, borderColor: customHexColor };
                                 estadoColorClass = 'shadow-sm';
                             }

                             return (
                                 <div key={srv} className="p-5 border border-slate-100 rounded-2xl bg-white shadow-sm mb-4 last:mb-0 hover:border-indigo-200 transition">
                                     <div className="flex justify-between items-center mb-3 border-b border-slate-50 pb-2">
                                         <h4 className="font-black text-indigo-600 text-sm uppercase tracking-wider flex items-center gap-2"><span className="material-icons text-[16px]">account_tree</span> Sector: {srv}</h4>
                                         <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase border ${estadoColorClass}`} style={customStyle}>{detail.estado || 'REGISTRADO'}</span>
                                     </div>
                                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                         <div><p className="text-[10px] font-bold text-slate-400 uppercase">Trabajo</p><p className="text-sm font-bold text-slate-700 truncate" title={detail.trabajo}>{detail.trabajo || '-'}</p></div>
                                         <div><p className="text-[10px] font-bold text-slate-400 uppercase">Producto</p><p className="text-sm font-bold text-slate-700 truncate" title={detail.producto}>{detail.producto || '-'}</p></div>
                                         <div><p className="text-[10px] font-bold text-slate-400 uppercase">Modo</p><p className="text-sm font-bold text-amber-600 uppercase">{detail.modo || '-'}</p></div>
                                         <div><p className="text-[10px] font-bold text-slate-400 uppercase">Cantidad</p><p className="text-sm font-black text-slate-800">{(parseFloat(detail.cantidad) || 0).toLocaleString()} Und.</p></div>
                                     </div>
                                 </div>
                             );
                         })
                     ) : (
                         <div className="p-8 text-center text-slate-400 font-bold">No hay detalles de servicios asociados a esta orden.</div>
                     )}
                  </div>
               </div>
            </div>
         </div>
      )}

    </div>
  );
}
