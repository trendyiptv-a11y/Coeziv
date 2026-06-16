import fs from 'fs';

const file = 'api/analyze.js';
let code = fs.readFileSync(file, 'utf8');
const needle = 'if(pg.active&&pg.relation_type==="current_office_holder"){';
if (!code.includes(needle)) throw new Error('target block not found');
const marker = '/* PRESENT_VALUE_INCOMPLETE_GUARD */';
if (!code.includes(marker)) {
  const guard = marker + 'if(pg.active&&pg.relation_type==="current_market_value"){out.relation_type="current_market_value";out.relation_object_claimed=(text.match(/(\\d[\\d.,]*\\s*(usd|eur|dkk|ron|lei|\\$|€))/i)||[])[0]||null;out.two_pi_state="incomplete";out.truth_consumption_mode="incomplete";out.relation_object_found=null;out.evidence_title=null;out.evidence_url=null;return out}';
  code = code.replace(needle, guard + needle);
}
fs.writeFileSync(file, code, 'utf8');
console.log('OK: current_market_value closure is incomplete unless a dedicated live-value resolver is added.');
