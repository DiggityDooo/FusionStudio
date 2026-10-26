const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {Engine,saveProject}=require('../electron/core.cjs');
const root=process.env.FUSION_DATA_DIR;
if(!root||!path.isAbsolute(root))throw Error('Isolated benchmark data directory required');
app.setPath('userData',path.join(root,'profile'));
let engine;
app.whenReady().then(()=>{
 engine=new Engine(root,path.resolve(__dirname,'../scripts/blender_worker.py'));
 ipcMain.handle('audit-save',(_,doc)=>{const start=performance.now(),result=saveProject(root,doc);return {diskAndStringifyMs:performance.now()-start,bytes:fs.statSync(result.path).size,path:result.path};});
 ipcMain.handle('audit-boolean',async(_,data)=>{const start=performance.now(),result=await engine.run({action:'boolean',data,name:'Audit difference',params:{targetId:'audit-target',cutterId:'audit-cutter'}});return {engineMs:performance.now()-start,output:result.output,metadata:result.metadata};});
 const win=new BrowserWindow({width:1230,height:840,webPreferences:{preload:path.join(__dirname,'audit-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.loadURL(process.env.FUSION_AUDIT_URL);
});
app.on('window-all-closed',()=>{engine?.cancel();app.quit();});
