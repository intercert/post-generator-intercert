// Aplica as cores da identidade ao app. A identidade mora no banco, e buscá-la leva um instante, então as duas
// cores ficam também numa cópia mínima no navegador (BrandTheme). O script roda no <head>, antes da primeira
// pintura, e usa essa cópia para a tela não piscar; depois o BrandTheme aplica as cores vindas do banco.
// Calcula também as cores de apoio (texto sobre a marca, versão escura para links) com base no contraste.

export const THEME_SCRIPT = `(function(){
  var KEY = 'post-generator:theme:v1';
  var FALLBACK = { corPrimaria: '#0052FF', corDestaque: '#00D084' };
  var DARK = '#10152b';
  function lum(h){var c=[1,3,5].map(function(i){var v=parseInt(h.slice(i,i+2),16)/255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]}
  function ratio(a,b){var x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
  function toward(h,t,p){var o='#';for(var i=1;i<7;i+=2){var v=parseInt(h.slice(i,i+2),16);v=Math.round(v+(t-v)*p);o+=('0'+v.toString(16)).slice(-2)}return o}
  function on(bg){return ratio(bg,'#ffffff')>=ratio(bg,DARK)?'#ffffff':DARK}
  function readable(h){var c=h,n=0;while(ratio(c,'#ffffff')<4.5&&n<14){c=toward(c,0,.12);n++}return c}
  function hex(v,d){return typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v.toLowerCase():d.toLowerCase()}
  window.__applyBrandTheme = function(b){
    b = b || {};
    var p = hex(b.corPrimaria, FALLBACK.corPrimaria), a = hex(b.corDestaque, FALLBACK.corDestaque);
    var s = document.documentElement.style;
    s.setProperty('--brand', p);
    s.setProperty('--on-brand', on(p));
    s.setProperty('--brand-text', readable(p));
    s.setProperty('--brand-hover', toward(p, 0, .16));
    s.setProperty('--pop', a);
    s.setProperty('--on-pop', on(a));
    s.setProperty('--pop-text', readable(a));
  };
  try {
    var raw = localStorage.getItem(KEY);
    window.__applyBrandTheme(raw ? JSON.parse(raw) : FALLBACK);
  } catch (e) {
    window.__applyBrandTheme(FALLBACK);
  }
})();`;
