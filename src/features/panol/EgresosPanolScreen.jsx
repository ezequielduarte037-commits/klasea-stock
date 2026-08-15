import StockPanolScreen from "@/features/panol/StockPanolScreen";

// El egreso operativo reutiliza exactamente el workspace y los guardados del
// stock. Esta pantalla sólo le da una ruta y una identidad propias; la pantalla
// del lado de quien retira sigue siendo /pantalla-egreso.
export default function EgresosPanolScreen(props) {
  return (
    <StockPanolScreen
      {...props}
      mode="egreso"
      screenTitle="Egreso de materiales"
      screenSubtitle="Seleccioná el stock, identificá a quien retira y confirmá la salida"
    />
  );
}
