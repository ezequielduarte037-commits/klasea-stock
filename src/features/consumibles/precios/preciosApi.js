import { supabase } from "@/supabaseClient";
import { guardarConfig } from "@/features/consumibles/api";
import { crearPreciosRepositorio } from "./preciosRepositorio.js";

export const preciosApi = crearPreciosRepositorio(supabase, (materialId) => guardarConfig(materialId));
