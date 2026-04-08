import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { execSQL } from '../api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#0ea5e9', '#84cc16'];

export default function InteraccionesView() {
  const { state, updateState, showToast } = useAppContext();
  
  const [selectedClientFilter, setSelectedClientFilter] = useState('TODOS');
  
  // Modal states
  const [isNewSegOpen, setIsNewSegOpen] = useState(false);
  const [nsServices, setNsServices] = useState([]);
  const [nsClientId, setNsClientId] = useState('');
  const [nsClientName, setNsClientName] = useState('');
  const [nsThreadName, setNsThreadName] = useState('');
  const [nsMethod, setNsMethod] = useState('WhatsApp');
  const [nsIsClient, setNsIsClient] = useState(false);
  const [nsCategory, setNsCategory] = useState('Venta');
  const [nsType, setNsType] = useState('Positiva');
  const [nsText, setNsText] = useState('');
  
  const [viewSegClientId, setViewSegClientId] = useState(null);
  const [segViewTab, setSegViewTab] = useState('activo');
  const [currentSegId, setCurrentSegId] = useState(null);

  const [activeNoteServices, setActiveNoteServices] = useState([]);
  const [newNoteCategory, setNewNoteCategory] = useState('Venta');
  const [newNoteType, setNewNoteType] = useState('Positiva');
  const [newNoteText, setNewNoteText] = useState('');
  const [isNoteClient, setIsNoteClient] = useState(false);

  const [myClients, setMyClients] = useState([]);
  const [uSegs, setUSegs] = useState([]);
  const [allNotes, setAllNotes] = useState([]);
  const [loadingVars, setLoadingVars] = useState(true);

  useEffect(() => {
     let mounted = true;
     const fetchData = async () => {
         setLoadingVars(true);
         let filterStr = '';
         if (state.user?.role !== 'administrador' && state.user?.role !== 'encargado') {
             filterStr = `AND vendedor_id = '${state.user?.id}'`;
         } else if (state.managerView !== 'ALL') {
             filterStr = `AND vendedor_id = '${state.managerView === 'SELF' ? state.user?.id : state.managerView}'`;
         }

         try {
             const [clientsRes, segsRes] = await Promise.all([
                 execSQL(`SELECT id, nombre_completo, vendedor_id, telefono FROM clientes WHERE 1=1 ${filterStr}`),
                 execSQL(`SELECT id, cliente_id, cliente_nombre, servicios, medio, estado, vendedor_id, nombre_hilo, timestamp FROM seguimientos WHERE cliente_id IN (SELECT id FROM clientes WHERE 1=1 ${filterStr})`)
             ]);
             if (!mounted) return;
             
             const cArr = Array.isArray(clientsRes) ? clientsRes.map(c => ({
                id: c.id, name: c.nombre_completo, sellerId: c.vendedor_id, phone: c.telefono
             })) : [];
             
             const sArr = Array.isArray(segsRes) ? segsRes.map(s => ({
                id: s.id, clientId: s.cliente_id, clientName: s.cliente_nombre, service: s.servicios,
                method: s.medio, status: s.estado, sellerId: s.vendedor_id, threadName: s.nombre_hilo, timestamp: s.timestamp 
             })) : [];
             
             setMyClients(cArr);
             setUSegs(sArr);
             
             const nRes = await execSQL(`SELECT n.id, n.seguimiento_id, n.tipo, n.categoria, n.texto, n.servicio_nota, n.es_cliente, n.timestamp FROM notas_seguimiento n JOIN seguimientos s ON n.seguimiento_id=s.id JOIN clientes c ON s.cliente_id=c.id WHERE 1=1 ${filterStr.replace(/vendedor_id/g, 'c.vendedor_id')}`);
             if (mounted) {
                 const nArr = Array.isArray(nRes) ? nRes.map(n => ({
                    id: n.id, segId: n.seguimiento_id, type: n.tipo, category: n.categoria, text: n.texto, service: n.servicio_nota, isClient: n.es_cliente, timestamp: n.timestamp
                 })) : [];
                 setAllNotes(nArr);
                 setLoadingVars(false);
             }
         } catch(e) {
             console.error("Error fetching interactions", e);
             if (mounted) setLoadingVars(false);
         }
     };
     if (state.user) fetchData();
     return () => mounted = false;
  }, [state.managerView, state.user]);

  // Data for Method Doughnut
  const methodData = useMemo(() => {
     let counts = {};
     uSegs.forEach(s => {
         const m = s.method || 'Desconocido';
         counts[m] = (counts[m] || 0) + 1;
     });
     return {
         labels: Object.keys(counts),
         datasets: [{ data: Object.values(counts), backgroundColor: COLORS, borderWidth: 0 }]
     };
  }, [uSegs]);

  // Data for Service Performance Bar
  const srvPerfData = useMemo(() => {
      let srvPosNeg = {};
      const finalizedSegs = uSegs.filter(s => String(s.status).toLowerCase() === 'finalizado');
      
      finalizedSegs.forEach(seg => {
          const threadNotes = allNotes.filter(n => n.segId === seg.id).sort((a,b) => b.timestamp - a.timestamp);
          if (threadNotes.length > 0) {
              const lastNote = threadNotes[0];
              const isPos = lastNote.type === 'Positiva';
              const isNeg = lastNote.type === 'Negativa';
              if (isPos || isNeg) {
                  if (seg.service) {
                      const uniqSrv = [...new Set(seg.service.split(',').map(s => s.trim()).filter(Boolean))];
                      uniqSrv.forEach(s => {
                          if (!srvPosNeg[s]) srvPosNeg[s] = { pos: 0, neg: 0 };
                          if (isPos) srvPosNeg[s].pos++;
                          if (isNeg) srvPosNeg[s].neg++;
                      });
                  }
              }
          }
      });
      const labels = Object.keys(srvPosNeg);
      return {
          labels,
          datasets: [
              { label: 'Positivos', data: labels.map(s => srvPosNeg[s].pos), backgroundColor: '#10b981', borderRadius: 4 },
              { label: 'Negativos', data: labels.map(s => srvPosNeg[s].neg), backgroundColor: '#ef4444', borderRadius: 4 }
          ]
      };
  }, [uSegs, allNotes]);

  // Data for Client Thread Ranking
  const clientRankData = useMemo(() => {
      let rank = {};
      uSegs.forEach(seg => {
          const srvArr = seg.service ? seg.service.split(',').map(s => s.trim()) : [];
          if (selectedClientFilter === 'TODOS' || srvArr.includes(selectedClientFilter)) {
              const shortName = String(seg.clientId || '').substring(0, 12);
              rank[shortName] = (rank[shortName] || 0) + 1;
          }
      });
      const arr = Object.keys(rank).map(k => ({ name: k, total: rank[k] })).sort((a,b) => b.total - a.total).slice(0, 10);
      return {
          labels: arr.map(r => r.name),
          datasets: [{ label: 'Hilos Totales', data: arr.map(r => r.total), backgroundColor: '#3b82f6', borderRadius: 4 }]
      };
  }, [uSegs, selectedClientFilter]);

  // Client Cards (Grouped by Client)
  const clientCards = useMemo(() => {
      const map = {};
      uSegs.forEach(s => {
          if (!map[s.clientId]) map[s.clientId] = { clientId: s.clientId, clientName: s.clientName, activos: 0, finalizados: 0 };
          if (String(s.status).toLowerCase() === 'activo') map[s.clientId].activos++;
          else map[s.clientId].finalizados++;
      });
      const term = (state.searchTerm || '').toLowerCase();
      return Object.values(map).filter(c => 
          String(c.clientName).toLowerCase().includes(term) || String(c.clientId).toLowerCase().includes(term)
      );
  }, [uSegs, state.searchTerm]);

  const serviceListConfig = state.datosConfig?.map(c => c.servicio) || ['IMPRITEX'];

  const openClientSegs = (clientId) => {
     setViewSegClientId(clientId);
     setSegViewTab('activo');
     setCurrentSegId(null);
  };

  const cSegs = useMemo(() => {
      if (!viewSegClientId) return [];
      return uSegs.filter(s => String(s.clientId).toLowerCase() === String(viewSegClientId).toLowerCase()).sort((a,b) => b.timestamp - a.timestamp);
  }, [uSegs, viewSegClientId]);

  const activeSegsList = cSegs.filter(s => String(s.status).toLowerCase() === 'activo');
  const finishedSegsList = cSegs.filter(s => String(s.status).toLowerCase() === 'finalizado');
  const listToRender = segViewTab === 'activo' ? activeSegsList : finishedSegsList;

  // Auto-select first thread
  useEffect(() => {
      if (viewSegClientId && !currentSegId && listToRender.length > 0) {
          setCurrentSegId(listToRender[0].id);
      }
  }, [viewSegClientId, segViewTab, listToRender, currentSegId]);

  const segObj = useMemo(() => cSegs.find(s => s.id === currentSegId), [cSegs, currentSegId]);
  const activeThreadNotes = useMemo(() => {
      if (!currentSegId) return [];
      return allNotes.filter(n => n.segId === currentSegId).sort((a,b) => a.timestamp - b.timestamp);
  }, [allNotes, currentSegId]);

  const isReadOnlyMode = useMemo(() => {
      if (!viewSegClientId) return false;
      const clientObj = myClients.find(c => String(c.id).toLowerCase() === String(viewSegClientId).toLowerCase());
      if (state.user?.role === 'encargado' || state.user?.role === 'administrador') {
          if (state.managerView !== 'SELF' && state.managerView !== 'ALL') {
              if (!clientObj || String(clientObj.sellerId) !== String(state.user.id)) return true;
          }
      }
      return false;
  }, [viewSegClientId, myClients, state.user, state.managerView]);

  // Actions
  const handleCreateSeg = async (e) => {
      e.preventDefault();
      if (!nsClientId || nsServices.length === 0) { alert("Completa el cliente y los servicios."); return; }
      
      const payload = {
          id: 'seg_' + Date.now(), clientId: nsClientId, clientName: nsClientName, sellerId: state.user.id, timestamp: Date.now(),
          threadName: nsThreadName, service: nsServices.join(', '), method: nsMethod, status: 'activo'
      };
      
      const notePayload = {
          id: 'n_' + Date.now(), segId: payload.id, type: nsType, category: nsCategory, text: nsText,
          timestamp: payload.timestamp, service: nsServices[0], isClient: nsIsClient
      };

      const newSegs = [payload, ...uSegs];
      const newNotes = [...allNotes, notePayload];
      
      setUSegs(newSegs);
      setAllNotes(newNotes);
      setIsNewSegOpen(false);
      showToast('Hilo creado localmente. Subiendo...');

      const res1 = await execSQL("INSERT INTO seguimientos (id, cliente_id, cliente_nombre, servicios, medio, estado, vendedor_id, timestamp, nombre_hilo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", 
          [payload.id, payload.clientId, payload.clientName, payload.service, payload.method, payload.status, payload.sellerId, payload.timestamp, payload.threadName]);
          
      if(nsText) {
          await execSQL("INSERT INTO notas_seguimiento (id, seguimiento_id, tipo, categoria, texto, timestamp, servicio_nota, es_cliente) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              [notePayload.id, notePayload.segId, notePayload.type, notePayload.category, notePayload.text, notePayload.timestamp, notePayload.service, notePayload.isClient]);
      }

      if (res1?.error) alert("Error: " + res1.error);
  };

  const handleAddNote = async () => {
      if (!newNoteText.trim()) return;
      if (activeNoteServices.length === 0) { alert("Selecciona al menos un servicio"); return; }
      
      const notePayload = {
          id: 'n_' + Date.now(), segId: currentSegId, timestamp: Date.now(),
          category: newNoteCategory, type: newNoteType, text: newNoteText.trim(),
          service: activeNoteServices.join(', '), isClient: isNoteClient
      };

      setAllNotes(prev => [...prev, notePayload]);
      setNewNoteText('');
      showToast('Nota añadida.');

      await execSQL("INSERT INTO notas_seguimiento (id, seguimiento_id, tipo, categoria, texto, timestamp, servicio_nota, es_cliente) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [notePayload.id, notePayload.segId, notePayload.type, notePayload.category, notePayload.text, notePayload.timestamp, notePayload.service, notePayload.isClient]);
  };

  const toggleStatus = async (status) => {
      if (!currentSegId) return;
      setUSegs(prev => prev.map(s => s.id === currentSegId ? { ...s, status } : s));
      setSegViewTab(status);
      setCurrentSegId(null);
      showToast('Estado actualizado.');
      await execSQL("UPDATE seguimientos SET estado = ? WHERE id = ?", [status, currentSegId]);
  };

  return (
    <div className="fade-in h-full flex flex-col gap-6 max-w-[1600px] mx-auto w-full pb-4">
      
      {/* GRÁFICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-shrink-0">
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
             <h4 className="font-black text-[11px] text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wider"><span className="material-icons text-indigo-500 text-[18px]">thumbs_up_down</span> Rendimiento de Cierres</h4>
             <div className="relative h-36 w-full"><Bar data={srvPerfData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: {boxWidth: 10, font: {size: 9}} } }, scales: { y: { beginAtZero: true, grid: { borderDash: [5,5] }, ticks: { stepSize: 1, font: {size: 9} } }, x: { grid: { display:false }, ticks: { font: {size: 8} } } } }} /></div>
          </div>
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
             <div className="flex justify-between items-center mb-2">
                 <h4 className="font-black text-[11px] text-slate-700 flex items-center gap-2 uppercase tracking-wider"><span className="material-icons text-amber-500 text-[18px]">emoji_events</span> Ranking Hilos (ID)</h4>
                 <select value={selectedClientFilter} onChange={e => setSelectedClientFilter(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold outline-none text-indigo-700 px-2 py-1 max-w-[100px] sm:max-w-[130px] cursor-pointer">
                     <option value="TODOS">TODOS LOS SERVICIOS</option>
                     {serviceListConfig.map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
             </div>
             <div className="relative h-36 w-full"><Bar data={clientRankData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { borderDash: [5,5] }, ticks: { stepSize: 1, font: {size: 9} } }, x: { grid: { display:false }, ticks: { font: {size: 8} } } } }} /></div>
          </div>
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
             <h4 className="font-black text-[11px] text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wider"><span className="material-icons text-emerald-500 text-[18px]">perm_phone_msg</span> Medios más usados</h4>
             <div className="relative h-36 w-full"><Doughnut data={methodData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: {boxWidth: 10, font: {size: 9}} } }, cutout: '65%' }} /></div>
          </div>
      </div>

      {/* HEADER BANDEJA */}
      <div className="flex justify-between items-center bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex-shrink-0">
          <div>
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><span className="material-icons text-indigo-500 bg-indigo-50 p-2 rounded-xl">forum</span> Bandeja de Seguimientos</h3>
              <p className="text-xs text-slate-500 mt-1">Gestión de comunicaciones y negociaciones.</p>
          </div>
          <button onClick={() => setIsNewSegOpen(true)} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-md hover:bg-indigo-700 flex items-center gap-2">
            <span className="material-icons">add</span> Nuevo Hilo
          </button>
      </div>

      {/* TARJETAS DE CARTERA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 overflow-y-auto pb-6">
          {clientCards.length === 0 ? (
              <div className="col-span-full text-center p-12 bg-slate-50 rounded-3xl border border-slate-200">
                  <span className="material-icons text-5xl text-slate-300 mb-3 block">inbox</span>
                  <p className="text-slate-500 font-bold text-lg">Bandeja Vacía</p>
              </div>
          ) : clientCards.map(c => (
              <div key={c.clientId} onClick={() => openClientSegs(c.clientId)} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:border-indigo-400 hover:shadow-md cursor-pointer transition flex flex-col justify-between group">
                  <div className="flex items-start justify-between mb-4">
                      <div className="bg-indigo-100 text-indigo-600 w-12 h-12 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 font-mono tracking-wider">{String(c.clientId).substring(0, 2).toUpperCase()}</div>
                      <div className="text-right">
                          <span className="inline-block bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-lg mb-1">{c.activos} Activos</span><br/>
                          <span className="inline-block bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded-lg">{c.finalizados} Fin.</span>
                      </div>
                  </div>
                  <h4 className="font-black text-2xl font-mono text-slate-800 group-hover:text-indigo-600 transition truncate tracking-wider">{c.clientId}</h4>
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase truncate">{c.clientName || 'Sin Nombre'}</p>
                  <p className="text-xs text-slate-400 mt-3 flex items-center gap-1 font-semibold uppercase tracking-wider group-hover:text-indigo-500 transition"><span className="material-icons text-[14px]">open_in_new</span> Abrir Hilos</p>
              </div>
          ))}
      </div>

      {/* MODAL GESTION CLIENTE */}
      {viewSegClientId && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[9999] fade-in p-4" onClick={() => setViewSegClientId(null)}>
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
               <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white flex-shrink-0">
                  <div>
                      <h3 className="text-3xl font-black font-mono tracking-wider text-indigo-600 flex items-center gap-2">{viewSegClientId} {isReadOnlyMode && <span className="bg-slate-200 text-slate-600 text-[10px] uppercase px-2 py-1 rounded-lg ml-2 font-bold tracking-widest flex items-center gap-1"><span className="material-icons text-[12px]">visibility</span> Solo Lectura</span>}</h3>
                      <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-wider">{myClients.find(c => String(c.id).toLowerCase() === String(viewSegClientId).toLowerCase())?.name || 'Sin Nombre'}</p>
                  </div>
                  <div className="flex items-center gap-4">
                      {!isReadOnlyMode && <button onClick={() => { setViewSegClientId(null); setIsNewSegOpen(true); setTimeout(()=>setNsClientId(viewSegClientId), 100); }} className="px-4 py-2 border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-black shadow-sm flex items-center gap-1 transition"><span className="material-icons text-[16px]">add</span> NUEVO HILO</button>}
                      <button onClick={() => setViewSegClientId(null)} className="w-10 h-10 bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 rounded-full flex items-center justify-center transition"><span className="material-icons text-sm">close</span></button>
                  </div>
               </div>

               <div className="flex flex-col md:flex-row flex-1 overflow-hidden bg-white">
                  {/* LATERAL HILOS */}
                  <div className="w-full md:w-1/3 bg-slate-50 md:border-r border-slate-200 flex flex-col flex-shrink-0 shadow-inner">
                      <div className="flex p-2 bg-slate-200/50 border border-slate-200 m-4 rounded-xl shadow-sm">
                          <button onClick={() => {setSegViewTab('activo'); setCurrentSegId(null);}} className={`flex-1 py-2 text-xs font-black rounded-lg transition ${segViewTab === 'activo' ? 'bg-white shadow-md text-indigo-700 scale-105' : 'text-slate-500 hover:text-slate-700'}`}>ACTIVOS ({activeSegsList.length})</button>
                          <button onClick={() => {setSegViewTab('finalizado'); setCurrentSegId(null);}} className={`flex-1 py-2 text-xs font-black rounded-lg transition ${segViewTab === 'finalizado' ? 'bg-white shadow-md text-slate-700 scale-105' : 'text-slate-500 hover:text-slate-700'}`}>ARCHIVADOS ({finishedSegsList.length})</button>
                      </div>
                      <div className="flex-1 overflow-y-auto px-4 pb-4">
                          {listToRender.length === 0 ? (
                              <div className="text-center p-6 text-slate-400 mt-4 border-2 border-dashed border-slate-200 rounded-2xl"><span className="material-icons text-3xl mb-2">inbox</span><p className="text-xs font-bold">Bandeja vacía.</p></div>
                          ) : listToRender.map(s => {
                              const uniqueSrv = [...new Set((s.service||'').split(',').map(x=>x.trim()).filter(Boolean))];
                              const isSelected = currentSegId === s.id;
                              
                              let outcomeBadge = null;
                              let outcomeClass = "";
                              if (segViewTab === 'finalizado') {
                                  const termNotes = allNotes.filter(n => n.segId === s.id).sort((a,b)=>b.timestamp-a.timestamp);
                                  if (termNotes.length > 0) {
                                      if (termNotes[0].type === 'Positiva') { outcomeClass = 'border-l-4 border-l-emerald-500'; outcomeBadge = <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded ml-1">Éxito</span>; }
                                      else if (termNotes[0].type === 'Negativa') { outcomeClass = 'border-l-4 border-l-red-500'; outcomeBadge = <span className="text-[8px] font-black uppercase text-red-600 bg-red-100 px-1.5 py-0.5 rounded ml-1">Perdido</span>; }
                                      else { outcomeClass = 'border-l-4 border-l-slate-400'; }
                                  }
                              }

                              return (
                                  <div key={s.id} onClick={() => setCurrentSegId(s.id)} className={`p-4 rounded-2xl border cursor-pointer transition-all mb-3 ${isSelected ? `bg-indigo-50 border-indigo-400 shadow-md transform scale-[1.02] ${outcomeClass}` : `bg-white border-slate-200 hover:bg-slate-50 ${outcomeClass}`}`}>
                                      <div className="flex justify-between items-start mb-1">
                                          <p className="font-black text-sm text-slate-800 leading-tight truncate flex-1">{s.threadName}</p>
                                          {outcomeBadge}
                                      </div>
                                      <div className="flex flex-wrap gap-1 mb-2">
                                          {uniqueSrv.map(srv => <span key={srv} className="text-[8px] font-black uppercase text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">{srv}</span>)}
                                      </div>
                                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100/50">
                                          <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1"><span className="material-icons text-[10px]">{s.method==='WhatsApp'?'chat':'contact_phone'}</span> {s.method}</span>
                                          <span className="text-[9px] text-slate-400 font-mono">{new Date(Number(s.timestamp)).toLocaleDateString()}</span>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>

                  {/* CHAT CENTRAL */}
                  <div className="w-full md:w-2/3 flex flex-col relative h-full">
                      {currentSegId && segObj ? (
                          <div className="flex flex-col h-full bg-slate-50 rounded-r-[2rem]">
                              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-white flex-shrink-0 rounded-tr-[2rem] shadow-sm z-10">
                                  <div>
                                      <h4 className="font-black text-slate-800 text-lg">{segObj.threadName}</h4>
                                      <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wide font-bold flex items-center gap-2">Vía: {segObj.method}</p>
                                  </div>
                                  {!isReadOnlyMode && segViewTab === 'activo' && <button onClick={() => toggleStatus('finalizado')} className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"><span className="material-icons text-[16px]">done_all</span> Finalizar Hilo</button>}
                                  {!isReadOnlyMode && segViewTab !== 'activo' && <button onClick={() => toggleStatus('activo')} className="px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"><span className="material-icons text-[16px]">lock_open</span> Reabrir Hilo</button>}
                              </div>
                              
                              {/* MENSAJES */}
                              <div className="p-6 flex-1 overflow-y-auto flex flex-col scroll-smooth relative">
                                  {activeThreadNotes.length === 0 ? (
                                      <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-bold text-sm">Aún no hay interacciones en este hilo.</div>
                                  ) : activeThreadNotes.map((n, idx) => {
                                      const isCli = String(n.isClient).toLowerCase() === 'true';
                                      const badgeColor = n.type === 'Positiva' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : (n.type === 'Negativa' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-slate-100 text-slate-700 border-slate-200');
                                      const alignClass = isCli ? 'items-start' : 'items-end';
                                      const textBg = isCli ? 'bg-white border-slate-200 shadow-sm' : 'bg-indigo-50 border-indigo-100 shadow-sm';
                                      const authorName = isCli ? viewSegClientId : (isReadOnlyMode ? 'Comercial' : 'Tú');
                                      const authorIni = isCli ? String(viewSegClientId).substring(0, 2).toUpperCase() : (isReadOnlyMode ? 'C' : 'T');
                                      
                                      const uNoteSrv = [...new Set((n.service||'').split(',').map(s=>s.trim()).filter(Boolean))];

                                      return (
                                          <div key={idx} className={`flex flex-col ${alignClass} w-full mb-6 fade-in px-2`}>
                                              <div className={`flex flex-col ${alignClass} max-w-[85%] md:max-w-[75%]`}>
                                                  <div className="flex items-center gap-2 mb-1 px-1">
                                                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black font-mono tracking-wider ${isCli?'bg-slate-200 text-slate-600':'bg-indigo-600 text-white'}`}>{authorIni}</div>
                                                      <span className="text-[10px] font-black font-mono tracking-wider text-slate-500">{authorName}</span>
                                                      <span className="text-[9px] font-bold text-slate-400 ml-2">{new Date(Number(n.timestamp)).toLocaleString([], {month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit'})}</span>
                                                  </div>
                                                  <div className={`p-4 rounded-2xl border ${textBg} text-sm text-slate-800 leading-relaxed whitespace-pre-wrap w-full relative`}>
                                                      {n.text}
                                                  </div>
                                                  <div className={`flex items-center gap-1 mt-1.5 px-1 flex-wrap ${isCli ? 'justify-start' : 'justify-end'}`}>
                                                      {uNoteSrv.map(srv => <span key={srv} className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-white border-slate-200 text-slate-500 shadow-sm">{srv}</span>)}
                                                      <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${badgeColor}`}>{n.type} | {n.category}</span>
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>

                              {/* CAJA DE INPUT */}
                              <div className="p-5 bg-white border-t border-slate-200 flex-shrink-0 rounded-br-[2rem] z-10">
                                  {isReadOnlyMode ? (
                                      <div className="p-5 bg-slate-100 border border-slate-200 text-slate-500 text-center rounded-3xl text-sm font-bold shadow-inner"><span className="material-icons align-middle mr-2">visibility</span> MODO AUDITORÍA: Vista protegida.</div>
                                  ) : segViewTab !== 'activo' ? (
                                      <div className="mt-4 p-5 bg-amber-50 border border-amber-200 text-amber-800 text-center rounded-3xl text-sm font-bold shadow-inner flex items-center justify-center gap-2"><span className="material-icons">lock</span> Este hilo se encuentra archivado.</div>
                                  ) : (
                                      <div className="mt-2 bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-4">
                                          <div className="flex flex-col gap-2">
                                              <div className="flex items-center gap-3">
                                                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition w-max">
                                                      <input type="checkbox" checked={isNoteClient} onChange={e=>setIsNoteClient(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-slate-300"/> Es respuesta del cliente
                                                  </label>
                                                  <div className="h-4 w-px bg-slate-200"></div>
                                                  <span className="text-[10px] font-bold text-slate-400 uppercase">Servicios afectados:</span>
                                              </div>
                                              <div className="flex flex-wrap gap-2 items-center">
                                                  {(() => {
                                                      const refSrv = [...new Set((segObj.service||'').split(',').map(s=>s.trim()).filter(Boolean))];
                                                      return refSrv.map(s => (
                                                          <button key={s} onClick={() => {
                                                              if(activeNoteServices.includes(s)) setActiveNoteServices(activeNoteServices.filter(x=>x!==s));
                                                              else setActiveNoteServices([...activeNoteServices, s]);
                                                          }} className={`px-3 py-1.5 border rounded-lg text-[10px] font-bold transition-all shadow-sm ${activeNoteServices.includes(s) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                                                              {s}
                                                          </button>
                                                      ));
                                                  })()}
                                              </div>
                                          </div>
                                          <div className="flex gap-2">
                                              <select value={newNoteCategory} onChange={e=>setNewNoteCategory(e.target.value)} className="w-1/3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 text-slate-700"><option value="Venta">Venta</option><option value="Oferta">Oferta</option><option value="Noticia">Noticia</option><option value="Asesoramiento">Asesoría</option></select>
                                              <select value={newNoteType} onChange={e=>setNewNoteType(e.target.value)} className="w-1/3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 text-slate-700"><option value="Positiva">Positiva (Avanza)</option><option value="Neutral">Neutral (Info)</option><option value="Negativa">Negativa (Rechazo)</option></select>
                                          </div>
                                          <div className="flex gap-2">
                                              <textarea value={newNoteText} onChange={e=>setNewNoteText(e.target.value)} rows="2" placeholder="Escribe el mensaje o la anotación detallada..." className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 resize-none text-slate-800"></textarea>
                                              <button onClick={handleAddNote} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 rounded-xl flex items-center justify-center transition shadow-md"><span className="material-icons">send</span></button>
                                          </div>
                                      </div>
                                  )}
                              </div>
                          </div>
                      ) : (
                          <div className="flex items-center justify-center h-full text-slate-400 font-bold bg-slate-50 rounded-r-[2rem]">
                              <div className="text-center">
                                  <span className="material-icons text-6xl text-slate-300 mb-4 block">forum</span>
                                  <p>Selecciona un hilo de la izquierda.</p>
                              </div>
                          </div>
                      )}
                  </div>
               </div>
           </div>
        </div>
      )}

      {/* MODAL NUEVO HILO */}
      {isNewSegOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[9999] fade-in p-4" onClick={() => setIsNewSegOpen(false)}>
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white">
                 <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><span className="material-icons text-indigo-500">add_comment</span> Iniciar Nuevo Hilo</h3>
                 <button onClick={() => setIsNewSegOpen(false)} className="w-10 h-10 bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 rounded-full flex items-center justify-center transition"><span className="material-icons text-sm">close</span></button>
              </div>
              
              <div className="p-8 bg-slate-50 overflow-y-auto max-h-[75vh]">
                 <form onSubmit={handleCreateSeg} className="space-y-6">
                   <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
                     <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider">1. Configuración del Proyecto</h4>
                     <div>
                       <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre del Hilo (Ej: Campaña Invierno)</label>
                       <input value={nsThreadName} onChange={e=>setNsThreadName(e.target.value)} type="text" className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:border-indigo-500 font-bold text-slate-800" placeholder="Escribe un título identificativo..." required />
                     </div>
                     <div className="relative">
                       <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">ID de Cliente</label>
                       <input value={nsClientId} onChange={e=>setNsClientId(e.target.value)} onBlur={e=>{const c=myClients.find(x=>x.id===e.target.value); if(c) setNsClientName(c.name||'');}} type="text" className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:border-indigo-500 font-bold font-mono tracking-wider" placeholder="ID exacto..." required />
                     </div>
                     <div>
                       <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Servicios Involucrados</label>
                       <div className="flex flex-wrap gap-2">
                           {serviceListConfig.map(s => (
                               <button key={s} type="button" onClick={() => {
                                  if(nsServices.includes(s)) setNsServices(nsServices.filter(x=>x!==s));
                                  else setNsServices([...nsServices, s]);
                               }} className={`px-3 py-1.5 border rounded-lg text-xs font-bold transition-all shadow-sm ${nsServices.includes(s) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                                  {s}
                               </button>
                           ))}
                       </div>
                     </div>
                     <div>
                       <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Medio Principal de Contacto</label>
                       <select value={nsMethod} onChange={e=>setNsMethod(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 outline-none font-bold text-slate-700">
                         <option value="WhatsApp">WhatsApp</option><option value="Instagram">Instagram</option><option value="Email">Email</option><option value="Presencial">Presencial</option><option value="Llamada Telefónica">Llamada Telefónica</option>
                       </select>
                     </div>
                   </div>

                   <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4 border-l-4 border-l-indigo-500">
                     <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-2">2. Primera Nota del Hilo</h4>
                     <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer bg-slate-100 px-3 py-2 rounded-lg border border-slate-200 w-max">
                        <input type="checkbox" checked={nsIsClient} onChange={e=>setNsIsClient(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-slate-300" /> Es un mensaje del cliente
                     </label>
                     <div className="grid grid-cols-2 gap-4">
                       <div>
                         <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Categoría</label>
                         <select value={nsCategory} onChange={e=>setNsCategory(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 outline-none text-sm font-bold text-slate-700"><option value="Venta">Venta</option><option value="Oferta">Oferta</option><option value="Noticia">Noticia</option><option value="Asesoramiento">Asesoría</option></select>
                       </div>
                       <div>
                         <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tono / Avance</label>
                         <select value={nsType} onChange={e=>setNsType(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 outline-none text-sm font-bold text-slate-700"><option value="Positiva">Positiva</option><option value="Neutral">Neutral</option><option value="Negativa">Negativa</option></select>
                       </div>
                     </div>
                     <div>
                       <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Anotaciones / Mensaje</label>
                       <textarea value={nsText} onChange={e=>setNsText(e.target.value)} rows="3" className="w-full p-4 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:border-indigo-500 text-sm" placeholder="Detalla el mensaje o la interacción..." required></textarea>
                     </div>
                   </div>
                   
                   <div className="flex justify-end gap-3 pt-4">
                     <button type="button" onClick={() => setIsNewSegOpen(false)} className="px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition">Cancelar</button>
                     <button type="submit" className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 transition flex items-center gap-2"><span className="material-icons">send</span> Crear Hilo</button>
                   </div>
                 </form>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}