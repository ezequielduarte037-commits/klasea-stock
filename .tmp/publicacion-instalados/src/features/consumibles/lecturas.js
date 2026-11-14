/** Las lecturas tienen plazo; una red colgada debe ofrecer reintento. Nunca usar para decidir si una escritura se grabó. */
export async function conPlazoLectura(promesa, ms = 12000) {
  let reloj;
  try {
    return await Promise.race([
      promesa,
      new Promise((_, rechazar) => {
        reloj = setTimeout(() => rechazar(new Error("La consulta tardó demasiado. Revisá la conexión y probá de nuevo.")), ms);
      }),
    ]);
  } finally {
    clearTimeout(reloj);
  }
}
