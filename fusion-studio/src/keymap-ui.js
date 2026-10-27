import {ACTIONS,PRESETS,NAVIGATION,navigationScheme,normalize,chordsFor,rebind,unbind,resolveKey,chord,describeChord,describeNavigation,serializeKeymap,parseKeymap} from './keymap.js';
import {ViewportNavigation} from './navigation.js';

const STORE='fusion-keymap-v1',OPTIONS=[['orbitSelection','Orbit around selection (recenters on it)'],['zoomToCursor','Zoom to mouse position'],['invertZoom','Invert wheel zoom'],['emulate3','Emulate 3-button mouse (Alt + left drag)']];
export class Keyboard {
  constructor(editor,{onChange=()=>{},notify=()=>{}}={}){
    this.onChange=onChange;try{this.settings=normalize(JSON.parse(localStorage.getItem(STORE)||'{}'));}catch(error){this.settings=normalize({});notify('Saved keymap could not be read and was reset: '+error.message,true);}
    this.navigation=editor.navigation=new ViewportNavigation(editor,()=>this.settings);
  }
  set(next){this.settings=normalize(next);localStorage.setItem(STORE,JSON.stringify(this.settings));this.navigation.apply();this.onChange();}
  resolve(e){return this.navigation.heldConsumes(e)?null:resolveKey(this.settings,e);}
  shortcut(action){const c=chordsFor(this.settings,action)[0];return c?describeChord(c):'';}
  navigationHint(){return describeNavigation(this.settings);}
  orbitHint(){const map=NAVIGATION[navigationScheme(this.settings)]?.map;if(!map)return 'Alt drag to orbit';const c=Object.keys(map).find(c=>map[c]==='orbit'&&c!=='lmb');return c?describeChord(c)+' drag to orbit':'';}
  openPreferences({modal,esc,$}){
    let filter='',capture=null,message='';
    modal('Preferences · Keymap & Navigation','<div id="keymap-prefs" class="keymap-prefs"></div>');
    const draw=()=>{const s=this.settings,q=filter.toLowerCase();$('#keymap-prefs').innerHTML=`
      <label class="field-label" for="keymap-preset">Keymap preset</label><select id="keymap-preset">${Object.entries(PRESETS).map(([id,p])=>`<option value="${id}" ${s.preset===id?'selected':''}>${esc(p.label)}</option>`).join('')}</select>
      <label class="field-label" for="keymap-navigation">Viewport navigation</label><select id="keymap-navigation"><option value="preset">Match keymap preset</option>${Object.entries(NAVIGATION).map(([id,n])=>`<option value="${id}" ${s.navigation===id?'selected':''}>${esc(n?.label||'Fusion Studio')}</option>`).join('')}</select>
      <p class="description" id="keymap-navigation-hint">${esc(this.navigationHint())}</p>
      ${OPTIONS.map(([k,label])=>`<label class="check-row"><input type="checkbox" data-option="${k}" ${s[k]?'checked':''}> ${esc(label)}</label>`).join('')}
      <label class="field-label" for="keymap-filter">Bindings${Object.keys(s.overrides).length?` · ${Object.keys(s.overrides).length} custom`:''}</label><input id="keymap-filter" type="search" placeholder="Filter actions or keys…" value="${esc(filter)}">
      <p class="description" id="keymap-message" role="status">${esc(message)}</p>
      <table class="coverage-table keymap-table"><tbody>${Object.entries(ACTIONS).map(([id,label])=>[id,label,chordsFor(s,id)]).filter(([id,label,cs])=>!q||label.toLowerCase().includes(q)||id.includes(q)||cs.some(c=>describeChord(c).toLowerCase().includes(q))).map(([id,label,cs])=>`<tr><td>${esc(label)}</td><td>${cs.map(c=>`<button class="chip" data-unbind="${esc(c)}" title="Remove ${esc(describeChord(c))}"><kbd>${esc(describeChord(c))}</kbd> ×</button>`).join(' ')} <button class="text-button" data-bind="${id}">${capture===id?'Press a key… (Esc cancels)':'+ Add key'}</button></td></tr>`).join('')}</tbody></table>
      <div class="keymap-actions"><button id="keymap-reset" class="button subtle">Reset to preset</button></div>
      <label class="field-label" for="keymap-json">Import / export keymap (JSON)</label><textarea id="keymap-json" rows="5" spellcheck="false">${esc(serializeKeymap(s))}</textarea><div class="keymap-actions"><button id="keymap-import" class="button subtle">Import from text</button></div>`;
      $('#keymap-preset').onchange=e=>{this.set({...this.settings,preset:e.target.value,overrides:{}});message='';draw();};
      $('#keymap-navigation').onchange=e=>{this.set({...this.settings,navigation:e.target.value});draw();};
      document.querySelectorAll('[data-option]').forEach(b=>b.onchange=()=>this.set({...this.settings,[b.dataset.option]:b.checked}));
      $('#keymap-filter').oninput=e=>{filter=e.target.value;draw();const f=$('#keymap-filter');f.focus();f.setSelectionRange(f.value.length,f.value.length);};
      document.querySelectorAll('[data-unbind]').forEach(b=>b.onclick=()=>{this.set(unbind(this.settings,b.dataset.unbind));message='Removed '+describeChord(b.dataset.unbind)+'.';draw();});
      document.querySelectorAll('[data-bind]').forEach(b=>b.onclick=()=>{capture=b.dataset.bind;draw();});
      $('#keymap-reset').onclick=()=>{this.set({...this.settings,overrides:{}});message='Bindings reset to '+PRESETS[this.settings.preset].label+'.';draw();};
      $('#keymap-import').onclick=()=>{try{this.set(parseKeymap($('#keymap-json').value));message='Keymap imported.';}catch(error){message=error.message;}draw();};
    };
    const key=e=>{if(!$('#keymap-prefs')){document.removeEventListener('keydown',key,true);return;}if(!capture)return;e.preventDefault();e.stopImmediatePropagation();if(e.key==='Escape'){capture=null;draw();return;}const c=chord(e);if(!c)return;try{const {settings,conflict}=rebind(this.settings,capture,c);this.set(settings);message=`${describeChord(c)} → ${ACTIONS[capture]}${conflict?` (replaced ${ACTIONS[conflict]})`:''}.`;}catch(error){message=error.message;}capture=null;draw();};
    document.addEventListener('keydown',key,true);draw();
  }
}
