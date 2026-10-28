
const $=i=>document.getElementById(i);
function calc(){const c=+$('c').value,s=+$('s').value,a=+$('a').value;
$('vc').textContent=c+' kWh';$('vs').textContent=s+' h/j';$('va').textContent=a===0?'Sans batterie':a+(a>1?' jours':' jour');
const kwc=c/(s*.75);$('rk').textContent=kwc.toFixed(1);$('rp').textContent=Math.ceil(kwc*1000/400);$('rb').textContent=a===0?'0':(c*a/.8).toFixed(1)}
['c','s','a'].forEach(i=>$(i).addEventListener('input',calc));calc();
