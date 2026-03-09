import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/v1';
// Auth endpoints are on the same API Gateway now
const AUTH_API_BASE_URL = API_BASE_URL;

class ApiClient {
  private client: AxiosInstance;
  private authClient: AxiosInstance;

  constructor() {
    // Main API client
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Auth API client (separate API Gateway)
    this.authClient = axios.create({
      baseURL: AUTH_API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth token (for main API)
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('accessToken');
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor to handle token refresh (for main API)
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // If 401 and not already retried, try to refresh token
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            console.log('Token expired, attempting refresh...');
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) {
              console.error('No refresh token available');
              throw new Error('No refresh token');
            }

            console.log('Calling refresh token endpoint...');
            const response = await this.authClient.post('/auth/refresh', {
              refreshToken,
            });

            console.log('Token refresh successful');
            const { accessToken } = response.data;
            localStorage.setItem('accessToken', accessToken);
            
            // Update user data if present
            if (response.data.userId && response.data.role) {
              const user = {
                userId: response.data.userId,
                role: response.data.role,
              };
              localStorage.setItem('user', JSON.stringify(user));
            }

            // Retry the original request with new token
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            console.log('Retrying original request with new token');
            return this.client(originalRequest);
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            // Refresh failed, clear tokens and redirect to login
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Use auth client for auth endpoints
  private getClient(url: string): AxiosInstance {
    return url.startsWith('/auth') ? this.authClient : this.client;
  }

  public get<T>(url: string, config?: any) {
    return this.getClient(url).get<T>(url, config);
  }

  public post<T>(url: string, data?: any, config?: any) {
    return this.getClient(url).post<T>(url, data, config);
  }

  public put<T>(url: string, data?: any, config?: any) {
    return this.getClient(url).put<T>(url, data, config);
  }

  public delete<T>(url: string, config?: any) {
    return this.getClient(url).delete<T>(url, config);
  }
}

export default new ApiClient();
