import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { execSQL } from '../api';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import Papa from 'papaparse';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6366f1'];

function getContrastYIQ(hexcolor) {
    if (!hexcolor) return '#1e293b';
    hexcolor = hexcolor.replace("#", "");
    if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(c => c + c).join('');
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#1e293b' : '#ffffff';
}

function getRealOrderTime(o) {
    let ms = o.timestamp || 0;
    if (o.fecha && typeof o.fecha === 'string' && o.fecha.includes('-')) {
        const validIso = o.fecha.replace(' ', 'T');
        const parsed = new Date(validIso).getTime();
        if (!isNaN(parsed)) ms = parsed;
    }
    return ms;
}

const PALETTE = [
    '#fef2f2', '#fee2e2', '#fecaca', '#f87171', '#ef4444', '#dc2626', '#991b1b',
    '#fff7ed', '#ffedd5', '#fed7aa', '#fb923c', '#f97316', '#ea580c', '#9a3412',
    '#fefce8', '#fef9c3', '#fef08a', '#facc15', '#eab308', '#ca8a04', '#854d0e',
    '#f0fdf4', '#dcfce7', '#bbf7d0', '#4ade80', '#22c55e', '#16a34a', '#166534',
    '#eff6ff', '#dbeafe', '#bfdbfe', '#60a5fa', '#3b82f6', '#2563eb', '#1e40af',
    '#faf5ff', '#f3e8ff', '#e9d5ff', '#c084fc', '#a855f7', '#9333ea', '#6b21a8',
    '#f8fafc', '#f1f5f9', '#e2e8f0', '#94a3b8', '#64748b', '#475569', '#1e293b'
];

