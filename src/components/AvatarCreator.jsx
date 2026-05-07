import React, { useState } from 'react';

const AVATAR_OPTIONS = {
    top: [
      { id: 'shavedSides', name: 'Laterales Rapados' }, { id: 'theCaesarAndSidePart', name: 'César con Raya' },
      { id: 'shortCurly', name: 'Corto Rizado' }, { id: 'shortRound', name: 'Corto Redondo' },
      { id: 'shortWaved', name: 'Corto Ondulado' }, { id: 'shaggy', name: 'Desaliñado' },
      { id: 'shaggyMullet', name: 'Mullet Moderno' }, { id: 'sides', name: 'Solo Laterales' },
      { id: 'dreads01', name: 'Dreads Finas' }, { id: 'dreads02', name: 'Dreads Gruesas' },
      { id: 'frizzle', name: 'Frizz Abundante' }, { id: 'curvy', name: 'Ondulado Largo' },
      { id: 'straightAndStrand', name: 'Lacio con Mechón' }, { id: 'longButNotTooLong', name: 'Largo Medio' },
      { id: 'bigHair', name: 'Volumen Alto' }, { id: 'frida', name: 'Trenzas Arriba' },
      { id: 'fro', name: 'Afro Grande' }, { id: 'froBand', name: 'Afro con Banda' },
      { id: 'miaWallace', name: 'Bob Recto' }, { id: 'straight02', name: 'Lacio Capas' },
      { id: 'shortFlat', name: 'Corto Liso' }, { id: 'theCaesar', name: 'César' },
      { id: 'straight01', name: 'Largo Lacio' }, { id: 'curly', name: 'Largo Rizado' },
      { id: 'bob', name: 'Corte Bob' }, { id: 'bun', name: 'Moño' },
      { id: 'hat', name: 'Sombrero' }, { id: 'winterHat1', name: 'Gorro Invierno' },
      { id: 'hijab', name: 'Hijab' }, { id: 'turban', name: 'Turbante' }
    ],
    accessories: [
      { id: '', name: 'Ninguno' }, { id: 'prescription01', name: 'Lentes Clásicos' },
      { id: 'prescription02', name: 'Lentes Finos' }, { id: 'round', name: 'Redondos' },
      { id: 'sunglasses', name: 'Gafas de Sol' }, { id: 'wayfarers', name: 'Estilo Wayfarer' },
      { id: 'eyepatch', name: 'Parche' }
    ],
    facialHair: [
      { id: '', name: 'Sin Barba' }, { id: 'beardMedium', name: 'Barba Media' },
      { id: 'beardLight', name: 'Barba Ligera' }, { id: 'beardMajestic', name: 'Barba Majestuosa' },
      { id: 'moustacheFancy', name: 'Bigote Fino' }, { id: 'moustacheMagnum', name: 'Bigote Grueso' }
    ],
    clothing: [
      { id: 'blazerAndShirt', name: 'Traje y Camisa' }, { id: 'blazerAndSweater', name: 'Traje y Suéter' },
      { id: 'collarAndSweater', name: 'Suéter con Cuello' }, { id: 'graphicShirt', name: 'Camiseta Gráfica' },
      { id: 'hoodie', name: 'Sudadera' }, { id: 'overall', name: 'Overol' },
      { id: 'shirtCrewNeck', name: 'Camiseta Casual' }
    ],
    skinColor: [
      { id: 'ffdbb4', name: 'Pálida' }, { id: 'edb98a', name: 'Clara' }, { id: 'f8d25c', name: 'Amarilla' },
      { id: 'd08b5b', name: 'Bronceada' }, { id: 'ae5d29', name: 'Castaña' }, { id: '614335', name: 'Oscura' }
    ],
    hairColor: [
      { id: '2c1b18', name: 'Negro' }, { id: '4a312c', name: 'Marrón Oscuro' }, { id: 'a55728', name: 'Castaño' },
      { id: 'd6b370', name: 'Rubio' }, { id: 'c93305', name: 'Pelirrojo' }, { id: 'e8e1e1', name: 'Gris' },
      { id: 'f59797', name: 'Rosa' }
    ],
    accessoriesColor: [
      { id: '262e33', name: 'Negro Mate' }, { id: 'e6e6e6', name: 'Plata / Blanco' },
      { id: 'ffdeb5', name: 'Dorado Metalizado' }, { id: '5199e4', name: 'Azul Espejo' },
      { id: 'ff488e', name: 'Rosa Neón' }, { id: 'ff5c5c', name: 'Rojo Fuego' }
    ]
};

