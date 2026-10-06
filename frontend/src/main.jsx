import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { CreditProvider } from './context/CreditContext';

// Global security guards: block context menu (Inspect), DevTools shortcuts, and clear clipboard on screenshot attempts
if (typeof window !== 'undefined') {
    // Disable right-click context menu
    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    // Disable F12, Ctrl+Shift+I/J/C, Ctrl+U, PrintScreen
    window.addEventListener('keydown', (e) => {
        const key = e.key ? e.key.toUpperCase() : '';
        if (
            key === 'F12' ||
            ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'J', 'C'].includes(key)) ||
            ((e.ctrlKey || e.metaKey) && key === 'U') ||
            key === 'PRINTSCREEN'
        ) {
            e.preventDefault();
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText('').catch(() => {});
            }
        }
    });

    // Clear clipboard on screenshot key release
    window.addEventListener('keyup', (e) => {
        const key = e.key ? e.key.toUpperCase() : '';
        if (key === 'PRINTSCREEN' || key === 'SNAPSHOT') {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText('').catch(() => {});
            }
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