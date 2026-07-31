import { useEffect, useRef, useState } from "react";
import {
  ExternalLink, FileText, Loader2, Paperclip, Trash2, Upload,
} from "lucide-react";
import { C } from "@/theme";
import {
  eliminarPlantillaTareaArchivo,
  fetchPlantillaTareaArchivos,
  subirPlantillaTareaArchivos,
} from "./tareaArchivosApi";

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extension(name) {
  const parts = String(name || "").split(".");
  return parts.length > 1 ? parts.pop().toUpperCase().slice(0, 7) : "ARCH";
}

export default function TareaArchivosPanel({ tarea, onChanged }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function load() {
    if (!tarea?.id) return;
    setLoading(true);
    setError("");
    try {
      const rows = await fetchPlantillaTareaArchivos(tarea.id);
      setFiles(rows);
    } catch (loadError) {
      setError(loadError.message || "No se pudieron cargar los archivos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetchPlantillaTareaArchivos(tarea?.id)
      .then((rows) => {
        if (!active) return;
        setFiles(rows);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "No se pudieron cargar los archivos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [tarea?.id]);

  async function upload(selected) {
    const next = Array.from(selected || []).filter(Boolean);
    if (!next.length || uploading) return;
    setUploading(true);
    setError("");
    try {
      await subirPlantillaTareaArchivos(tarea.id, next);
      await load();
      onChanged?.();
    } catch (uploadError) {
      setError(uploadError.message || "No se pudieron subir los archivos.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(file) {
    if (!window.confirm(`¿Quitar “${file.nombre_archivo}” de esta tarea?`)) return;
    setError("");
    try {
      await eliminarPlantillaTareaArchivo(file);
      const next = files.filter((row) => row.id !== file.id);
      setFiles(next);
      onChanged?.();
    } catch (deleteError) {
      setError(deleteError.message || "No se pudo eliminar el archivo.");
    }
  }

  return (
    <div style={{
      marginTop: 8,
      overflow: "hidden",
      border: `1px solid ${C.b0}`,
      borderRadius: 9,
      background: C.s0,
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "9px 10px",
        borderBottom: files.length || loading || error ? `1px solid ${C.b0}` : 0,
        flexWrap: "wrap",
      }}>
        <span style={{
          width: 28,
          height: 28,
          display: "grid",
          placeItems: "center",
          border: `1px solid ${C.blueB}`,
          borderRadius: 8,
          background: C.blueL,
          color: C.blue,
        }}>
          <Paperclip size={13} />
        </span>
        <div style={{ flex: 1, minWidth: 170 }}>
          <div style={{ color: C.t0, fontSize: 11.5, fontWeight: 850 }}>Planos y archivos de la tarea</div>
          <div style={{ marginTop: 2, color: C.t2, fontSize: 9.5 }}>Quedan disponibles para todas las obras de esta línea.</div>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            minHeight: 30,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 9px",
            border: `1px solid ${C.blueB}`,
            borderRadius: 7,
            background: C.blueL,
            color: C.blue,
            cursor: uploading ? "wait" : "pointer",
            fontFamily: C.sans,
            fontSize: 10.5,
            fontWeight: 850,
          }}
        >
          {uploading ? <Loader2 size={12} className="spin" /> : <Upload size={12} />}
          {uploading ? "Subiendo…" : "Adjuntar"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(event) => {
            upload(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <div
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          upload(event.dataTransfer.files);
        }}
        style={{
          minHeight: files.length ? 0 : 52,
          padding: files.length ? 0 : 10,
          background: dragging ? C.blueL : "transparent",
          transition: "background .14s ease",
        }}
      >
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, minHeight: 44, color: C.t2, fontSize: 10.5 }}>
            <Loader2 size={12} className="spin" /> Cargando archivos…
          </div>
        ) : !files.length ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              width: "100%",
              minHeight: 42,
              border: `1px dashed ${dragging ? C.blue : C.b1}`,
              borderRadius: 7,
              background: "transparent",
              color: dragging ? C.blue : C.t2,
              cursor: "pointer",
              fontFamily: C.sans,
              fontSize: 10.5,
            }}
          >
            Arrastrá acá PDF, DXF, DWG, imágenes, Office, ZIP o cualquier archivo técnico
          </button>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              style={{
                display: "grid",
                gridTemplateColumns: "30px minmax(0,1fr) auto",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderBottom: `1px solid ${C.b0}`,
              }}
            >
              <span style={{ width: 29, height: 29, display: "grid", placeItems: "center", borderRadius: 7, background: C.s1, color: C.t2 }}>
                <FileText size={13} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ overflow: "hidden", color: C.t0, fontSize: 11, fontWeight: 750, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.nombre_archivo}</div>
                <div style={{ marginTop: 2, color: C.t3, fontFamily: C.mono, fontSize: 9 }}>{[extension(file.nombre_archivo), formatBytes(file.tamano_bytes)].filter(Boolean).join(" · ")}</div>
              </div>
              <div style={{ display: "flex", gap: 3 }}>
                <a
                  href={file.url_publica}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Abrir ${file.nombre_archivo}`}
                  title="Abrir archivo"
                  style={{ width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: 7, color: C.blue }}
                >
                  <ExternalLink size={12} />
                </a>
                <button
                  type="button"
                  onClick={() => remove(file)}
                  title="Quitar archivo"
                  style={{ width: 28, height: 28, display: "grid", placeItems: "center", border: 0, borderRadius: 7, background: "transparent", color: C.red, cursor: "pointer" }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {error && (
        <div style={{ padding: "7px 10px", borderTop: `1px solid ${C.redB}`, background: C.redL, color: C.red, fontSize: 10 }}>
          {error}
        </div>
      )}
    </div>
  );
}
