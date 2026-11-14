import useRafagaLector from "./useRafagaLector";

/**
 * Campo de texto del mostrador. Es un `ui-input` común con una diferencia: si
 * el lector de códigos escribe adentro (porque el foco quedó acá), la ráfaga se
 * saca del campo y se manda a `onRafaga` como un escaneo más.
 */
export default function CampoTexto({ value, onChange, onRafaga, onEnter, className = "", inputRef, ...rest }) {
  const lector = useRafagaLector({
    onRafaga: onRafaga
      ? (codigo, previo) => {
        onChange?.(previo);
        onRafaga(codigo);
      }
      : undefined,
    onEnter,
  });
  return (
    <input
      ref={inputRef}
      className={`ui-input ${className}`.trim()}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      onKeyDown={lector.onKeyDown}
      onPaste={lector.onPaste}
      autoComplete="off"
      spellCheck={false}
      {...rest}
    />
  );
}
