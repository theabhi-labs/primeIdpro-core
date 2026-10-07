import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { CreditProvider } from './context/CreditContext';

// Global security guards: block context menu (Inspect) and DevTools shortcuts
if (typeof window !== 'undefined') {
    // Disable right-click context menu
    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    // Disable DevTools shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U)
    window.addEventListener('keydown', (e) => {
        const key = e.key ? e.key.toUpperCase() : '';
        if (
            key === 'F12' ||
            ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'J', 'C'].includes(key)) ||
            ((e.ctrlKey || e.metaKey) && key === 'U')
        ) {
            e.preventDefault();
        }
    });
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter
            future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
            }}
        >
            <CreditProvider>
                <App />
            </CreditProvider>
        </BrowserRouter>
    </React.StrictMode>
);