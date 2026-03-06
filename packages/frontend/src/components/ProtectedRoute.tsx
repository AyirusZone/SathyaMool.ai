import React from 'react';
import { Navigate } from 'react-router-dom';
import authService from '../services/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const isAuthenticated = authService.isAuthenticated();
  
  console.log('ProtectedRoute check:', {
    isAuthenticated,
    accessToken: localStorage.getItem('accessToken'),
    user: localStorage.getItem('user'),
    requiredRole,
  });

  if (!isAuthenticated) {
    console.log('Not authenticated, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && !authService.hasRole(requiredRole)) {
    console.log('Missing required role, redirecting to dashboard');
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
