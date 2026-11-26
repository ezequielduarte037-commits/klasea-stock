import test from "node:test";
import assert from "node:assert/strict";
import { linkDeCompra, notaParaCompras, renglonParaCompras } from "./pedidoCompras.js";

// Notas reales que llegaron a Compras desde las listas (sep-nov 2026).
test("saca lo que arma el sistema y deja lo que escribió una persona", () => {
  assert.equal(notaParaCompras({ obs: "Creado desde variante legacy de TAPA DE INSPECCIÓN RECTANGULAR" }), null);
  assert.equal(notaParaCompras({ obs: "Adicional · Fue adicional de 55-2." }), null);
  assert.equal(notaParaCompras({ obs: "Adicional · Opcional heladera fly k55\nFue adicional de 55-2." }), "Opcional heladera fly k55");
  assert.equal(notaParaCompras({ obs: "4 popa, 2 laterales" }), "4 popa, 2 laterales");
  assert.equal(notaParaCompras({ obs: "Brujula - Brujula - Pedido original: Compas magnetico Ritchie S-53 (negro)" }), "Brujula");
  assert.equal(
    notaParaCompras({ obs: "K55 utiliza 30mts2, 40un de 122x61mm - K55 utiliza 30mts2, 40un de 122x61mm - Pedido original: PLACAS" }),
    "K55 utiliza 30mts2, 40un de 122x61mm",
  );
});

test("el condicionante y el requisito no viajan, las especificaciones sí", () => {
  const row = { condicionantes: [{ condicionante: "Griferia Negra" }], obs: "Condicionante · Griferia Negra - Accesorio 1 de 3 para completar ducha en NEGRO MATE" };
  assert.equal(notaParaCompras(row), "Accesorio 1 de 3 para completar ducha en NEGRO MATE");
  assert.equal(notaParaCompras({ condicionantes: [{ condicionante: "Motores" }], obs: "Motores: Sustituye Flap Bennett" }), null);
  assert.equal(
    notaParaCompras({ obs: "Requisito de matriz: Aire acondicionado 16000 BTU · Requisito: Aire acondicionado 16000 BTU · Frio calor platinum, con control" }),
    "Frio calor platinum, con control",
  );
});

test("no repite el código ni el proveedor que ya van en el renglón", () => {
  assert.equal(notaParaCompras({ codigo: "C89099", obs: "C89099" }), null);
  assert.equal(notaParaCompras({ proveedor: "Foresti Suardi", obs: "FORESTI SUARDI\nFORESTI SUARDI" }), null);
});

test("el link del producto llega con su nota; los planos no cuentan como link", () => {
  const row = {
    descripcion: "Protector Térmico 15A tipo pulsador",
    codigo: "",
    material: { links: [
      { kind: "documento", url: "https://x.supabase.co/plano.pdf" },
      { label: "ML", url: "https://www.mercadolibre.com.ar/protector", nota: "El link es pack x10" },
    ], imagen_url: "https://x.supabase.co/foto.jpg" },
    obs: "",
  };
  assert.deepEqual(renglonParaCompras(row), {
    link_url: "https://www.mercadolibre.com.ar/protector",
    image_url: "https://x.supabase.co/foto.jpg",
    supplier_code: null,
    notes: "El link es pack x10",
  });
  assert.equal(linkDeCompra({ material: { links: [{ kind: "documento", url: "https://x/plano.pdf" }] } }), null);
});

test("el producto elegido manda sobre el requisito y el código del producto viaja", () => {
  const row = {
    codigo: "C42377",
    producto: { links: [{ url: "https://www.baron.com.ar/articulo/c42377" }] },
    material: { links: [{ url: "https://otro.com/requisito" }] },
  };
  const r = renglonParaCompras(row);
  assert.equal(r.link_url, "https://www.baron.com.ar/articulo/c42377");
  assert.equal(r.supplier_code, "C42377");
  assert.equal(renglonParaCompras({ supplierCode: "BAR-1", codigo: "C1" }).supplier_code, "BAR-1");
});

test("con proveedores alternativos le avisa a Compras que elija", () => {
  assert.equal(
    renglonParaCompras({ proveedor: "Baron / Flojumar", obs: "" }, { proveedorAlternativo: true }).notes,
    "Proveedores posibles: Baron / Flojumar. Compras debe elegir uno.",
  );
});

test("lo del pañol y de la lista estándar tampoco viaja", () => {
  assert.equal(notaParaCompras({ obs: "Lista estándar K55 · obra 55-4." }), null);
  assert.equal(notaParaCompras({ obs: "Adicional · Fue adicional de 52-24. - Recepción por remito: 1 unidad" }), null);
  assert.equal(notaParaCompras({ obs: "Condicionante · Vajillas" }), null);
  assert.equal(notaParaCompras({ obs: "Condicionante · Elementos de baño NEGRO - Griferia 2 baños · Creado desde variante legacy de Toallero" }), "Griferia 2 baños");
});
