'use strict';

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function previewMetadata(posts) {
  return posts.map((post) => [
    String(post?.id ?? ''),
    String(post?.title ?? ''),
    String(post?.date ?? ''),
    Array.isArray(post?.tags) ? post.tags.map((tag) => String(tag)) : [],
    String(post?.summary ?? ''),
  ]);
}

function renderSearchPreviewBundle(posts) {
  const metadata = safeJson(previewMetadata(Array.isArray(posts) ? posts : []));
  const runtime = '(function(w,d,l,P){"use strict";function S(r,q){w.SearchPreviewState={kind:"generated-metadata-preview",preview:false,query:q||"",reason:r}}function Q(){var s=String(l&&l.search||"").replace(/^\\?/,"").split("&");for(var i=0;i<s.length;i++){var x=s[i].indexOf("="),a=x<0?s[i]:s[i].slice(0,x),b=x<0?"":s[i].slice(x+1),n;try{n=decodeURIComponent(a.replace(/\\+/g," "))}catch(e){continue}if(n!=="q")continue;try{return{query:decodeURIComponent(b.replace(/\\+/g," ")).trim()}}catch(e){return{malformed:true,query:""}}}return{query:""}}function N(v){return String(v==null?"":v).normalize("NFKC").toLowerCase().replace(/\\s+/g," ").trim()}function F(v,t,p,w){var n=N(v),s=0;for(var i=0;i<t.length;i++)if(n.indexOf(t[i])!==-1)s+=w;if(p&&n.indexOf(p)!==-1)s+=12;return s}function E(n,c,t){var e=d.createElement(n);if(c)e.className=c;if(t!==undefined)e.textContent=t==null?"":String(t);return e}function C(p){var a=E("article","post-card glass-surface"),h=E("h3"),u=E("a","",p[1]);u.setAttribute("href","posts/"+encodeURIComponent(p[0])+".html");h.appendChild(u);a.appendChild(h);var m=E("div","post-meta");m.appendChild(E("span","",p[2]));for(var i=0;i<p[3].length;i++){var g=E("a","tag",p[3][i]);g.setAttribute("href","tags.html?tag="+encodeURIComponent(p[3][i]));m.appendChild(g)}a.appendChild(m);a.appendChild(E("p","post-summary",p[4]));a.setAttribute("data-search-id",p[0]);return a}var q=Q();if(q.malformed){S("malformed-query");return}if(!q.query){S("empty-query");return}var r=d.getElementById("search-results");if(!r){S("missing-results",q.query);return}var phrase=N(q.query),terms=phrase?phrase.split(" ").filter(function(v,i,a){return a.indexOf(v)===i}):[];var matches=P.map(function(p){return{post:p,score:F(p[1],terms,phrase,16)+F(p[3].join(" "),terms,phrase,10)+F(p[4],terms,phrase,5)}}).filter(function(v){return v.score>0}).sort(function(a,b){return b.score-a.score||(a.post[2]<b.post[2]?1:a.post[2]>b.post[2]?-1:a.post[0]<b.post[0]?-1:a.post[0]>b.post[0]?1:0)});r.textContent="";for(var i=0;i<matches.length;i++)r.appendChild(C(matches[i].post));r.setAttribute("data-search-preview","true");r.setAttribute("data-search-active","true");r.setAttribute("data-search-query",q.query);r.setAttribute("aria-busy","true");w.SearchPreviewState={kind:"generated-metadata-preview",preview:true,query:q.query,resultIds:matches.map(function(v){return v.post[0]}),fingerprint:JSON.stringify(matches.map(function(v){return v.post})),results:r}})(window,document,location,' + metadata + ');';
  return '// Auto-generated Search metadata preview.\n' + runtime + '\n';
}

module.exports = { renderSearchPreviewBundle };
