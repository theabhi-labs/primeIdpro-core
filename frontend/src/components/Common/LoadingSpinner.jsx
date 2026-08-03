// frontend/src/components/Common/LoadingSpinner.jsx
import React from 'react';

const LoadingSpinner = ({ size = 'medium' }) => {
    const sizeClasses = {
        small: 'w-5 h-5 border-2',
        medium: 'w-10 h-10 border-[3px]',
        large: 'w-16 h-16 border-4'
    };

    return (
        <div className="flex flex-col justify-center items-center gap-3">
            <div className="relative">
                {/* Outer Glow Ring (Static) */}
                <div className={`${sizeClasses[size]} rounded-full border-slate-800 absolute inset-0`}></div>
                
                {/* Main Animated Spinner with Gradient effect */}
                <div className={`
                    ${sizeClasses[size]} 
                    animate-spin 
                    rounded-full 
                    border-transparent 
                    border-t-blue-500 
                    border-r-indigo-500/30
                    shadow-[0_0_15px_rgba(59,130,246,0.5)]
                `}></div>
            </div>
            
            {/* Optional: Chota sa detail for 'large' size only */}
            {size === 'large' && (
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 animate-pulse">
                    Processing
                </span>
            )}
        </div>
    );
};

export default LoadingSpinner;