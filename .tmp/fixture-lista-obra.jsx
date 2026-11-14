import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import MaterialesScreen from '../src/features/materiales/MaterialesScreen.jsx';
import '../src/theme.css';
import '../src/theme/palette.css';
window.__rows = ['Aro de prueba', 'Bomba de prueba', 'Cable de prueba'].map((descripcion,i) => ({ id:`item-${i}`, descripcion, cantidad:1, unidad:'unidad', estado:'pendiente', tipo:'base' }));
createRoot(document.getElementById('root')).render(<BrowserRouter><Routes>
  <Route path="/inicio-prueba" element={<Link to="/materiales"><button>Materiales</button></Link>} />
  <Route path="/materiales" element={<MaterialesScreen profile={{role:'tecnica'}} />} />
</Routes></BrowserRouter>);
