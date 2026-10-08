function Dashboard({ user, onLogout, theme, onToggleTheme }) {
    if (!user) return null;

    const role = (user.role || '').toLowerCase();

    if (role === 'student') {
        return <StudentDashboard user={user} onLogout={onLogout} theme={theme} onToggleTheme={onToggleTheme} />;
    }

    if (role === 'mentor') {
        return <MentorDashboard user={user} onLogout={onLogout} theme={theme} onToggleTheme={onToggleTheme} />;
    }

    if (role === 'department' || role === 'dept') {
        return <DepartmentDashboard user={user} onLogout={onLogout} theme={theme} onToggleTheme={onToggleTheme} />;
    }

    return <CoordinatorDashboard user={user} onLogout={onLogout} theme={theme} onToggleTheme={onToggleTheme} />;
}

