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

    const [theme, setTheme] = React.useState(() => {
        return localStorage.getItem('app_theme') || 'light';
    });

    React.useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('app_theme', theme);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = theme === 'dark' ? '#161A19' : '#F5F5F2';
    }, [theme]);

    const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

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
                        theme={theme}
                        onToggleTheme={toggleTheme}
                    />
                ) : (
                    <LoginForm
                        onLoginSuccess={handleLoginSuccess}
                        theme={theme}
                        onToggleTheme={toggleTheme}
                    />
                )}
            </main>
        </div>
    );
}
