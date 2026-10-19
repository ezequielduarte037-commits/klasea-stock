import test from 'node:test';
import assert from 'node:assert/strict';
import {materialMatchScore,materialMatchIsStrong,topMaterialMatches} from './materialMatch.js';

test('el parlante de 7.7 no se vincula automáticamente al de 6.5 por parecido de texto',()=>{
 const anterior={descripcion:'PARLANTE FUSION 6.5" XS-FL65SPGW'};
 const ingreso={descripcion:'PARLANTE FUSION XS-FL77SPGW 7.7 inch 240'};
 assert.equal(materialMatchIsStrong(materialMatchScore(anterior,ingreso)),false);
});
test('un código repetido no aprueba un modelo o color distinto',()=>{
 const anterior={codigo:'010-02583-00',descripcion:'PARLANTE DE TORRE FUSION 6.5 XS-FLT652SPW'};
 const ingreso={codigo:'010-02583-00',descripcion:'PARLANTE DE TORRE FUSION XS-FLT652SPB 6.5 inch 200'};
 assert.equal(materialMatchIsStrong(materialMatchScore(anterior,ingreso)),false);
 assert.equal(topMaterialMatches([anterior],ingreso).length,1);
});
test('modelos y códigos que coinciden siguen vinculándose automáticamente',()=>{
 const m={codigo:'RULE800',descripcion:'BOMBA RULE 800 GPH'};
 assert.equal(materialMatchIsStrong(materialMatchScore(m,{descripcion:m.descripcion,codigo:m.codigo})),true);
 const parlante={descripcion:'PARLANTE FUSION XS-FL77SPGW 7.7"'};
 assert.equal(materialMatchIsStrong(materialMatchScore(parlante,{descripcion:'PARLANTE FUSION XS-FL77SPGW 7.7 inch 240'})),true);
});
