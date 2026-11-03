const http=require('node:http'),crypto=require('node:crypto');
const {McpServer}=require('@modelcontextprotocol/sdk/server/mcp.js');
const {StreamableHTTPServerTransport}=require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {z}=require('zod');
const context={projectId:z.string().min(1).max(100),revision:z.number().int().nonnegative()};
const tools={
 scene_inspect:{description:'Inspect Fusion scene hierarchy, transforms and supported asset capabilities.',schema:{},write:false},
 selection_inspect:{description:'Inspect current Fusion selection and document revision.',schema:{},write:false},
 selection_set:{description:'Select an existing scene object by UUID.',schema:{...context,objectId:z.string().min(1).max(100)},write:true},
 primitive_add:{description:'Add one primitive as one undoable Fusion operation.',schema:{...context,type:z.enum(['cube','sphere','cylinder','torus','plane','cone','capsule'])},write:true},
 object_transform:{description:'Set one object transform component. Position uses meters, rotation uses degrees, scale is a multiplier. Absolute values are bounded to one million.',schema:{...context,objectId:z.string().min(1).max(100),kind:z.enum(['position','rotation','scale']),axis:z.enum(['x','y','z']),value:z.number().finite().min(-1000000).max(1000000)},write:true},
 history_undo:{description:'Undo the latest Fusion operation.',schema:context,write:true},
 history_redo:{description:'Redo the latest undone Fusion operation.',schema:context,write:true}
};
class FusionMcp{
 constructor(invoke){this.invoke=invoke;this.server=null;this.allowWrites=false;}
 async start({port=39157,token,allowWrites=false}){if(!Number.isInteger(port)||(port!==0&&(port<1024||port>65535)))throw Error('MCP port must be 1024–65535.');if(typeof token!=='string'||token.length<32)throw Error('MCP authentication token is unavailable.');await this.close();this.allowWrites=!!allowWrites;
  const listener=async(req,res)=>{
   const reject=(code,message)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify({error:message}));};
   if(req.url!=='/mcp')return reject(404,'Unknown endpoint.');
   const hosts=['127.0.0.1:'+this.port,'localhost:'+this.port];if(!hosts.includes(req.headers.host)||req.headers.origin&&!hosts.map(h=>'http://'+h).includes(req.headers.origin))return reject(403,'Invalid MCP origin or host.');
   const auth=req.headers.authorization||'',expected='Bearer '+token;if(Buffer.byteLength(auth)!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(Buffer.from(auth),Buffer.from(expected)))return reject(401,'MCP authentication required.');
   if(req.method!=='POST')return reject(405,'Use MCP POST requests.');
   let sdk,transport;
   try{
    let bytes=0,chunks=[];for await(const c of req){bytes+=c.length;if(bytes>1024*1024)return reject(413,'MCP request exceeds 1 MiB.');chunks.push(c);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reject(400,'Invalid JSON.');}
    sdk=new McpServer({name:'fusion-studio',version:require('../package.json').version});
    for(const [name,spec] of Object.entries(tools))sdk.registerTool(name,{description:spec.description,inputSchema:spec.schema,annotations:{readOnlyHint:!spec.write,destructiveHint:false}},async args=>{try{if(spec.write&&!this.allowWrites)throw Error('MCP scene editing is disabled in Fusion.');const result=await this.invoke(name,args);return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}});
    transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});res.on('close',()=>{transport.close();sdk.close();});await sdk.connect(transport);await transport.handleRequest(req,res,body);
   }catch{if(!res.headersSent)reject(500,'MCP request failed.');else res.end();transport?.close();sdk?.close();}
  };
  const server=http.createServer(listener);this.server=server;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});this.port=server.address().port;return this.status();
 }
 status(){return {enabled:!!this.server?.listening,port:this.port||39157,allowWrites:this.allowWrites,url:this.server?.listening?'http://127.0.0.1:'+this.port+'/mcp':null};}
 async close(){const server=this.server;this.server=null;if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}}
}
module.exports={FusionMcp,tools};
