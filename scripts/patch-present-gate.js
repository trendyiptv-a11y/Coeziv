const fs = require('fs');
const file = 'api/analyze.js';
let code = fs.readFileSync(file, 'utf8');
const start = code.indexOf('function presentRealityGate(');
const end = code.indexOf('function safeCalc', start);
if (start < 0) throw new Error('presentRealityGate not found');
if (end < 0) throw new Error('safeCalc not found after presentRealityGate');
const gate = String.raw`function presentRealityGate(text=""){
const t=nodia(text),raw=String(text||"");
const signals=[];const add=x=>{if(!signals.includes(x))signals.push(x)};
const explicit=/\b(actual|actuala|actuală|actualul|curent|curenta|curentă|prezent|prezenta|prezentă|azi|acum|recent|recente|ultim|ultima|ultimul|latest|current|incumbent|today|now|present|in force|în vigoare|in vigoare)\b/.test(t);
const office=/\b(președinte|presedinte|președintele|presedintele|președintelui|presedintelui|president|presidentul|prim[- ]?ministru|prim[- ]?ministrul|prim[- ]?ministrului|premier|premierul|premierului|ministru|ministrul|ministrului|guvernator|guvernatorul|governor|primar|primarul|mayor|ceo|ceo-ul|director|directorul|directorului|chairman|chairwoman|titular|titularul|titularului|lider|liderul|liderului|șef|sef|șeful|seful|șefului|sefului|conducător|conducator|conducătorul|conducatorul)\b/.test(t);
const market=/\b(preț|pret|prețul|pretul|price|cotație|cotatie|cotația|cotatia|exchange rate|rata de schimb|curs valutar|dobândă|dobanda|dobânda|inflație|inflatie|inflația|inflatia|market cap|capitalizare|valoare actuală|valoare actuala|valoare curentă|valoare curenta|btc|bitcoin|eur|usd|dkk)\b/.test(t);
const law=/\b(lege|legea|law|regulation|regulament|normă|norma|standard|ordin|ordonanță|ordonanta|directivă|directiva|directive|act normativ)\b/.test(t)&&/\b(vigoare|actual|actuală|actuala|curent|curentă|curenta|aplicabil|aplicabilă|aplicabila|se aplică|se aplica|valid|valabil|valabilă|valabila|in force|current)\b/.test(t);
const tech=/\b(versiune|versiunea|version|release|build|api|sdk|library|bibliotecă|biblioteca|framework|standard tehnic|firmware|software)\b/.test(t)&&/\b(actual|actuală|actuala|curent|curentă|curenta|latest|current|nou|nouă|noua|ultima|ultimul|stable|release)\b/.test(t);
const product=/\b(disponibil|disponibilă|disponibila|disponibilitate|în stoc|in stoc|se mai vinde|available|availability|in stock|out of stock|sold out|preț produs|pret produs|ofertă|oferta|livrare|delivery)\b/.test(t);
const sport=/\b(scor|scorul|rezultat|rezultatul|clasament|clasamentul|standings|score|fixture|meci|meciul|a câștigat|a castigat|won|last match|ultimul meci|următorul meci|urmatorul meci)\b/.test(t);
const event=/\b(alegeri|election|conflict|armistițiu|armistitiu|pace|acord|deal|negociere|negocieri|breaking|news|știre|stire|ultima oră|ultima ora|eveniment recent|criză|criza|a demisionat|demisie|numire|nominalizare|appointed|nominated|resigned)\b/.test(t);
if(explicit)add('explicit_present');if(office)add('current_office_or_role');if(market)add('current_market_value');if(law)add('current_law_or_standard');if(tech)add('current_version_or_standard');if(product)add('current_product_availability');if(sport)add('current_sports_result');if(event)add('current_event_status');
const active=signals.length>0;
let relation_type='stable_or_slow_relation';
if(office)relation_type='current_office_holder';else if(market)relation_type='current_market_value';else if(law)relation_type='current_normative_status';else if(tech)relation_type='current_version_or_standard';else if(product)relation_type='current_product_availability';else if(sport)relation_type='current_sports_result';else if(event)relation_type='current_event_status';else if(explicit)relation_type='present_dependent_relation';
const q=[];
if(active){q.push(`${raw} current official source`,`${raw} latest official`,`${raw} Reuters OR AP current`,`${raw} today current`,`${raw} official statement`);if(relation_type==='current_office_holder')q.push(`${raw} incumbent official`,`${raw} current office holder`,`${raw} official biography current`,`${raw} government official current`,`${raw} Reuters current`,`${raw} AP News current`);if(relation_type==='current_market_value')q.push(`${raw} live price official`,`${raw} current price market data`,`${raw} latest price`);if(relation_type==='current_normative_status')q.push(`${raw} in force official`,`${raw} consolidated law current official`);if(relation_type==='current_version_or_standard')q.push(`${raw} current version official docs`,`${raw} latest release official`);if(relation_type==='current_product_availability')q.push(`${raw} availability official store`,`${raw} in stock current`);if(relation_type==='current_sports_result')q.push(`${raw} latest score official`,`${raw} current standings official`);if(relation_type==='current_event_status')q.push(`${raw} latest Reuters`,`${raw} latest AP News`,`${raw} official statement latest`)}
return{active,stability:active?'unstable_present':'stable_or_slow',relation_type,signals,require_current_source:active,require_official_or_recent:active,require_date_check:active,require_relation_now:active,memory_allowed:!active,queries:q,reason:active?'Afirmația depinde de prezent; memoria modelului este blocată ca dovadă decisivă, se cer surse actuale/oficiale.':'Afirmația nu pare dependentă critic de prezent.'}
}`;
code = code.slice(0, start) + gate + '\n' + code.slice(end);
fs.writeFileSync(file, code, 'utf8');
console.log('OK: presentRealityGate replaced.');