export default function AdminView() {
  const { state, updateState, showToast, triggerSmartSync } = useAppContext();
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, msg: '', action: null });
  
  const [adminTab, setAdminTab] = useState('usuarios');
  
  // Tab: Usuarios & Roles
  const [newUserId, setNewUserId] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [newRoleId, setNewRoleId] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  
  // Tab: Config
  const [syncClientRow, setSyncClientRow] = useState('');
  const [syncTarget, setSyncTarget] = useState('ALL');
  const [conf, setConf] = useState({ serv:'', url:'', sheet:'', cord:'', ccli:'', ccan:'', ctra:'', cpro:'', cmod:'', cfec:'', cest:'' });
  
  const [bridgeInput, setBridgeInput] = useState('');
  const [ignoredStates, setIgnoredStates] = useState([]);
  
  useEffect(() => {
     if (state.datosConfig) {
         const bridgeConf = state.datosConfig.find(c => c.servicio === 'APPSCRIPT_BRIDGE');
         if (bridgeConf) setBridgeInput(bridgeConf.url);
         
         const ignoredConf = state.datosConfig.find(c => c.servicio === 'ESTADOS_IGNORADOS');
         if (ignoredConf && ignoredConf.url) {
             setIgnoredStates(ignoredConf.url.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
         }
     }
  }, [state.datosConfig]);
  
  // Tab: Colores
  const [colorEst, setColorEst] = useState('');
  const [colorVal, setColorVal] = useState(PALETTE[31]);
  const [showPalette, setShowPalette] = useState(false);

  // Tab: Auditoría
  const [unregView, setUnregView] = useState('1m');

  // Sync Logic
  const [syncModalMode, setSyncModalMode] = useState(null); // 'clientes' | 'ordenes'
  const [syncInputUrl, setSyncInputUrl] = useState('');
  const [isSyncingFiles, setIsSyncingFiles] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  if (state.user?.role !== 'administrador') {
      return <div className="p-10 text-center font-bold text-slate-400">Acceso denegado. Se requiere rol de administrador.</div>;
  }

  const validUsers = useMemo(() => state.users.filter(u => u.role !== 'administrador'), [state.users]);
  const rolesList = state.roles || [];
  
  const [uniqueStates, setUniqueStates] = useState([]);
  useEffect(() => {
      execSQL("SELECT DISTINCT estado FROM ordenes_servicios WHERE estado IS NOT NULL AND estado != ''").then(res => {
          if (Array.isArray(res)) setUniqueStates(Array.from(new Set(res.map(r => r.estado.trim().toUpperCase()).filter(Boolean))));
      }).catch(console.error);
  }, []);

  // Handle Form Submits
  const handleCreateUser = async (e) => {
      e.preventDefault();
      if (!newUserRole) { alert("Debes seleccionar un rol para el usuario."); return; }
      if (state.users.some(u => String(u.id) === newUserId)) { alert("Ya existe un usuario con ese ID."); return; }
      showToast('Guardando usuario...');
      
      const res = await execSQL('INSERT INTO usuarios (id, nombre_completo, rol, pass) VALUES (?, ?, ?, ?)', [newUserId, newUserName, newUserRole, newUserPass]);
      if (res?.error) { alert("Error guardando: " + res.error); return; }
      showToast('Usuario creado. Refresca para ver cambios...');
      setNewUserId(''); setNewUserName(''); setNewUserRole(''); setNewUserPass('');
  };

  const handleDeleteUser = async (id) => {
      if (!window.confirm(`¿Eliminar al usuario ${id}?`)) return;
      showToast('Eliminando...');
      const res = await execSQL('DELETE FROM usuarios WHERE id = ?', [id]);
      if (res?.error) { alert("Error eliminando: " + res.error); return; }
      showToast('Usuario eliminado.');
  };

  const handleCreateRole = async (e) => {
      e.preventDefault();
      const idStr = newRoleId.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (rolesList.some(r => String(r.id) === idStr)) { alert("Ya existe un rol con ese ID Interno."); return; }
      showToast('Guardando Rol...');
      const res = await execSQL('INSERT INTO roles (id, nombre) VALUES (?, ?)', [idStr, newRoleName]);
      if (res?.error) { alert("Error guardando el rol: " + res.error); return; }
      showToast('Rol creado exitosamente.');
      setNewRoleId(''); setNewRoleName('');
  };

  const handleDeleteRole = async (id) => {
      if (!window.confirm(`¿Estás seguro de eliminar el rol ${id}? Si hay usuarios con este rol, podrían perder acceso.`)) return;
      showToast('Eliminando Rol...');
      const res = await execSQL('DELETE FROM roles WHERE id = ?', [id]);
      if (res?.error) { alert("Error eliminando: " + res.error); return; }
      showToast('Rol eliminado.');
  };

  const handleCreateConfig = async (e) => {
      e.preventDefault();
      showToast('Conectando base de datos...');
      const payload = {
          servicio: conf.serv.toUpperCase(), url: conf.url, nombre_hoja: conf.sheet,
          col_orden: conf.cord.toUpperCase(), col_cliente: conf.ccli.toUpperCase(), col_cantidad: conf.ccan.toUpperCase(),
          col_trabajo: conf.ctra.toUpperCase(), col_producto: conf.cpro.toUpperCase(), col_modo: conf.cmod.toUpperCase(),
          col_fecha: conf.cfec.toUpperCase(), col_estado: conf.cest.toUpperCase(), cols_vista: ''
      };
      const res = await execSQL('INSERT INTO configuracion_externa (servicio, url, nombre_hoja, col_orden, col_cliente, col_cantidad, col_trabajo, col_producto, col_modo, col_fecha, col_estado, cols_vista) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
          [payload.servicio, payload.url, payload.nombre_hoja, payload.col_orden, payload.col_cliente, payload.col_cantidad, payload.col_trabajo, payload.col_producto, payload.col_modo, payload.col_fecha, payload.col_estado, payload.cols_vista]);
      if (res?.error) { alert("Error guardando configuración: " + res.error); return; }
      showToast('Origen conectado.');
      setConf({ serv:'', url:'', sheet:'', cord:'', ccli:'', ccan:'', ctra:'', cpro:'', cmod:'', cfec:'', cest:'' });
  };

  const handleSaveBridge = async (e) => {
      e.preventDefault();
      showToast('Guardando enlace del puente...');
      await execSQL("DELETE FROM configuracion_externa WHERE servicio = 'APPSCRIPT_BRIDGE'");
      const input = bridgeInput.trim();
      if (input) {
          const res = await execSQL("INSERT INTO configuracion_externa (servicio, url, nombre_hoja, col_orden, col_cliente, col_cantidad, col_trabajo, col_producto, col_modo, col_fecha, col_estado, cols_vista) VALUES ('APPSCRIPT_BRIDGE', ?, 'NONE', '', '', '', '', '', '', '', '', '')", [input]);
          if (res?.error) { alert("Error guardando puente: " + res.error); return; }
      }
      showToast('Origen de puente guardado. Refresca para ver cambios.');
  };

  const handleToggleIgnoreState = async (estado) => {
      const eLower = estado.toLowerCase().trim();
      let newList = [...ignoredStates];
      if (newList.includes(eLower)) newList = newList.filter(s => s !== eLower);
      else newList.push(eLower);
      
      setIgnoredStates(newList);
      showToast('Guardando ignorados...');
      await execSQL("DELETE FROM configuracion_externa WHERE servicio = 'ESTADOS_IGNORADOS'");
      if (newList.length > 0) {
          await execSQL("INSERT INTO configuracion_externa (servicio, url, nombre_hoja, col_orden, col_cliente, col_cantidad, col_trabajo, col_producto, col_modo, col_fecha, col_estado, cols_vista) VALUES ('ESTADOS_IGNORADOS', ?, 'NONE', '', '', '', '', '', '', '', '', '')", [newList.join(',')]);
      }
  };

  const handleDeleteConfig = async (servicio) => {
      if (!window.confirm(`¿Desconectar el servicio ${servicio}?`)) return;
      showToast('Desconectando...');
      const res = await execSQL('DELETE FROM configuracion_externa WHERE servicio = ?', [servicio]);
      if (res?.error) { alert("Error desconectando: " + res.error); return; }
      showToast('Servicio desconectado.');
  };

  const handleSaveColor = async (e) => {
      e.preventDefault();
      if (!colorEst) { alert("Selecciona un estado"); return; }
      const estadoLocal = colorEst.toLowerCase();
      
      const newColores = { ...state.coloresEstados, [estadoLocal]: colorVal };
      const newRaw = state.rawColoresEstados?.filter(c => c.estado.toLowerCase() !== estadoLocal) || [];
      newRaw.push({ estado: estadoLocal, color: colorVal });
      
      updateState({ coloresEstados: newColores, rawColoresEstados: newRaw });
      showToast('Color aplicado (Guardando en BD...)');
      
      await execSQL("DELETE FROM colores_estados WHERE estado = ?", [estadoLocal]);
      const res = await execSQL("INSERT INTO colores_estados (estado, color) VALUES (?, ?)", [estadoLocal, colorVal]);
      if (res?.error) alert("Fallo al guardar en BD: " + res.error);
      else showToast('Regla de color sincronizada.');
  };

  const handleDeleteColor = async (estado) => {
      if (!window.confirm(`¿Seguro que deseas eliminar el color de "${estado}"?`)) return;
      const estadoLocal = estado.toLowerCase();
      
      const newColores = { ...state.coloresEstados };
      delete newColores[estadoLocal];
      const newRaw = state.rawColoresEstados?.filter(c => c.estado.toLowerCase() !== estadoLocal) || [];
      
      updateState({ coloresEstados: newColores, rawColoresEstados: newRaw });
      showToast('Regla eliminada (Actualizando BD...)');
      
      const res = await execSQL("DELETE FROM colores_estados WHERE estado = ?", [estadoLocal]);
      if (res?.error) alert("Fallo al eliminar en BD: " + res.error);
      else showToast('Regla eliminada exitosamente.');
  };

  const resolveSheetsCsvExport = (urlStr) => {
      let matchId = urlStr.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!matchId) return urlStr; 
      let sheetId = matchId[1];
      let gidMatch = String(urlStr).match(/gid=([0-9]+)/);
      let gid = gidMatch ? gidMatch[1] : '0';
      return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  };

  const handleProcessSync = async (mode) => {
      let bridgeUrl = 'https://script.google.com/macros/s/AKfycbxOL8hxT-7SFH3SmF0YBtPulXOJ4mzjpgFu75XEI45mxL3OkoDHnH1yoCA6Q7eZknnfuw/exec';
      const userBridge = state.datosConfig?.find(c => c.servicio === 'APPSCRIPT_BRIDGE');
      if (userBridge && userBridge.url && userBridge.url.includes('script.google.com')) bridgeUrl = userBridge.url;

      setIsSyncingFiles(true);
      
      const colToIndex = (col) => {
          if (!col || typeof col !== 'string') return -1;
          let letter = col.toUpperCase().trim();
          if (!/^[A-Z]+$/.test(letter)) return -1; 
          let temp, sum = 0;
          for (let i = 0; i < letter.length; i++) { temp = letter.charCodeAt(i) - 64; sum = sum * 26 + temp; }
          return sum - 1; 
      };

      const parseDateData = (dateStr) => {
          if (!dateStr) return null;
          let parts = String(dateStr).trim().split(' ');
          let dateP = parts[0].split(/[\/\-]/);
          if (dateP.length !== 3) return null;
          let timeP = parts[1] || '00:00:00';
          let year = dateP[2], month = dateP[1], day = dateP[0];
          if (year.length !== 4) {
             if (dateP[0].length === 4) { year = dateP[0]; day = dateP[2]; } else { year = '20' + year; }
          }
          return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')} ${timeP}`;
      };

      const buildMergeQuery = (baseQuery, payloadArray) => {
          if (!payloadArray || payloadArray.length === 0) return '';
          let massiveQuery = '';
          payloadArray.forEach(params => {
             let finalQuery = baseQuery;
             params.forEach(p => {
                 let val = (p === null || p === undefined) ? 'NULL' : (typeof p === 'number' ? p : `'${String(p).replace(/'/g, "''")}'`);
                 finalQuery = finalQuery.replace('?', val);
             });
             massiveQuery += finalQuery + ';\n';
          });
          return massiveQuery;
      };

      try {
          if (mode === 'órdenes') {
              showToast('Descargando configuraciones y mapeos DB...', 4000);
              const confRes = await execSQL("SELECT * FROM configuracion_externa");
              if (confRes.error) throw new Error("Fallo al leer config: " + confRes.error);
              
              const clientsRes = await execSQL("SELECT id FROM clientes");
              if (clientsRes.error) throw new Error("Fallo al leer clientes: " + clientsRes.error);

              const existingServiciosRes = await execSQL("SELECT id_registro, cantidad, trabajo, producto, modo, estado FROM ordenes_servicios");
              if (existingServiciosRes.error) throw new Error("Fallo al leer config: " + existingServiciosRes.error);

              const existingMaestrasRes = await execSQL("SELECT orden_id FROM ordenes_maestras");
              
              const clientMap = new Map();
              if (Array.isArray(clientsRes)) clientsRes.forEach(c => clientMap.set(String(c.id).toLowerCase().trim(), c.id));
              
              const existingServicios = new Map();
              if (Array.isArray(existingServiciosRes)) {
                   existingServiciosRes.forEach(s => {
                       existingServicios.set(s.id_registro, { 
                           cantidad: Number(s.cantidad), trabajo: String(s.trabajo||'').trim(), 
                           producto: String(s.producto||'').trim(), modo: String(s.modo||'').trim(), estado: String(s.estado||'').trim() 
                       });
                   });
              }
              const existingMaestras = new Set(Array.isArray(existingMaestrasRes) ? existingMaestrasRes.map(m=>m.orden_id) : []);

              let maestrasMap = new Map();
              let serviciosMap = new Map();
              let erroresEnLeidas = [];

              for (let i = 0; i < confRes.length; i++) {
                  const conf = confRes[i];
                  if (conf.servicio === 'APPSCRIPT_BRIDGE' || conf.servicio === 'ESTADOS_IGNORADOS') continue;
                  if (syncTarget !== 'ALL' && conf.servicio !== syncTarget) continue;
                  if (!conf.url || !conf.nombre_hoja) continue;

                  showToast(`Extrayendo ${conf.servicio}...`, 15000);
                  try {
                      const res = await fetch(`${bridgeUrl}?action=extractRawMatrix&url=${encodeURIComponent(conf.url)}&sheet=${encodeURIComponent(conf.nombre_hoja)}`);
                      const result = await res.json();
                      if (!result.success) {
                          erroresEnLeidas.push(`Fallo en hoja ${conf.servicio}: ${result.error}`);
                          continue;
                      }
                      
                      const rawData = result.data;
                      if (!rawData || rawData.length <= 1) continue;

                      const idxOrd = colToIndex(conf.col_orden); const idxCli = colToIndex(conf.col_cliente); const idxCant = colToIndex(conf.col_cantidad);
                      const idxTrab = colToIndex(conf.col_trabajo); const idxModo = colToIndex(conf.col_modo); const idxProd = colToIndex(conf.col_producto);
                      const idxFec = colToIndex(conf.col_fecha); const idxEst = colToIndex(conf.col_estado);

                      if (idxOrd === -1 || idxCli === -1) continue; 

                      for (let r = 1; r < rawData.length; r++) {
                          const row = rawData[r]; 
                          if (!row || row.length === 0) continue;
                          if (row.every(cell => String(cell).trim() === '')) continue;

                          let ordenIdRaw = idxOrd > -1 ? String(row[idxOrd] || '').trim() : '';
                          let cliIdRaw = idxCli > -1 ? String(row[idxCli] || '').trim() : '';
                          if (!ordenIdRaw && !cliIdRaw) continue;
                          
                          let cantidadRaw = idxCant > -1 ? String(row[idxCant] || '0').trim() : '0';
                          cantidadRaw = cantidadRaw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]+/g,"");
                          
                          const extClientId = cliIdRaw.toLowerCase();
                          const finalClientId = clientMap.has(extClientId) ? clientMap.get(extClientId) : (extClientId || 'Desc');
                          let ordenId = ordenIdRaw || `AUT-${finalClientId}-${conf.servicio.substring(0,3).toUpperCase()}-${r}`;
                          
                          if (!existingMaestras.has(ordenId) && !maestrasMap.has(ordenId)) {
                              maestrasMap.set(ordenId, [ 
                                 ordenId, finalClientId, parseDateData(idxFec > -1 ? String(row[idxFec] || '') : '') || new Date().toISOString().replace('T', ' ').split('.')[0], Date.now().toString() 
                              ]);
                          }

                          const servKey = ordenId + '_' + conf.servicio;
                          const tCant = parseFloat(cantidadRaw) || 0;
                          const tTrab = idxTrab > -1 ? String(row[idxTrab] || '').trim() : '';
                          const tProd = idxProd > -1 ? String(row[idxProd] || '').trim() : '';
                          const tModo = idxModo > -1 ? String(row[idxModo] || '').trim() : '';
                          const tEst = idxEst > -1 ? String(row[idxEst] || '').trim() : 'Sin Estado';

                          let recordChanged = true;
                          if (existingServicios.has(servKey)) {
                              const e = existingServicios.get(servKey);
                              
                              // Check if existing SQL state is marked as ignored. If so, lock the record.
                              if (ignoredStates.includes(String(e.estado).toLowerCase().trim())) continue;

                              if (e.cantidad === tCant && e.trabajo === tTrab && e.producto === tProd && e.modo === tModo && e.estado === tEst) {
                                  recordChanged = false;
                              }
                          }

                          if (recordChanged) {
                              serviciosMap.set(servKey, [servKey, ordenId, conf.servicio, tCant, tTrab, tProd, tModo, tEst]);
                          }
                      }
                  } catch (e) {
                      erroresEnLeidas.push(`Excepción en hoja ${conf.servicio}: ${e.message}`);
                  }
              }

              const chunkArray = (array, size) => {
                 const chunked = [];
                 for (let i = 0; i < array.length; i += size) chunked.push(array.slice(i, i + size));
                 return chunked;
              };

              showToast(`Inyectando Base de Datos localmente... (${maestrasMap.size} maestras nuevas, ${serviciosMap.size} servicios modificados)`, 15000);
              
              const payloadMaestras = Array.from(maestrasMap.values());
              if (payloadMaestras.length > 0) {
                 const chunks = chunkArray(payloadMaestras, 500);
                 for (let c of chunks) {
                     const mergeMaestras = `MERGE ordenes_maestras AS target USING (VALUES (?, ?, ?, ?)) AS source(orden_id, cliente_id, fecha_ingreso, timestamp_mod) ON target.orden_id = source.orden_id WHEN MATCHED THEN UPDATE SET cliente_id = source.cliente_id, fecha_ingreso = source.fecha_ingreso, timestamp_mod = source.timestamp_mod WHEN NOT MATCHED THEN INSERT (orden_id, cliente_id, fecha_ingreso, timestamp_mod) VALUES (source.orden_id, source.cliente_id, source.fecha_ingreso, source.timestamp_mod)`;
                     const pushRes = await execSQL(buildMergeQuery(mergeMaestras, c));
                     if (pushRes && pushRes.error) throw new Error("Error inyectando Maestras: " + pushRes.error);
                 }
              }

              const payloadServicios = Array.from(serviciosMap.values());
              if (payloadServicios.length > 0) {
                 const chunks = chunkArray(payloadServicios, 500);
                 for (let c of chunks) {
                     const mergeServicios = `MERGE ordenes_servicios AS target USING (VALUES (?, ?, ?, CAST(? AS FLOAT), ?, ?, ?, ?)) AS source(id_registro, orden_id, servicio, cantidad, trabajo, producto, modo, estado) ON target.id_registro = source.id_registro WHEN MATCHED THEN UPDATE SET cantidad = source.cantidad, trabajo = source.trabajo, producto = source.producto, modo = source.modo, estado = source.estado WHEN NOT MATCHED THEN INSERT (id_registro, orden_id, servicio, cantidad, trabajo, producto, modo, estado) VALUES (source.id_registro, source.orden_id, source.servicio, source.cantidad, source.trabajo, source.producto, source.modo, source.estado)`;
                     const pushRes = await execSQL(buildMergeQuery(mergeServicios, c));
                     if (pushRes && pushRes.error) throw new Error("Error inyectando Servicios: " + pushRes.error);
                 }
              }

              setSyncResult({ 
                 type: 'success', title: '¡Extracción Completada!', 
                 desc: `React cruzó transparentemente la API nativa de Google Sheets y preparó las órdenes.`,
                 maestras: payloadMaestras.length,
                 servicios: payloadServicios.length,
                 debugInfo: erroresEnLeidas
              });

          } else if (mode === 'clientes') {
              showToast('Descargando Clientes vía Puente...', 10000);
              const extId = '1rgjR09Y8M9DQ0oOaGAipxwSnsrykCvkOPL2XlK-c4OY'; const sheetName = 'Respuestas de formulario 5';
              
              const res = await fetch(`${bridgeUrl}?action=extractRawMatrix&url=${encodeURIComponent('https://docs.google.com/spreadsheets/d/' + extId)}&sheet=${encodeURIComponent(sheetName)}`);
              const result = await res.json();
              if (!result.success) throw new Error("Fallo en extracción: " + result.error);

              const rawData = result.data;
              if (!rawData || rawData.length <= 1) {
                  setSyncResult({ type: 'success', title: '¡Clientes Extraídos!', desc: `No hay clientes nuevos para extraer.`, clientes: 0 });
                  setIsSyncingFiles(false);
                  return;
              }

              let lastRow = parseInt(syncClientRow) || 1;
              if (lastRow > 0) lastRow -= 1;
              
              const existing = await execSQL("SELECT id FROM clientes");
              const localMap = new Map(); 
              if(Array.isArray(existing)) existing.forEach(c => localMap.set(String(c.id).toLowerCase().trim(), true));

              let upsertsMap = new Map(); 
              for (let i = lastRow; i < rawData.length; i++) {
                 const row = rawData[i]; 
                 if (!row || row.length === 0) continue;
                 const isRowEmpty = row.every(cell => String(cell).trim() === '');
                 if (isRowEmpty) continue;

                 const colA = String(row[0] || '').trim(); 
                 const idCliente = String(row[3] || '').trim(); 
                 if (!idCliente) continue; 
                 
                 const nameKey = idCliente.toLowerCase();
                 if (localMap.has(nameKey) || upsertsMap.has(nameKey)) continue;

                 upsertsMap.set(nameKey, [
                    idCliente, String(row[4] || '').trim() || 'Sin Nombre', String(row[5] || '').trim(), null, colA, 
                    String(row[6] || '').trim(), String(row[7] || '').trim(), String(row[8] || '').trim(), String(row[9] || '').trim(),
                    String(row[10] || '').trim(), String(row[11] || '').trim(), String(row[12] || '').trim()
                 ]);
              }

              const payloadArray = Array.from(upsertsMap.values());
              if (payloadArray.length > 0) {
                  showToast('Creando clientes nuevos...', 10000);
                  const mergeQuery = `
                    MERGE clientes AS target
                    USING (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)) AS source(id, nombre_completo, telefono, vendedor_id, fecha_registro, mail, empresa, rut, departamento, localidad, tipo_retiro, direccion)
                    ON target.id = source.id
                    WHEN MATCHED THEN UPDATE SET nombre_completo = source.nombre_completo, telefono = source.telefono, mail = source.mail, empresa = source.empresa, rut = source.rut, departamento = source.departamento, localidad = source.localidad, tipo_retiro = source.tipo_retiro, direccion = source.direccion
                    WHEN NOT MATCHED THEN INSERT (id, nombre_completo, telefono, vendedor_id, fecha_registro, mail, empresa, rut, departamento, localidad, tipo_retiro, direccion) VALUES (source.id, source.nombre_completo, source.telefono, source.vendedor_id, source.fecha_registro, source.mail, source.empresa, source.rut, source.departamento, source.localidad, source.tipo_retiro, source.direccion)
                  `;
                  const pushRes = await execSQL(buildMergeQuery(mergeQuery, payloadArray));
                  if (pushRes && pushRes.error) throw new Error("Error inyectando Clientes: " + pushRes.error);
              }

              setSyncResult({ 
                 type: 'success', title: '¡Clientes Extraídos!', 
                 desc: `React cruzó exitosamente los nuevos clientes y los adaptó al AWS en vivo.`,
                 clientes: payloadArray.length
              });
          }
      } catch (err) {
          setSyncResult({ type: 'error', title: 'Fallo Crítico', desc: err.message });
      }
      setIsSyncingFiles(false);
  };

  // AUDITORIA LOGIC
  const auditoriaData = useMemo(() => {
      const now = new Date();
      const limit3m = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).getTime();
      const limit1m = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).getTime();

      const actAll = new Set();
      const act3m = new Set();
      const act1m = new Set();

      (state.orders || []).forEach(o => {
          const ms = getRealOrderTime(o);
          if (o.detalleServicios && Object.keys(o.detalleServicios).length > 0) {
              const cId = String(o.clientId).trim().toLowerCase();
              actAll.add(cId);
              if (ms >= limit3m) act3m.add(cId);
              if (ms >= limit1m) act1m.add(cId);
          }
      });

      const safeClients = state.clients || [];
      const dbMap = new Set(safeClients.map(c => String(c.id).trim().toLowerCase()));
      const unregAll = [...actAll].filter(id => !dbMap.has(id));
      const unreg3m = [...act3m].filter(id => !dbMap.has(id));
      const unreg1m = [...act1m].filter(id => !dbMap.has(id));

      const fields = [
          { key: 'id', label: 'ID Cliente' }, { key: 'phone', label: 'Teléfono' }, { key: 'mail', label: 'Correo' },
          { key: 'empresa', label: 'Empresa' }, { key: 'rut', label: 'RUT' }, { key: 'direccion', label: 'Dirección' }
      ];

      const nClients = safeClients.length;
      const parent = Array.from({ length: nClients }, (_, i) => i);
      function findRoot(i) {
          if (parent[i] === i) return i;
          return parent[i] = findRoot(parent[i]);
      }
      function unionNodes(i, j) {
          const rootI = findRoot(i);
          const rootJ = findRoot(j);
          if (rootI !== rootJ) parent[rootI] = rootJ;
      }

      const cleanStr = (s) => s ? String(s).toLowerCase().replace(/\s+/g, '').trim() : '';

      fields.forEach(f => {
          const valMap = new Map();
          safeClients.forEach((c, idx) => {
              const val = cleanStr(c[f.key]);
              if (val && val !== 'null' && val !== 'undefined' && val !== '-') {
                  if (valMap.has(val)) unionNodes(idx, valMap.get(val));
                  else valMap.set(val, idx);
              }
          });
      });

      const grouped = new Map();
      safeClients.forEach((c, idx) => {
          const r = findRoot(idx);
          if (!grouped.has(r)) grouped.set(r, []);
          grouped.get(r).push(c);
      });

      const dups = Array.from(grouped.values()).filter(g => g.length > 1);

      return { actAll, act3m, act1m, unregAll, unreg3m, unreg1m, dups, fields };
  }, [state.orders, state.clients]);

  // Rendering Helper
  const rend = auditoriaData || { unreg1m:[], unreg3m:[], unregAll:[], dups:[] };
  const listUnreg = unregView === '1m' ? rend.unreg1m : (unregView === '3m' ? rend.unreg3m : rend.unregAll);

  return (
    <div className="fade-in h-full flex flex-col gap-6 max-w-[1600px] mx-auto pb-8">
      {/* HEADER NAVBAR */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-center bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex-shrink-0">
         <div className="flex items-center gap-4">
             <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0"><span className="material-icons text-3xl">admin_panel_settings</span></div>
             <div><h2 className="text-2xl font-black text-slate-800">Panel de Control de Sistema</h2><p className="text-slate-500 text-xs font-medium">Gestión de Accesos, Roles y Auditoría</p></div>
         </div>
         <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-full md:w-auto overflow-x-auto">
            <button onClick={() => setAdminTab('usuarios')} className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-black rounded-xl transition whitespace-nowrap ${adminTab === 'usuarios' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Accesos y Usuarios</button>
            <button onClick={() => setAdminTab('roles')} className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-black rounded-xl transition whitespace-nowrap ${adminTab === 'roles' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Roles de Sistema</button>
            <button onClick={() => setAdminTab('servicios')} className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-black rounded-xl transition whitespace-nowrap ${adminTab === 'servicios' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Orígenes de Datos</button>
            <button onClick={() => setAdminTab('colores')} className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-black rounded-xl transition whitespace-nowrap ${adminTab === 'colores' ? 'bg-white text-pink-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Temas y Colores</button>
            <button onClick={() => setAdminTab('auditoria')} className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-black rounded-xl transition whitespace-nowrap ${adminTab === 'auditoria' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Auditoría de Datos</button>
         </div>
      </div>

      {/* CONTENT TAB */}
      {adminTab === 'usuarios' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 items-start fade-in">
           <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h4 className="font-black text-sm text-slate-700 flex items-center gap-2 uppercase tracking-wider mb-6"><span className="material-icons text-indigo-500">person_add</span> Nuevo Usuario</h4>
              <form onSubmit={handleCreateUser} className="space-y-4">
                 <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Usuario / ID</label><input type="text" value={newUserId} onChange={e=>setNewUserId(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold text-sm" placeholder="Ej: v1" required /></div>
                 <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre Real</label><input type="text" value={newUserName} onChange={e=>setNewUserName(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold text-sm" placeholder="Ej: Marcelo Suarez" required /></div>
                 <div>
                   <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rol en Sistema</label>
                   <select value={newUserRole} onChange={e=>setNewUserRole(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold text-sm" required>
                      <option value="">Selecciona un rol</option>
                      {rolesList.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                   </select>
                 </div>
                 <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Contraseña</label><input type="text" value={newUserPass} onChange={e=>setNewUserPass(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold text-sm" required /></div>
                 <button type="submit" className="w-full mt-2 bg-indigo-600 text-white font-black py-3 rounded-xl hover:bg-indigo-700 shadow-md transition flex items-center justify-center gap-2"><span className="material-icons text-[18px]">save</span> Guardar Usuario</button>
              </form>
           </div>
           <div className="md:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-[600px] overflow-hidden">
              <div className="p-5 border-b border-slate-100"><h4 className="font-bold text-slate-700 flex items-center gap-2"><span className="material-icons text-indigo-500">groups</span> Directorio Activo ({validUsers.length})</h4></div>
              <div className="overflow-y-auto flex-1">
                 <table className="w-full text-left border-collapse">
                    <thead className="bg-white sticky top-0 shadow-sm border-b border-slate-200">
                       <tr><th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Identidad</th><th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider text-center">Permisos</th><th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider text-center">Clave</th><th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider text-right">Acción</th></tr>
                    </thead>
                    <tbody>
                       {validUsers.length === 0 ? <tr><td colSpan="4" className="p-10 text-center font-bold text-slate-400">No hay usuarios.</td></tr> : validUsers.map(u => {
                           const roleName = rolesList.find(r => r.id === u.role)?.nombre || u.role;
                           return (
                               <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                                 <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-indigo-600 bg-indigo-100 shadow-sm">{String(u.name).charAt(0).toUpperCase()}</div><div><p className="font-bold text-sm text-slate-800">{u.name}</p><p className="text-[10px] text-slate-500 font-mono">ID: {u.id}</p></div></div></td>
                                 <td className="px-4 py-3 text-center"><span className="bg-slate-100 text-slate-600 border-slate-200 px-2 py-1 rounded-lg border font-black text-[10px] uppercase tracking-wider">{roleName}</span></td>
                                 <td className="px-4 py-3 text-center"><p className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg border inline-block">{u.pass}</p></td>
                                 <td className="px-4 py-3 text-right"><button onClick={() => handleDeleteUser(u.id)} className="w-8 h-8 bg-white border border-slate-200 text-red-500 rounded-lg hover:bg-red-50 transition flex items-center justify-center ml-auto"><span className="material-icons text-[18px]">delete</span></button></td>
                               </tr>
                           );
                       })}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {adminTab === 'roles' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 items-start fade-in">
           <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h4 className="font-black text-sm text-slate-700 flex items-center gap-2 uppercase tracking-wider mb-6"><span className="material-icons text-emerald-500">shield</span> Nuevo Rol</h4>
              <form onSubmit={handleCreateRole} className="space-y-4">
                 <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">ID del Rol (Interno)</label><input type="text" value={newRoleId} onChange={e=>setNewRoleId(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold text-sm" placeholder="Ej: supervisor_jr" required /></div>
                 <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre Visual</label><input type="text" value={newRoleName} onChange={e=>setNewRoleName(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold text-sm" placeholder="Ej: Supervisor Junior" required /></div>
                 <button type="submit" className="w-full mt-2 bg-emerald-600 text-white font-black py-3 rounded-xl hover:bg-emerald-700 shadow-md transition flex items-center justify-center gap-2"><span className="material-icons text-[18px]">save</span> Guardar Rol</button>
              </form>
           </div>
           <div className="md:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-[600px] overflow-hidden">
              <div className="p-5 border-b border-slate-100"><h4 className="font-bold text-slate-700 flex items-center gap-2"><span className="material-icons text-emerald-500">list_alt</span> Roles Existentes</h4></div>
              <div className="overflow-y-auto flex-1">
                 <table className="w-full text-left border-collapse">
                    <thead className="bg-white sticky top-0 shadow-sm border-b border-slate-200">
                       <tr><th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">ID Interno</th><th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Nombre Visual</th><th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider text-right">Acción</th></tr>
                    </thead>
                    <tbody>
                       {rolesList.length === 0 ? <tr><td colSpan="3" className="p-10 text-center font-bold text-slate-400">No hay roles definidos.</td></tr> : rolesList.map(r => (
                          <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                             <td className="px-4 py-3"><span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md font-bold text-[11px] uppercase">{r.id}</span></td>
                             <td className="px-4 py-3"><p className="font-bold text-sm text-slate-800">{r.nombre}</p></td>
                             <td className="px-4 py-3 text-right">
                                {['administrador', 'encargado', 'vendedor'].includes(r.id) ? <span className="text-[10px] text-slate-400 font-bold uppercase">Rol Nativo (Bloqueado)</span> : <button onClick={() => handleDeleteRole(r.id)} className="w-8 h-8 bg-white border border-slate-200 text-red-500 rounded-lg hover:bg-red-50 transition inline-flex items-center justify-center ml-auto"><span className="material-icons text-[18px]">delete</span></button>}
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {adminTab === 'servicios' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 flex-1 items-start fade-in">
           <div className="md:col-span-4 flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                  <div className="bg-slate-800 p-5 rounded-3xl shadow-md border border-slate-700 text-white">
                     <h4 className="font-black text-sm flex items-center gap-2 tracking-wider mb-2"><span className="material-icons text-emerald-400">person_add</span> Sincronizar Clientes</h4>
                     <p className="text-[11px] text-slate-300 mb-3 font-medium">Extrae los clientes nuevos. Fila vacía = Automático.</p>
                     <input type="number" value={syncClientRow} onChange={e=>setSyncClientRow(e.target.value)} className="w-full p-2.5 rounded-lg bg-slate-700 border border-slate-600 text-xs font-bold text-white outline-none mb-3" placeholder="Fila inicial (Ej: 2)" />
                     <button onClick={() => triggerSmartSync('ALL', 'clientes', { syncClientRow: syncClientRow })} disabled={state.isSmartSyncing} className={`w-full bg-white font-black py-2.5 rounded-xl text-slate-800 shadow-sm transition flex items-center justify-center gap-2 ${state.isSmartSyncing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100'}`}><span className="material-icons text-[18px]">cloud_upload</span> Sincronizar Clientes</button>
                  </div>
                  <div className="bg-slate-800 p-5 rounded-3xl shadow-md border border-slate-700 text-white">
                     <h4 className="font-black text-sm flex items-center gap-2 tracking-wider mb-2"><span className="material-icons text-blue-400">link</span> AppScript Bridge</h4>
                     <p className="text-[11px] text-slate-300 mb-3 font-medium">Conectividad directa con Google.</p>
                     <form onSubmit={handleSaveBridge} className="flex flex-col gap-3">
                         <input type="url" value={bridgeInput} onChange={e=>setBridgeInput(e.target.value)} className="w-full p-2.5 rounded-lg bg-slate-700 border border-slate-600 text-xs font-bold text-white outline-none" placeholder="https://script.google.com/.../exec" />
                         <button type="submit" className="w-full bg-blue-600 text-white font-black py-2.5 rounded-xl hover:bg-blue-700 shadow-sm transition flex items-center justify-center gap-2"><span className="material-icons text-[18px]">save</span> Guardar Bridge</button>
                     </form>
                  </div>
                  <div className="bg-slate-800 p-5 rounded-3xl shadow-md border border-slate-700 text-white">
                     <h4 className="font-black text-sm flex items-center gap-2 tracking-wider mb-2"><span className="material-icons text-red-400">block</span> Ignorar Estados (Filtro Inteligente)</h4>
                     <p className="text-[11px] text-slate-300 mb-3 font-medium">Ignorará estos estados directamente desde la planilla de Google, ni siquiera los traerá.</p>
                     <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 bg-slate-900 rounded-xl border border-slate-700">
                         {uniqueStates.length === 0 ? <p className="text-[10px] text-slate-500 font-bold p-2">Sin estados registrados en el sistema.</p> : uniqueStates.map(st => {
                             const isIgnored = ignoredStates.includes(st.toLowerCase());
                             return (
                                 <button key={st} onClick={() => handleToggleIgnoreState(st)} type="button" className={`px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${isIgnored ? 'bg-red-500 text-white border border-red-600' : 'bg-slate-800 text-slate-400 border border-slate-600 hover:bg-slate-700'}`}>
                                     {st}
                                 </button>
                             );
                         })}
                     </div>
                  </div>
                  <div className="bg-indigo-600 p-5 rounded-3xl shadow-md border border-indigo-700 text-white">
                     <h4 className="font-black text-sm flex items-center gap-2 tracking-wider mb-2"><span className="material-icons text-amber-300">list_alt</span> Sincronizar Órdenes / Clientes</h4>
                     <p className="text-[11px] text-indigo-200 mb-3 font-medium">Actualiza y cruza la producción.</p>
                     <select value={syncTarget} onChange={e=>setSyncTarget(e.target.value)} className="w-full p-2.5 rounded-lg bg-indigo-700/50 border border-indigo-500 text-xs font-bold text-white outline-none mb-3 cursor-pointer">
                        <option value="ALL">🔄 Extraer Todas Las Planillas</option>
                        {state.datosConfig?.filter(c=>c.servicio !== 'APPSCRIPT_BRIDGE').map(c => <option key={c.servicio} value={c.servicio}>📄 Solo {c.servicio}</option>)}
                     </select>
                     <button onClick={() => triggerSmartSync(syncTarget, 'órdenes')} disabled={state.isSmartSyncing} className={`w-full bg-white text-indigo-700 font-black py-2.5 rounded-xl shadow-sm transition flex items-center justify-center gap-2 ${state.isSmartSyncing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-50'}`}><span className="material-icons text-[18px]">autorenew</span> Auto-Extraer Órdenes</button>
                  </div>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                 <h4 className="font-black text-sm text-slate-700 flex items-center gap-2 uppercase tracking-wider mb-6"><span className="material-icons text-emerald-500">add_link</span> Conectar Planilla Origen</h4>
                 <form onSubmit={handleCreateConfig} className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre Identificador</label>
                        <input type="text" value={conf.serv} onChange={e=>setConf({...conf, serv:e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 font-bold text-xs" required placeholder="Ej: BORDADOS" />
                    </div>
                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">URL Oficial de Google Sheets</label><input type="url" value={conf.url} onChange={e=>setConf({...conf, url:e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 font-bold text-xs" required /></div>
                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre Pestaña</label><input type="text" value={conf.sheet} onChange={e=>setConf({...conf, sheet:e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 font-bold text-xs" required /></div>
                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl mt-4">
                       <p className="text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-3">Mapeo</p>
                       <div className="grid grid-cols-2 gap-3">
                          <div><label className="block text-[9px] font-bold text-slate-500">Col ORDEN</label><input type="text" value={conf.cord} onChange={e=>setConf({...conf, cord:e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-center uppercase" maxLength="2" required/></div>
                          <div><label className="block text-[9px] font-bold text-slate-500">Col CLIENTE</label><input type="text" value={conf.ccli} onChange={e=>setConf({...conf, ccli:e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-center uppercase" maxLength="2" required/></div>
                          <div><label className="block text-[9px] font-bold text-slate-500">Col CANT</label><input type="text" value={conf.ccan} onChange={e=>setConf({...conf, ccan:e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-center uppercase" maxLength="2" required/></div>
                          <div><label className="block text-[9px] font-bold text-slate-500">Col TRAB</label><input type="text" value={conf.ctra} onChange={e=>setConf({...conf, ctra:e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-center uppercase" maxLength="2" /></div>
                          <div><label className="block text-[9px] font-bold text-slate-500">Col PROD</label><input type="text" value={conf.cpro} onChange={e=>setConf({...conf, cpro:e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-center uppercase" maxLength="2" /></div>
                          <div><label className="block text-[9px] font-bold text-slate-500">Col MODO</label><input type="text" value={conf.cmod} onChange={e=>setConf({...conf, cmod:e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-center uppercase" maxLength="2" /></div>
                          <div><label className="block text-[9px] font-bold text-slate-500">Col FECHA</label><input type="text" value={conf.cfec} onChange={e=>setConf({...conf, cfec:e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-center uppercase" maxLength="2" /></div>
                          <div><label className="block text-[9px] font-bold text-slate-500">Col ESTADO</label><input type="text" value={conf.cest} onChange={e=>setConf({...conf, cest:e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-center uppercase" maxLength="2" /></div>
                       </div>
                    </div>
                    <button type="submit" className="w-full mt-4 bg-emerald-600 text-white font-black py-3 rounded-xl hover:bg-emerald-700 shadow-md transition flex items-center justify-center gap-2"><span className="material-icons text-[18px]">save</span> Guardar Configuración</button>
                 </form>
              </div>
           </div>
           <div className="md:col-span-8 flex flex-col h-[600px] overflow-y-auto gap-4 relative">
              {isSyncingFiles && <div className="absolute inset-0 bg-white/80 z-20 flex flex-col items-center justify-center backdrop-blur-sm rounded-2xl"><div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div><p className="font-black text-indigo-700 mt-4 uppercase tracking-widest text-sm animate-pulse">Contactando AppScript...</p></div>}
              {(!state.datosConfig || state.datosConfig.length===0) ? (
                  <div className="p-10 text-center font-bold text-slate-400 bg-white rounded-3xl border border-slate-200 shadow-sm">No has configurado ningún origen de datos.</div>
              ) : state.datosConfig.map(c => (
                 <div key={c.servicio} className="p-5 border border-slate-200 rounded-2xl bg-white shadow-sm flex flex-col gap-4 relative">
                    <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                       <div><h4 className="font-black text-lg text-slate-800 text-indigo-600">{c.servicio}</h4><p className="text-[10px] text-slate-400 font-mono mt-1 w-full truncate max-w-sm" title={c.url}>{c.url}</p></div>
                       <button onClick={() => handleDeleteConfig(c.servicio)} className="text-red-400 hover:text-red-600 bg-red-50 p-2 rounded-lg transition"><span className="material-icons text-[18px]">delete</span></button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                       <div><p className="text-[9px] font-black text-slate-400 uppercase">Hoja</p><p className="font-bold text-slate-700">{c.sheet}</p></div>
                       <div><p className="text-[9px] font-black text-slate-400 uppercase">Col ORDEN</p><p className="font-bold text-slate-700">{c.colOrd || '-'}</p></div>
                       <div><p className="text-[9px] font-black text-slate-400 uppercase">Col CLIENTE</p><p className="font-bold text-slate-700">{c.colCli || '-'}</p></div>
                       <div><p className="text-[9px] font-black text-slate-400 uppercase">Col CANTIDAD</p><p className="font-bold text-slate-700">{c.colCant || '-'}</p></div>
                       <div><p className="text-[9px] font-black text-slate-400 uppercase">Col TRABAJO</p><p className="font-bold text-slate-700">{c.colTrab || '-'}</p></div>
                       <div><p className="text-[9px] font-black text-slate-400 uppercase">Col PRODUCTO</p><p className="font-bold text-slate-700">{c.colProd || '-'}</p></div>
                       <div><p className="text-[9px] font-black text-slate-400 uppercase">Col MODO</p><p className="font-bold text-slate-700">{c.colModo || '-'}</p></div>
                       <div><p className="text-[9px] font-black text-slate-400 uppercase">Col ESTADO</p><p className="font-bold text-slate-700">{c.colEst || '-'}</p></div>
                    </div>
                 </div>
              ))}
           </div>
        </div>
      )}

      {adminTab === 'colores' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 items-start fade-in">
           <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h4 className="font-black text-sm text-slate-700 flex items-center gap-2 uppercase tracking-wider mb-6"><span className="material-icons text-pink-500">palette</span> Asignar Color</h4>
              <p className="text-[11px] text-slate-500 mb-4 font-medium">Selecciona un estado activo en tu base de datos y asígnale un color exacto.</p>
              <form onSubmit={handleSaveColor} className="space-y-4">
                 <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Seleccionar Estado</label>
                    <select value={colorEst} onChange={e=>setColorEst(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold text-sm cursor-pointer" required>
                       <option value="">Elige un estado existente...</option>
                       {uniqueStates.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                 </div>
                 <div className="relative">
                   <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Color Visual</label>
                   <button type="button" onClick={() => setShowPalette(!showPalette)} className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 flex justify-between items-center transition hover:bg-slate-100 shadow-sm">
                       <div className="flex items-center gap-3">
                           <div className="w-6 h-6 rounded-full shadow-sm border border-slate-200" style={{backgroundColor: colorVal}}></div>
                           <span className="font-bold text-sm text-slate-700 uppercase">{colorVal}</span>
                       </div>
                       <span className="material-icons text-slate-400">palette</span>
                   </button>
                   {showPalette && (
                       <div className="absolute top-full left-0 mt-2 w-full p-4 bg-white border border-slate-200 rounded-xl shadow-xl z-20">
                           <div className="grid grid-cols-7 gap-2">
                               {PALETTE.map(hex => (
                                   <div key={hex} onClick={() => {setColorVal(hex); setShowPalette(false);}} className="w-full h-8 rounded-lg cursor-pointer transition-transform border-2 border-transparent" style={{backgroundColor: hex, transform: hex===colorVal?'scale(1.1)':'scale(1)', boxShadow: hex===colorVal?'0 0 0 3px #1e293b':''}}></div>
                               ))}
                           </div>
                       </div>
                   )}
                 </div>
                 <button type="submit" className="w-full mt-4 bg-slate-800 text-white font-black py-3 rounded-xl hover:bg-slate-900 shadow-md transition flex items-center justify-center gap-2"><span className="material-icons text-[18px]">save</span> Guardar Regla</button>
              </form>
           </div>
           <div className="md:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-[600px] overflow-hidden">
              <div className="p-5 border-b border-slate-100"><h4 className="font-bold text-slate-700 flex items-center gap-2"><span className="material-icons text-pink-500">format_paint</span> Reglas Activas</h4></div>
              <div className="overflow-y-auto flex-1">
                 <table className="w-full text-left border-collapse">
                    <thead className="bg-white sticky top-0 shadow-sm border-b border-slate-200">
                       <tr><th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Estado en BD</th><th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Color Asignado</th><th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider text-right">Acción</th></tr>
                    </thead>
                    <tbody>
                       {(!state.rawColoresEstados || state.rawColoresEstados.length===0) ? (
                           <tr><td colSpan="3" className="p-10 text-center font-bold text-slate-400">No hay colores personalizados.</td></tr>
                       ) : state.rawColoresEstados.map(c => {
                           let badgeStyle = {};
                           let badgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
                           if (c.color && c.color.startsWith('#')) {
                               badgeStyle = { backgroundColor: c.color, color: getContrastYIQ(c.color), borderColor: c.color };
                               badgeClass = 'shadow-sm';
                           }
                           return (
                               <tr key={c.estado} className="border-b border-slate-100 hover:bg-slate-50 transition">
                                 <td className="px-4 py-3"><span className="font-black text-sm text-slate-800 uppercase">{c.estado}</span></td>
                                 <td className="px-4 py-3">
                                    <span className={`px-3 py-1 rounded-md font-bold uppercase text-[10px] border ${badgeClass} whitespace-nowrap inline-flex items-center gap-2`} style={badgeStyle}>
                                       {c.color.startsWith('#') && <span className="w-3 h-3 rounded-full shadow-sm block" style={{backgroundColor: c.color, border: '1px solid rgba(0,0,0,0.1)'}}></span>}
                                       {c.color}
                                    </span>
                                 </td>
                                 <td className="px-4 py-3 text-right"><button onClick={() => handleDeleteColor(c.estado)} className="w-8 h-8 bg-white border border-slate-200 text-red-500 rounded-lg hover:bg-red-50 transition inline-flex items-center justify-center"><span className="material-icons text-[18px]">delete</span></button></td>
                               </tr>
                           );
                       })}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {adminTab === 'auditoria' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 items-start fade-in">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-[600px] overflow-hidden">
               <div className="p-5 border-b border-slate-100 flex-shrink-0"><h4 className="font-bold text-slate-700 flex items-center gap-2"><span className="material-icons text-indigo-500">radar</span> Radar de Clientes Activos</h4></div>
               <div className="p-6 flex flex-col gap-6 overflow-y-auto flex-1">
                  <p className="text-[11px] text-slate-500 font-medium">Cruza el historial de órdenes para detectar si le estás produciendo a un ID que no está formalmente registrado en la base de datos de clientes.</p>
                  
                  <div className="flex gap-4">
                      <div className="flex-1 bg-slate-50 rounded-2xl p-4 border border-slate-200 text-center flex flex-col items-center justify-center">
                         <p className="text-3xl font-black text-slate-700 mb-1">{rend.actAll.size}</p>
                         <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Todos los tiempos</p>
                      </div>
                      <div className="flex-1 bg-emerald-50 rounded-2xl p-4 border border-emerald-100 text-center flex flex-col items-center justify-center shadow-sm transform scale-105 relative z-10">
                         <p className="text-4xl font-black text-emerald-600 mb-1">{rend.act3m.size}</p>
                         <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Últimos 3 Meses</p>
                      </div>
                      <div className="flex-1 bg-slate-50 rounded-2xl p-4 border border-slate-200 text-center flex flex-col items-center justify-center">
                         <p className="text-3xl font-black text-slate-700 mb-1">{rend.act1m.size}</p>
                         <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Último Mes</p>
                      </div>
                  </div>
                  
                  <div className="mt-2 bg-red-50/50 p-4 rounded-2xl border border-red-100 flex-1 flex flex-col">
                     <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 border-b border-red-100 pb-3 flex-shrink-0">
                        <h5 className="text-[10px] font-black text-red-600 uppercase tracking-widest flex items-center gap-1"><span className="material-icons text-[14px]">warning</span> IDs Activos no registrados:</h5>
                        <div className="flex bg-white rounded-lg border border-red-200 p-1 w-max">
                           <button onClick={() => setUnregView('1m')} className={`px-3 py-1.5 text-[9px] font-black rounded-md transition ${unregView==='1m'?'bg-red-100 text-red-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>Último Mes ({rend.unreg1m.length})</button>
                           <button onClick={() => setUnregView('3m')} className={`px-3 py-1.5 text-[9px] font-black rounded-md transition ${unregView==='3m'?'bg-red-100 text-red-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>3 Meses ({rend.unreg3m.length})</button>
                           <button onClick={() => setUnregView('all')} className={`px-3 py-1.5 text-[9px] font-black rounded-md transition ${unregView==='all'?'bg-red-100 text-red-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>Histórico ({rend.unregAll.length})</button>
                        </div>
                     </div>
                     <div className="flex flex-wrap gap-2 flex-1 overflow-y-auto content-start">
                        {listUnreg.length === 0 ? <span className="text-xs text-slate-500 font-bold p-2">Todos los clientes evaluados en este periodo están registrados.</span> : listUnreg.map(id => (
                           <span key={id} className="bg-white border border-red-200 text-red-600 px-2 py-1 rounded-lg text-[10px] font-mono font-bold shadow-sm">{id.toUpperCase()}</span>
                        ))}
                     </div>
                  </div>
               </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-[600px] overflow-hidden">
               <div className="p-5 border-b border-slate-100 flex-shrink-0"><h4 className="font-bold text-slate-700 flex items-center gap-2"><span className="material-icons text-pink-500">find_in_page</span> Detector de Agrupaciones</h4></div>
               <div className="p-6 pb-2 border-b border-slate-100 flex-shrink-0">
                  <p className="text-[11px] text-slate-500 font-medium mb-4">Analiza la tabla de clientes (ignorando mayúsculas y espacios) para buscar registros que comparten datos idénticos.</p>
                  {rend.dups.length > 0 && (
                      <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between shadow-sm">
                          <div>
                              <p className="text-sm font-black text-red-700 flex items-center gap-1"><span className="material-icons text-[18px]">error</span> ¡Alerta de Duplicidad!</p>
                              <p className="text-[11px] text-red-600 font-medium mt-1">Un total de <b>{rend.dups.reduce((acc, g)=>acc+g.length, 0)} registros</b> están agrupados en {rend.dups.length} grupos.</p>
                          </div>
                      </div>
                  )}
               </div>
               <div className="p-6 overflow-y-auto flex-1 bg-slate-50 relative">
                  {rend.dups.length === 0 ? (
                      <div className="p-10 text-center text-emerald-600 font-bold bg-emerald-50 rounded-3xl border border-emerald-100 flex flex-col items-center justify-center">
                          <span className="material-icons text-5xl flex mb-3 text-emerald-400">check_circle</span>
                          <p className="text-xl font-black text-emerald-700">¡Base de Datos Limpia!</p>
                          <p className="text-xs mt-1 text-emerald-600/80">No se encontraron clientes compartiendo datos.</p>
                      </div>
                  ) : (
                      rend.dups.map((group, idx) => {
                          const groupTitle = group[0].id.toUpperCase();
                          const cleanStr = (s) => s ? String(s).toLowerCase().replace(/\s+/g, '').trim() : '';

                          let sharedHtml = [];
                          rend.fields.forEach(f => {
                              const counts = {};
                              const origs = {};
                              group.forEach(c => {
                                  const val = cleanStr(c[f.key]);
                                  if (val && val !== 'null' && val !== 'undefined' && val !== '-') {
                                      counts[val] = (counts[val] || 0) + 1;
                                      origs[val] = c[f.key];
                                  }
                              });
                              Object.keys(counts).forEach(v => {
                                  if (counts[v] > 1) {
                                      sharedHtml.push(<span key={v} className="bg-red-50 text-red-700 px-2 py-1 rounded text-[10px] border border-red-100 font-bold shadow-sm break-all">{f.label}: {origs[v]}</span>);
                                  }
                              });
                          });

                          return (
                              <details key={idx} className="mb-3 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden transition-all duration-300 group-details">
                                  <summary className="p-4 cursor-pointer hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 list-none">
                                      <div className="flex-1">
                                          <span className="text-xs font-black text-slate-800 flex items-center gap-2 mb-2"><span className="material-icons text-red-500 text-[18px]">warning</span> Grupo: <span className="text-red-600 font-mono">{groupTitle}</span></span>
                                          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Datos duplicados:</p>
                                          <div className="flex flex-wrap gap-2">{sharedHtml}</div>
                                      </div>
                                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 mt-2 sm:mt-0">
                                          <span className="text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 px-2 py-1 rounded-lg">{group.length} registros</span>
                                          <span className="material-icons text-slate-400">expand_more</span>
                                      </div>
                                  </summary>
                                  <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-2">
                                      <p className="text-[10px] font-black text-slate-500 uppercase mb-1 ml-1">Registros involucrados:</p>
                                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                                         {group.map(c => {
                                             const isActivo = rend.act3m.has(String(c.id).trim().toLowerCase());
                                             return (
                                                 <div key={c.id} className={`${isActivo ? 'bg-emerald-50/30 border-emerald-200' : 'bg-white border-slate-200'} p-3 rounded-xl border text-xs flex flex-col gap-1 shadow-sm relative`}>
                                                     <p className="pr-6 flex items-center"><b className="text-indigo-600 font-mono tracking-wider text-sm">{c.id}</b> {isActivo && <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[8px] font-black uppercase ml-2">Activo 3M</span>} <span className="text-slate-300 mx-2">|</span> <span className="font-bold text-slate-700 truncate">{c.name || 'Sin Nombre'}</span></p>
                                                     <p className="text-[10px] text-slate-500 mt-1"><b className="text-slate-600">Tel:</b> {c.phone || '-'} <span className="text-slate-300 mx-1">|</span> <b className="text-slate-600">Mail:</b> {c.mail || '-'} <span className="text-slate-300 mx-1">|</span> <b className="text-slate-600">RUT:</b> {c.rut || '-'}</p>
                                                     <p className="text-[10px] text-slate-500"><b className="text-slate-600">Empresa:</b> {c.empresa || '-'} <span className="text-slate-300 mx-1">|</span> <b className="text-slate-600">Dir:</b> {c.direccion || '-'}</p>
                                                 </div>
                                             )
                                         })}
                                      </div>
                                  </div>
                              </details>
                          );
                      })
                  )}
               </div>
            </div>
        </div>
      )}

      {syncResult && (
         <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className={`bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden fade-in border-4 \${syncResult.type === 'error' ? 'border-red-500' : 'border-indigo-500'}`}>
               <div className={`p-6 text-center \${syncResult.type === 'error' ? 'bg-red-500' : 'bg-indigo-600'}`}>
                  <span className="material-icons text-white text-5xl mb-2">{syncResult.type === 'error' ? 'error_outline' : 'check_circle'}</span>
                  <h4 className="text-xl font-black text-white uppercase tracking-widest">{syncResult.title}</h4>
               </div>
               <div className="p-6 text-center">
                  <p className="text-sm font-bold text-slate-600 mb-6">{syncResult.desc}</p>
                  
                  {syncResult.type === 'success' && syncResult.maestras !== undefined && (
                     <div className="flex flex-col gap-2 mb-6">
                        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                           <span className="text-xs font-black text-slate-500 uppercase">Órdenes Maestras</span>
                           <span className="text-lg font-black text-indigo-700">{syncResult.maestras}</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                           <span className="text-xs font-black text-slate-500 uppercase">Servicios Detalle</span>
                           <span className="text-lg font-black text-emerald-600">{syncResult.servicios}</span>
                        </div>
                     </div>
                  )}

                  {syncResult.type === 'success' && syncResult.debugInfo && syncResult.debugInfo.length > 0 && (
                     <div className="text-left bg-red-50 p-3 rounded-xl border border-red-200 mb-6 max-h-32 overflow-y-auto">
                        <p className="text-[10px] font-black text-red-600 uppercase mb-2"><span className="material-icons text-[12px]">warning</span> Errores interceptados por la sincronización:</p>
                        <ul className="list-disc pl-4 text-xs font-medium text-slate-700">
                           {syncResult.debugInfo.map((msg, i) => <li key={i}>{msg}</li>)}
                        </ul>
                     </div>
                  )}

                  {syncResult.type === 'success' && syncResult.clientes !== undefined && (
                     <div className="flex flex-col gap-2 mb-6">
                        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                           <span className="text-xs font-black text-slate-500 uppercase">Nuevos Clientes Creados</span>
                           <span className="text-lg font-black text-indigo-700">{syncResult.clientes}</span>
                        </div>
                     </div>
                  )}

                  <button onClick={() => { setSyncResult(null); loadSystemData(); }} className="w-full py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold uppercase tracking-wider text-xs rounded-xl transition">
                     Cerrar
                  </button>
               </div>
            </div>
         </div>
      )}

      {isSyncingFiles && (
         <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
             <div className="bg-white p-8 rounded-[2rem] shadow-2xl flex flex-col items-center gap-4 animate-pulse relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-2 bg-indigo-500"></div>
                <span className="material-icons text-indigo-600 text-6xl rotate-animation mt-2" style={{animation: 'spin 2s linear infinite'}}>sync</span>
                <h3 className="text-xl font-black text-slate-800">Cargando datos origen...</h3>
                <p className="text-xs font-bold text-slate-500">Por favor, no cierres esta ventana. El Google Apps Script tarda hasta 30 segundos.</p>
             </div>
             <style dangerouslySetInnerHTML={{__html: `\n@keyframes spin { 100% { transform: rotate(360deg); } }\n`}} />
         </div>
      )}

      {isSyncingFiles && (
         <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
             <div className="bg-white p-8 rounded-[2rem] shadow-2xl flex flex-col items-center gap-4 animate-pulse relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-2 bg-indigo-500"></div>
                <span className="material-icons text-indigo-600 text-6xl mt-2" style={{animation: 'spin 2s linear infinite'}}>sync</span>
                <h3 className="text-xl font-black text-slate-800">Cargando datos origen...</h3>
                <p className="text-xs font-bold text-slate-500">Por favor, no cierres esta ventana. El puente tarda unos segundos.</p>
             </div>
         </div>
      )}

      {/* Modal de Confirmación Genérico */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setConfirmModal({ isOpen: false, msg: '', action: null })}></div>
            <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 relative z-10 fade-in border border-slate-100">
                <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <span className="material-icons" style={{fontSize: '28px'}}>warning</span>
                </div>
                <h3 className="text-xl font-black text-center text-slate-800 mb-2">Confirmar Acción</h3>
                <p className="text-sm text-slate-500 text-center mb-6 whitespace-pre-wrap">
                    {confirmModal.msg}
                </p>
                <div className="flex gap-3">
                    <button onClick={() => setConfirmModal({ isOpen: false, msg: '', action: null })} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition text-sm">
                        Cancelar
                    </button>
                    <button onClick={() => {
                        if (confirmModal.action) confirmModal.action();
                        setConfirmModal({ isOpen: false, msg: '', action: null });
                    }} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 text-sm">
                        Aceptar
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}
