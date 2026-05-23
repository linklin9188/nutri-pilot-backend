import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/admin.css';

// admin app is mounted at /admin/ by the server. BrowserRouter basename
// makes <Link to="/login"> resolve to /admin/login etc.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/admin">
      <App />
    </BrowserRouter>
  </StrictMode>,
);
