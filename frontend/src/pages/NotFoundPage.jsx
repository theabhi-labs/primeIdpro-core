// src/pages/NotFoundPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';

const NotFoundPage = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-800">404</h1>
        <p className="text-xl text-gray-600 mt-4">Page not found</p>
        <Link to="/" className="mt-6 inline-block px-6 py-3 bg-blue-600 text-white rounded-lg">
          Go Home
        </Link>
      </div>
    </div>
  );
};

export default NotFoundPage;