function buildPreviewUrl(style, format, props, bgTransparent) {
    const params = new URLSearchParams({
        seed: props._seed || 'nexus', style,
        accessoriesProbability: props.accessories ? '100' : '0',
        facialHairProbability: props.facialHair ? '100' : '0'
    });
    params.append('backgroundColor', bgTransparent ? 'transparent' : 'b6e3f4,c0aede,d1d4f9');
    if (props.top) params.append('top', props.top);
    if (props.hairColor) params.append('hairColor', props.hairColor);
    if (props.accessories) params.append('accessories', props.accessories);
    if (props.accessoriesColor) params.append('accessoriesColor', props.accessoriesColor);
    if (props.facialHair) params.append('facialHair', props.facialHair);
    if (props.facialHairColor) params.append('facialHairColor', props.facialHairColor);
    if (props.clothing) params.append('clothing', props.clothing);
    if (props.skinColor) params.append('skinColor', props.skinColor);
    return `https://api.dicebear.com/7.x/avataaars/${format}?${params.toString()}`;
}

export default function AvatarCreator({ seed, onSave, onClose }) {
    const [creatorSeed, setCreatorSeed] = useState(seed || 'nexus');
    const [saving, setSaving] = useState(false);
    const [props, setProps] = useState({
        _seed: seed || 'nexus',
        top: 'shortFlat', hairColor: '2c1b18', accessories: '', accessoriesColor: '262e33',
        facialHair: '', facialHairColor: '2c1b18', clothing: 'blazerAndShirt', skinColor: 'edb98a'
    });

    const updateProp = (key, val) => setProps(p => ({ ...p, [key]: val }));
    const updateSeed = (s) => { setCreatorSeed(s); setProps(p => ({ ...p, _seed: s })); };

    const previewUrl = buildPreviewUrl('circle', 'svg', props, false);

    const handleConfirm = async () => {
        setSaving(true);
        try {
            const pngUrl = buildPreviewUrl('circle', 'png', props, false) + '&size=512';
            const res = await fetch(pngUrl);
            const blob = await res.blob();
            const reader = new FileReader();
            reader.onloadend = () => { onSave(reader.result); setSaving(false); };
            reader.readAsDataURL(blob);
        } catch (e) {
            console.error(e);
            setSaving(false);
        }
    };

    const Section = ({ label, colorKey, colorOptions, children }) => (
        <div>
            <div className="flex items-center gap-4 mb-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
                {colorKey && colorOptions && (
                    <div className="flex gap-1">
                        {colorOptions.map(o => (
                            <button key={o.id} type="button" onClick={() => updateProp(colorKey, o.id)}
                                className={`w-4 h-4 rounded-full border transition-transform ${props[colorKey] === o.id ? 'scale-125 ring-1 ring-indigo-500 border-indigo-400' : 'border-slate-200'}`}
                                style={{ backgroundColor: `#${o.id}` }} title={o.name} />
                        ))}
                    </div>
                )}
            </div>
            <div className="flex overflow-x-auto gap-2 pb-2 pr-4" style={{ scrollbarWidth: 'thin' }}>{children}</div>
        </div>
    );

    const Thumb = ({ selected, onClick, src, fallback }) => (
        <button type="button" onClick={onClick}
            className={`shrink-0 w-16 h-16 border-2 rounded-2xl transition-all overflow-hidden relative flex items-center justify-center ${selected ? 'border-indigo-500 bg-indigo-50' : 'border-transparent bg-slate-50 hover:bg-slate-100'}`}>
            {src ? <img className="w-full h-full object-cover scale-[1.7] translate-y-3" src={src} alt="" /> : <div className="font-bold text-[10px] text-slate-400">{fallback}</div>}
        </button>
    );

    return (
        <div className="fixed inset-0 z-[20000] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-slate-200" onClick={e => e.stopPropagation()}>

                {/* Preview */}
                <div className="bg-slate-50 p-8 flex-1 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-200 relative">
                    <h2 className="absolute top-6 left-6 font-black text-xl text-slate-800">Creador de Avatar</h2>
                    <button type="button" onClick={onClose} className="absolute top-6 right-6 p-2 bg-white rounded-xl shadow-sm text-slate-400 hover:text-slate-600 transition">
                        <span className="material-icons">close</span>
                    </button>
                    <div className="w-64 h-64 rounded-3xl overflow-hidden shadow-2xl ring-8 ring-white mt-8 md:mt-0 bg-white">
                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                </div>

                {/* Controls */}
                <div className="p-6 flex-1 flex flex-col justify-start space-y-5 overflow-y-auto max-h-[80vh]" style={{ scrollbarWidth: 'thin' }}>

                    {/* Skin */}
                    <div className="bg-slate-50 p-4 rounded-2xl flex flex-wrap gap-6 border border-slate-200">
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Tono de Piel</label>
                            <div className="flex gap-1.5">
                                {AVATAR_OPTIONS.skinColor.map(o => (
                                    <button key={o.id} type="button" onClick={() => updateProp('skinColor', o.id)}
                                        className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${props.skinColor === o.id ? 'border-indigo-600 scale-110 ring-2 ring-indigo-200' : 'border-slate-200'}`}
                                        style={{ backgroundColor: `#${o.id}` }} title={o.name} />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Hair */}
                    <Section label="Cabello / Sombrero" colorKey="hairColor" colorOptions={AVATAR_OPTIONS.hairColor}>
                        {AVATAR_OPTIONS.top.map(o => (
                            <Thumb key={o.id} selected={props.top === o.id} onClick={() => updateProp('top', o.id)}
                                src={buildPreviewUrl('default', 'svg', { ...props, top: o.id, accessories: '', facialHair: '' }, true)} />
                        ))}
                    </Section>

                    {/* Facial Hair */}
                    <Section label="Barba / Bigote" colorKey="facialHairColor" colorOptions={AVATAR_OPTIONS.hairColor}>
                        {AVATAR_OPTIONS.facialHair.map(o => (
                            <Thumb key={o.id || 'none'} selected={props.facialHair === o.id} onClick={() => updateProp('facialHair', o.id)}
                                src={o.id ? buildPreviewUrl('default', 'svg', { ...props, top: 'shortFlat', facialHair: o.id, accessories: '' }, true) : null}
                                fallback="Ninguna" />
                        ))}
                    </Section>

                    {/* Glasses */}
                    <Section label="Gafas / Lentes" colorKey="accessoriesColor" colorOptions={AVATAR_OPTIONS.accessoriesColor}>
                        {AVATAR_OPTIONS.accessories.map(o => (
                            <Thumb key={o.id || 'none'} selected={props.accessories === o.id} onClick={() => updateProp('accessories', o.id)}
                                src={o.id ? buildPreviewUrl('default', 'svg', { ...props, accessories: o.id, top: 'shortFlat', facialHair: '' }, true) : null}
                                fallback="Ninguno" />
                        ))}
                    </Section>

                    {/* Clothing */}
                    <Section label="Ropa / Atuendo">
                        {AVATAR_OPTIONS.clothing.map(o => (
                            <Thumb key={o.id} selected={props.clothing === o.id} onClick={() => updateProp('clothing', o.id)}
                                src={buildPreviewUrl('default', 'svg', { ...props, clothing: o.id, top: 'shortFlat', accessories: '', facialHair: '' }, true)} />
                        ))}
                    </Section>

                    {/* Seed */}
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Modificar Semilla Base (Rasgos)</label>
                        <input type="text" value={creatorSeed} onChange={e => updateSeed(e.target.value)} placeholder="Escribe tu nombre..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:border-indigo-500" />
                    </div>

                    {/* Confirm */}
                    <div className="pt-4 border-t border-slate-100 mt-auto">
                        <button type="button" onClick={handleConfirm} disabled={saving}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-lg shadow-indigo-600/30 transition-transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50">
                            <span className="material-icons">{saving ? 'sync' : 'check_circle'}</span>
                            {saving ? 'Generando...' : 'Usar este Avatar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
