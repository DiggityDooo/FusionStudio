const fs=require('node:fs'),path=require('node:path');
function candidateLaunch(root,{packaged=false}={}){
 if(!packaged&&!process.env.FUSION_TEST_EXECUTABLE)return {args:[root]};
 const executablePath=path.resolve(process.env.FUSION_TEST_EXECUTABLE||path.join(root,require('../package.json').build.directories.output,'win-unpacked/Fusion Studio.exe'));
 if(!fs.existsSync(executablePath)||!fs.statSync(executablePath).isFile())throw Error('Candidate executable is missing: '+executablePath);
 return {executablePath};
}
module.exports={candidateLaunch};
