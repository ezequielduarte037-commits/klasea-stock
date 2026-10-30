import { supabase } from '@/supabaseClient';
import { uploadPurchaseRequestAttachments } from '@/features/compras/purchaseRequestsApi';
import { documentToMaterialLink, normalizeMaterialDocuments } from './productDocuments';

export async function saveMaterialDocumentLinks(materialId, before, links) {
  const { data, error } = await supabase.from('panol_materiales').update({ links })
    .eq('id', materialId).eq('links', JSON.stringify(before || [])).select('id,links').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('El producto cambió mientras lo editabas. Actualizá y volvé a intentar.');
  return data.links || [];
}

export async function uploadMaterialDocuments(materialId, files, linea = null) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Iniciá sesión para adjuntar planos.');
  const { data, error } = await supabase.from('panol_materiales').select('links').eq('id', materialId).single();
  if (error) throw error;
  const uploaded = await uploadPurchaseRequestAttachments(files, user.id, `products/${materialId}`);
  return saveMaterialDocumentLinks(materialId, data.links, [...(data.links || []), ...uploaded.map(file => documentToMaterialLink(file, linea))]);
}

export async function fetchProductDocuments(materialIds, linea = null) {
  const ids = [...new Set(materialIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from('panol_materiales').select('id,links').in('id', ids);
  if (error) throw error;
  return new Map((data || []).map(material => [material.id, normalizeMaterialDocuments(material.links, linea)]));
}
