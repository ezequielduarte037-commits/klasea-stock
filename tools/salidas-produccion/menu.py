"""Menú para usar el programa sin escribir comandos. Lo abre el acceso directo del escritorio."""
import os

import salidas

MENU = """
  SALIDAS DE PRODUCCIÓN - prueba de reconocimiento facial
  -------------------------------------------------------

  1. Registrar a un empleado (se elige de RRHH)
  2. Reconocer con la cámara de la notebook
  3. Ver el informe de tiempo fuera
  4. Revisar pasos sin identificar
  5. Ver personas registradas
  6. Borrar una persona
  7. Vincular con RRHH a los registrados sin DNI
  8. Traer empleados y fichadas de KlaseA
  0. Salir
"""


def correr(*args):
    try:
        salidas.main(list(args))
    except SystemExit as e:
        if e.code not in (None, 0):
            print(f"\n  {e.code}")
    except KeyboardInterrupt:
        print("\n  Cancelado.")
    except Exception as e:  # que un error no cierre la ventana sin que se lea
        print(f"\n  Error: {e}")


def pedir(texto):
    return input(f"  {texto}").replace("﻿", "").strip()


def main():
    os.system("title Salidas de produccion")
    while True:
        os.system("cls")
        print(MENU)
        opcion = pedir("Elegí una opción: ")
        print()
        if opcion == "0":
            return
        if opcion == "1":
            busqueda = pedir("Buscá por nombre o DNI: ")
            if not busqueda:
                continue
            correr("registrar", busqueda)
        elif opcion == "2":
            print("  En la ventana de la cámara:  S = salida   E = entrada   Q = terminar\n")
            correr("reconocer")
        elif opcion == "3":
            correr("informe")
        elif opcion == "4":
            correr("revisar")
        elif opcion == "5":
            correr("personas")
        elif opcion == "6":
            correr("personas")
            quien = pedir("\n  DNI o nombre a borrar (Enter para volver): ")
            if not quien:
                continue
            correr("borrar", quien)
        elif opcion == "7":
            correr("vincular")
        elif opcion == "8":
            correr("sincronizar")
        else:
            continue
        pedir("\nEnter para volver al menú...")


if __name__ == "__main__":
    try:
        main()
    except (EOFError, KeyboardInterrupt):
        pass
