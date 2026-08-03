

// frontend/src/components/Common/Toast.jsx
import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const Toast = ({ message, type = 'success', onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const icons = {
        success: <CheckCircle className="w-5 h-5 text-green-500" />,
        error: <AlertCircle className="w-5 h-5 text-red-500" />,
        info: <Info className="w-5 h-5 text-blue-500" />
    };

    const bgColors = {
        success: 'bg-green-50 border-green-200',
        error: 'bg-red-50 border-red-200',
        info: 'bg-blue-50 border-blue-200'
    };

    return (
        <div className={`fixed bottom-4 right-4 z-50 flex items-center space-x-3 px-4 py-3 rounded-lg border shadow-lg ${bgColors[type]}`}>
            {icons[type]}
            <span className="text-sm text-gray-700">{message}</span>
            <button onClick={onClose} className="ml-4">
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
            </button>
        </div>
    );
};

export default Toast;