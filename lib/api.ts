export function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('auth_token');
  console.log('getAuthHeaders - token:', token);
  
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };
}

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  console.log('fetchWithAuth - token:', token);
  console.log('fetchWithAuth - url:', url);
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...(options.headers || {}),
  };
  
  console.log('fetchWithAuth - headers:', headers);
  
  const response = await fetch(url, {
    ...options,
    headers,
  });

  console.log('fetchWithAuth - response status:', response.status);

  // If unauthorized, redirect to login
  if (response.status === 401) {
    console.log('401 Unauthorized - removing token and redirecting');
    localStorage.removeItem('auth_token');
    window.location.href = '/login';
    throw new Error('Authentication required');
  }

  return response;
}