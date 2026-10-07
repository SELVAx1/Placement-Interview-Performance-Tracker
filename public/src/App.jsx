window.interventionHeaders = (user) => ({
    'X-User-Id': user?.uuid || '',
    'X-User-Role': user?.role || '',
    'X-Department': user?.department || 'CSE'
});

window.authFetch = async (url, options = {}) => {
    const token = localStorage.getItem('auth_token');
    const headers = {
        ...(options.headers || {}),
    };
    if (token) {
        headers['Authorization'] = 'Bearer ' + token;
    }
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        window.location.reload();
    }
    return response;
};

function App() {
    const [currentUser, setCurrentUser] = React.useState(() => {
        try {
            const saved = localStorage.getItem('auth_user');
            const token = localStorage.getItem('auth_token');
            if (saved && token) return JSON.parse(saved);
            localStorage.removeItem('auth_user');
            localStorage.removeItem('auth_token');
            return null;
        } catch (e) {
            return null;
        }
    });

    const handleLogout = () => {
        localStorage.removeItem('auth_user');
        localStorage.removeItem('auth_token');
        setCurrentUser(null);
    };

    const handleLoginSuccess = (user, token) => {
        localStorage.setItem('auth_user', JSON.stringify(user));
        localStorage.setItem('auth_token', token);
        setCurrentUser(user);
    };

    return (
        <div className="app-viewport">
            <main className="main-content">
                {currentUser ? (
                    <Dashboard
                        user={currentUser}
                        onLogout={handleLogout}
                    />
                ) : (
                    <LoginForm
                        onLoginSuccess={handleLoginSuccess}
                    />
                )}
            </main>
        </div>
    );
}
