const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('auditHost',{save:doc=>ipcRenderer.invoke('audit-save',doc),boolean:data=>ipcRenderer.invoke('audit-boolean',data)});
