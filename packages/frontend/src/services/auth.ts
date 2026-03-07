import api from './api';

export interface User {
  userId: string;
  email?: string;
  phoneNumber?: string;
  role: 'Standard_User' | 'Professional_User' | 'Admin_User';
  createdAt?: string;
}

export interface LoginRequest {
  email?: string;
  phoneNumber?: string;
  password: string;
}

export interface RegisterRequest {
  email?: string;
  phoneNumber?: string;
  password: string;
  role?: 'Standard_User' | 'Professional_User';
}

export interface AuthResponse {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  userId: string;
  role: string;
}

export interface VerifyOtpRequest {
  username: string; // email or phone number
  code: string;
}

class AuthService {
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    console.log('AuthService.login called with:', credentials);
    const response = await api.post<AuthResponse>('/auth/login', credentials);
    console.log('Login API response:', response.data);
    this.setAuthData(response.data);
    console.log('After setAuthData - accessToken:', localStorage.getItem('accessToken'));
    console.log('After setAuthData - user:', localStorage.getItem('user'));
    return response.data;
  }

  async register(data: RegisterRequest): Promise<{ message: string; requiresOtp: boolean; userConfirmed: boolean }> {
    const response = await api.post('/auth/register', data);
    return {
      message: response.data.message,
      requiresOtp: !response.data.userConfirmed,
      userConfirmed: response.data.userConfirmed || false
    };
  }

  async verifyOtp(data: VerifyOtpRequest): Promise<{ message: string }> {
    const response = await api.post('/auth/verify-otp', data);
    return response.data;
  }

  async refreshToken(): Promise<AuthResponse> {
    const refreshToken = localStorage.getItem('refreshToken');
    const response = await api.post<AuthResponse>('/auth/refresh', { refreshToken });
    
    // Refresh endpoint returns new accessToken but not a new refreshToken
    // Update only the accessToken, keep the existing refreshToken
    localStorage.setItem('accessToken', response.data.accessToken);
    
    // Update user data if userId/role changed
    const user: User = {
      userId: response.data.userId,
      role: response.data.role as 'Standard_User' | 'Professional_User' | 'Admin_User',
    };
    localStorage.setItem('user', JSON.stringify(user));
    
    return response.data;
  }

  logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }

  getCurrentUser(): User | null {
    const userStr = localStorage.getItem('user');
    if (!userStr || userStr === 'undefined') return null;
    try {
      return JSON.parse(userStr);
    } catch (e) {
      return null;
    }
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('accessToken');
  }

  hasRole(role: string): boolean {
    const user = this.getCurrentUser();
    return user?.role === role;
  }

  private setAuthData(data: AuthResponse) {
    console.log('setAuthData called with:', data);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    
    // Convert backend response to User object
    const user: User = {
      userId: data.userId,
      role: data.role as 'Standard_User' | 'Professional_User' | 'Admin_User',
    };
    
    console.log('Setting user in localStorage:', user);
    localStorage.setItem('user', JSON.stringify(user));
    console.log('Verification - accessToken stored:', !!localStorage.getItem('accessToken'));
    console.log('Verification - user stored:', localStorage.getItem('user'));
  }
}

export default new AuthService();
