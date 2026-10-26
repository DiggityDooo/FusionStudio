// Original rounded U-neck profile. The inner tangents align with the retained
// straight centre segment. 2D panels and 3D arrangement use the same parameters.
export function roundedNecklineCurves(a,b,c,d){
 const n=a?.length;
 if(![2,3].includes(n)||[a,b,c,d].some(p=>!Array.isArray(p)||p.length!==n||p.some(v=>!Number.isFinite(v))))throw Error('Invalid neckline profile points.');
 if(!(a[0]>b[0]&&b[0]>c[0]&&c[0]>d[0]&&a[1]>b[1]&&d[1]>c[1])||Math.abs(b[1]-c[1])>1e-8||n===3&&Math.abs(b[2]-c[2])>1e-8)throw Error('Neckline endpoints must form an upright U with a level centre.');
 const first=[...a],second=[...b],third=[...c],fourth=[...d];
 for(let k=1;k<n;k++){first[k]=a[k]+(b[k]-a[k])*.65;fourth[k]=d[k]+(c[k]-d[k])*.65;}
 second[0]=b[0]+(a[0]-b[0])*.55;third[0]=c[0]+(d[0]-c[0])*.55;
 return [[a.slice(),first,second,b.slice()],[c.slice(),third,fourth,d.slice()]];
}

export function necklineCurvePoint(curve,t){
 const u=1-t;return curve[0].map((v,i)=>u*u*u*v+3*u*u*t*curve[1][i]+3*u*t*t*curve[2][i]+t*t*t*curve[3][i]);
}
