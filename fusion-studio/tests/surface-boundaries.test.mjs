import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitBoundaryChain,boundaryCurveInterval} from '../src/surface-boundaries.js';
const point=(p,t)=>[0,1].map(a=>(1-t)**3*p[0][a]+3*(1-t)**2*t*p[1][a]+3*(1-t)*t*t*p[2][a]+t**3*p[3][a]);
test('adaptive UV curves preserve endpoints and bound the entire source polyline between samples',()=>{
 const parameters=Array.from({length:257},(_,i)=>i/256),points=parameters.map(t=>[t*.65,.04*Math.sin(t*7*Math.PI)+.008*Math.sin(t*13*Math.PI)]),source=structuredClone(points),fit=fitBoundaryChain(points,parameters,{tolerance:.0004});assert.ok(fit.pieces.length>2&&fit.pieces.length<128);assert.ok(fit.errorBound<=.0004);assert.deepEqual(fit.pieces[0].curve[0],points[0]);assert.deepEqual(fit.pieces.at(-1).curve[3],points.at(-1));
 for(let i=0;i<7777;i++){const t=i/7776,k=Math.min(255,Math.floor(t*256)),u=t*256-k,expected=points[k].map((v,a)=>v*(1-u)+points[k+1][a]*u),piece=fit.pieces.find(p=>t>=p.start-1e-12&&t<=p.end+1e-12),actual=point(piece.curve,(t-piece.start)/(piece.end-piece.start));assert.ok(Math.hypot(...actual.map((v,a)=>v-expected[a]))<=piece.errorBound+1e-10);}
 assert.deepEqual(points,source);assert.deepEqual(fitBoundaryChain(points,parameters,{tolerance:.0004}),fit);
});
test('subdividing a fitted curve retains parameter correspondence exactly',()=>{
 const p=[[0,0],[.2,.3],[.6,-.1],[.8,.1]],sub=boundaryCurveInterval(p,.17,.83);for(let i=0;i<=200;i++){const t=i/200,a=point(p,.17+t*.66),b=point(sub,t);assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-12);}
});
test('straight boundaries remain exact and impossible budgets reject instead of silently changing shape',()=>{
 const line=fitBoundaryChain([[0,0],[.2,.1],[1,.5]],[0,.2,1]);assert.equal(line.pieces.length,1);assert.ok(line.errorBound<1e-12);const ts=Array.from({length:200},(_,i)=>i/199),zigzag=ts.map((t,i)=>[t,i%2*.05]);assert.throws(()=>fitBoundaryChain(zigzag,ts,{tolerance:.000001,maxPieces:8}),/piece budget/);assert.throws(()=>fitBoundaryChain([[0,0],[1,0]],[0,0]),/Invalid source/);assert.throws(()=>fitBoundaryChain([[0,0],[1,0]],[0,1],{tolerance:Infinity}),/tolerance/);
});
