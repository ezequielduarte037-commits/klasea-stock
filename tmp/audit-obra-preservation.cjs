const fs = require('node:fs');
const assert = require('node:assert/strict');
const { parse } = require('@babel/parser');
const before = parse(fs.readFileSync('tmp/obra-materiales-before-ui.jsx','utf8'), { sourceType:'module', plugins:['jsx'] }).program;
const after = parse(fs.readFileSync('src/features/materiales/MaterialesScreen.jsx','utf8'), { sourceType:'module', plugins:['jsx'] }).program;
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) if (!['start','end','loc','extra','leadingComments','trailingComments','innerComments','comments'].includes(key)) result[key] = clean(item);
  // Local color substitutions are presentation, not a business change.
  if (result.type === 'MemberExpression' && result.object?.name === 'C' && /^amber/.test(result.property?.name || '')) result.property.name = result.property.name.replace('amber','violet');
  return result;
}
const getView = (program) => program.body.find((node) => node.type==='FunctionDeclaration' && node.id.name==='ObraMatrizView');
const oldView = getView(before), newView=getView(after);
const oldFunctions=oldView.body.body.filter(n=>n.type==='FunctionDeclaration' && n.id.name!=='toggleSelected');
for(const fn of oldFunctions) {
  const current=newView.body.body.find(n=>n.type==='FunctionDeclaration' && n.id.name===fn.id.name);
  assert(current,`Missing action ${fn.id.name}`);
  assert.deepEqual(clean(current),clean(fn),`Changed action ${fn.id.name}`);
}
const derived=['baseRows','liveRows','addonRows','obraRows','snapshotRows','rows','visibleRows','groupedRows','kpis','orderRows','snapshotNecesitaSync'];
const variable=(fn,name)=>fn.body.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations).find(n=>n.id.name===name);
for(const name of derived) assert.deepEqual(clean(variable(newView,name)),clean(variable(oldView,name)),`Changed computation ${name}`);
const helpers=['estadoObraForRow','normalizarEstadoObra','cantidadesDeFila','snapshotLockReason','mergeMatrixAndSnapshotRows','snapshotRowToView','addonRowToView'];
for(const name of helpers) assert.deepEqual(clean(after.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name)),clean(before.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name)),`Changed helper ${name}`);
console.log(JSON.stringify({preservedActions:oldFunctions.map(n=>n.id.name),preservedComputations:derived,preservedHelpers:helpers},null,2));
