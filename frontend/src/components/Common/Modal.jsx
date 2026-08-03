// frontend/src/components/Common/Modal.jsx
import React, { useEffect, useCallback, useRef } from 'react';
import { X, Maximize2, Minimize2 } from 'lucide-react';

const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    size = 'medium',
    showCloseButton = true,
    closeOnOverlayClick = true,
    closeOnEsc = true,
    showMaximize = false,
    className = '',
    actions = null,
    onAfterOpen = null,
    onAfterClose = null
}) => {
    const [isMaximized, setIsMaximized] = React.useState(false);
    const modalRef = useRef(null);
    const overlayRef = useRef(null);

    const sizeClasses = {
        small: 'max-w-md',
        medium: 'max-w-lg',
        large: 'max-w-2xl',
        xlarge: 'max-w-5xl',
        full: 'max-w-[95vw]'
    };

    useEffect(() => {
        const handleEsc = (e) => {
            if (closeOnEsc && e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose, closeOnEsc]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            if (onAfterOpen) onAfterOpen();
        } else {
            document.body.style.overflow = 'unset';
            if (onAfterClose) onAfterClose();
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen, onAfterOpen, onAfterClose]);

    const handleOverlayClick = useCallback((e) => {
        if (closeOnOverlayClick && e.target === overlayRef.current) onClose();
    }, [closeOnOverlayClick, onClose]);

    if (!isOpen) return null;

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z- flex items-center justify-center p-4 bg-[#020617]/80 backdrop-blur-md transition-all duration-300"
            onClick={handleOverlayClick}
        >
            <div
                ref={modalRef}
                className={`
                    bg-slate-900 border border-slate-800 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] 
                    transform transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                    ${isMaximized ? 'w-full h-full rounded-none' : `${sizeClasses[size]} rounded-[2rem]`}
                    ${className}
                    animate-modal-entrance
                `}
                style={{
                    maxHeight: isMaximized ? '100%' : '90vh',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {/* Header */}
                <div className="flex justify-between items-center px-8 py-6 border-b border-slate-800/50">
                    <div>
                        <h3 className="text-xl font-black text-white tracking-tight italic">
                            {title}
                        </h3>
                        <div className="h-1 w-8 bg-blue-600 rounded-full mt-1"></div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {showMaximize && (
                            <button
                                onClick={() => setIsMaximized(!isMaximized)}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                            >
                                {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                            </button>
                        )}
                        {showCloseButton && (
                            <button
                                onClick={onClose}
                                className="p-2 text-slate-400 hover:text-white hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-all"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-8 text-slate-300 custom-scrollbar">
                    {children}
                </div>

                {/* Footer */}
                {actions && (
                    <div className="flex justify-end items-center gap-3 px-8 py-6 bg-slate-950/50 border-t border-slate-800/50 rounded-b-[2rem]">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
};

// Update ConfirmModal for Dark Theme
export const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', confirmVariant = 'danger' }) => {
    const variants = {
        danger: 'bg-red-500 hover:bg-red-600 shadow-red-500/20',
        primary: 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20',
        success: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="small">
            <div className="space-y-6">
                <p className="text-slate-400 leading-relaxed text-center">{message}</p>
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={onClose} className="py-3 px-4 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all">
                        {cancelText}
                    </button>
                    <button 
                        onClick={() => { onConfirm(); onClose(); }} 
                        className={`py-3 px-4 text-white font-bold rounded-2xl shadow-lg transition-all ${variants[confirmVariant]}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

// Add Animation & Scrollbar Styles
const styles = `
@keyframes modalEntrance {
    from { opacity: 0; transform: scale(0.9) translateY(30px); filter: blur(10px); }
    to { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
}
.animate-modal-entrance { animation: modalEntrance 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
`;

if (typeof document !== 'undefined') {
    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
}

export default Modal;