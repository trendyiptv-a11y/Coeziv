import fs from 'fs';

const file = 'api/analyze.js';
let code = fs.readFileSync(file, 'utf8');

const closureNeedle = 'if(pg.active&&pg.relation_type==="current_office_holder"){';
if (!code.includes(closureNeedle)) throw new Error('target block not found');
const closureMarker = '/* PRESENT_VALUE_INCOMPLETE_GUARD */';
if (!code.includes(closureMarker)) {
  const guard = closureMarker + 'if(pg.active&&pg.relation_type==="current_market_value"){out.relation_type="current_market_value";out.relation_object_claimed=(text.match(/(\\d[\\d.,]*\\s*(usd|eur|dkk|ron|lei|\\$|€))/i)||[])[0]||null;out.two_pi_state="incomplete";out.truth_consumption_mode="incomplete";out.relation_object_found=null;out.evidence_title=null;out.evidence_url=null;return out}';
  code = code.replace(closureNeedle, guard + closureNeedle);
}

const classifyNeedle = 'let role="context_only",confidence=.28,reason="sursă de context";if(pg.active&&!currentOK){';
const classifyPatch = 'let role="context_only",confidence=.28,reason="sursă de context";if(pg.active&&pg.relation_type==="current_market_value"&&dr==="support_reference"){role="context_only";confidence=.2;reason="știre sau referință de context; nu este valoare live de piață"}else if(pg.active&&!currentOK){';
if (code.includes(classifyNeedle)) {
  code = code.replace(classifyNeedle, classifyPatch);
}

fs.writeFileSync(file, code, 'utf8');
console.log('OK: current_market_value closure and source classification rectified.');
