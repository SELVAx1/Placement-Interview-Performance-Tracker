function LoginForm({ onLoginSuccess }) {
    const [mode, setMode] = React.useState('signin');
    const [gmail, setGmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const [showPassword, setShowPassword] = React.useState(false);
    const [role, setRole] = React.useState('Student');
    const [name, setName] = React.useState('');
    const [department, setDepartment] = React.useState('CSE');
    const [loading, setLoading] = React.useState(false);
    const [alert, setAlert] = React.useState({ show: false, type: '', message: '' });

    const resetForm = () => {
        setGmail('');
        setPassword('');
        setConfirmPassword('');
        setName('');
        setRole('Student');
        setDepartment('CSE');
        setAlert({ show: false, type: '', message: '' });
    };

    const handleSignIn = async (e) => {
        e.preventDefault();
        setAlert({ show: false, type: '', message: '' });

        if (!gmail.trim()) {
            setAlert({ show: true, type: 'error', message: 'Please enter your email address.' });
            return;
        }
        if (!password) {
            setAlert({ show: true, type: 'error', message: 'Please enter your password.' });
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gmail: gmail.trim(), password })
            });
            const data = await response.json();

            if (response.ok && data.success) {
                setAlert({ show: true, type: 'success', message: data.message || 'Logged in successfully!' });
                setTimeout(() => {
                    onLoginSuccess(data.user, data.token);
                }, 600);
            } else if (data.pending) {
                setAlert({
                    show: true,
                    type: 'warning',
                    message: data.message || 'Your account is pending approval by a Coordinator.'
                });
            } else {
                setAlert({
                    show: true,
                    type: 'error',
                    message: data.message || 'Invalid email or password'
                });
            }
        } catch (err) {
            setAlert({ show: true, type: 'error', message: 'Unable to connect to the authentication server.' });
        } finally {
            setLoading(false);
        }
    };

    const handleSignUp = async (e) => {
        e.preventDefault();
        setAlert({ show: false, type: '', message: '' });

        if (!gmail.trim() || !gmail.includes('@')) {
            setAlert({ show: true, type: 'error', message: 'Please enter a valid email address.' });
            return;
        }
        if (!password || password.length < 6) {
            setAlert({ show: true, type: 'error', message: 'Password must be at least 6 characters.' });
            return;
        }
        if (password !== confirmPassword) {
            setAlert({ show: true, type: 'error', message: 'Passwords do not match.' });
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/api/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gmail: gmail.trim(),
                    password,
                    confirm_password: confirmPassword,
                    role,
                    name: name.trim(),
                    department
                })
            });
            const data = await response.json();

            if (response.ok && data.success) {
                setAlert({
                    show: true,
                    type: 'success',
                    message: data.message || 'Signup submitted! Waiting for Coordinator approval.'
                });
                setTimeout(() => {
                    setMode('signin');
                    setPassword('');
                    setConfirmPassword('');
                }, 2000);
            } else {
                setAlert({ show: true, type: 'error', message: data.message || 'Signup failed.' });
            }
        } catch (err) {
            setAlert({ show: true, type: 'error', message: 'Unable to connect to the server.' });
        } finally {
            setLoading(false);
        }
    };

    const alertBg = alert.type === 'warning'
        ? 'rgba(251, 191, 36, 0.15)'
        : alert.type === 'success'
            ? 'rgba(16, 185, 129, 0.15)'
            : 'rgba(239, 68, 68, 0.15)';
    const alertBorder = alert.type === 'warning'
        ? 'rgba(251, 191, 36, 0.4)'
        : alert.type === 'success'
            ? 'rgba(16, 185, 129, 0.4)'
            : 'rgba(239, 68, 68, 0.4)';
    const alertColor = alert.type === 'warning'
        ? '#d97706'
        : alert.type === 'success'
            ? '#059669'
            : '#dc2626';

    return (
        <div className="glass-card">
            <div className="brand-header">
                <div className="login-hero-logo">
                    <img src="/static/icon.png" alt="Placement Intervention System" />
                </div>
                <h2>Placement Intervention System</h2>
                <div className="brand-motto">
                    <span>Guide</span> &bull; <span>Prepare</span> &bull; <span>Track</span> &bull; <span>Succeed</span>
                </div>
                <p className="brand-desc">Enterprise Campus Recruitment Performance & AI Diagnostic Architecture</p>
            </div>

            {/* Sign In / Sign Up Toggle */}
            <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                    type="button"
                    onClick={() => { setMode('signin'); resetForm(); }}
                    style={{
                        flex: 1, padding: '10px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem',
                        background: mode === 'signin' ? '#0f766e' : 'rgba(255,255,255,0.05)',
                        color: mode === 'signin' ? '#fff' : '#94a3b8',
                        transition: 'all 0.2s ease'
                    }}
                >
                    Sign In
                </button>
                <button
                    type="button"
                    onClick={() => { setMode('signup'); resetForm(); }}
                    style={{
                        flex: 1, padding: '10px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem',
                        background: mode === 'signup' ? '#b45309' : 'rgba(255,255,255,0.05)',
                        color: mode === 'signup' ? '#fff' : '#94a3b8',
                        transition: 'all 0.2s ease'
                    }}
                >
                    Sign Up
                </button>
            </div>

            {/* Alert Box */}
            {alert.show && (
                <div className={`alert-box ${alert.type}`} style={{ background: alertBg, border: '1px solid ' + alertBorder }}>
                    <div className="alert-icon" style={{ color: alertColor }}>
                        {alert.type === 'warning' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                <line x1="12" y1="9" x2="12" y2="13"></line>
                                <line x1="12" y1="17" x2="12.01" y2="17"></line>
                            </svg>
                        ) : alert.type === 'error' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                        )}
                    </div>
                    <div className="alert-message" style={{ color: alertColor }}>{alert.message}</div>
                </div>
            )}

            {/* SIGN IN FORM */}
            {mode === 'signin' && (
                <form onSubmit={handleSignIn} noValidate>
                    <div className="input-group">
                        <label htmlFor="gmailInput">Email Address</label>
                        <div className="input-wrapper">
                            <span className="field-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                    <polyline points="22,6 12,13 2,6"></polyline>
                                </svg>
                            </span>
                            <input type="email" id="gmailInput" placeholder="name@gmail.com" value={gmail} onChange={(e) => setGmail(e.target.value)} required />
                        </div>
                    </div>

                    <div className="input-group">
                        <label htmlFor="passwordInput">Password</label>
                        <div className="input-wrapper">
                            <span className="field-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                            </span>
                            <input type={showPassword ? 'text' : 'password'} id="passwordInput" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            <button type="button" className="toggle-password" onClick={() => setShowPassword(!showPassword)} title="Toggle Password Visibility">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    {showPassword ? (
                                        <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></>
                                    ) : (
                                        <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></>
                                    )}
                                </svg>
                            </button>
                        </div>
                    </div>

                    <button type="submit" className="submit-btn" disabled={loading}>
                        {loading ? (
                            <span className="btn-loader"><svg className="spinner" viewBox="0 0 50 50"><circle className="path" cx="25" cy="25" r="20" fill="none" strokeWidth="5"></circle></svg></span>
                        ) : (
                            <span className="btn-text">Sign In</span>
                        )}
                    </button>
                </form>
            )}

            {/* SIGN UP FORM */}
            {mode === 'signup' && (
                <form onSubmit={handleSignUp} noValidate>
                    <div className="input-group">
                        <label>Full Name</label>
                        <div className="input-wrapper">
                            <span className="field-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>
                                </svg>
                            </span>
                            <input type="text" placeholder="Enter your full name" value={name} onChange={(e) => setName(e.target.value)} />
                        </div>
                    </div>

                    <div className="input-group">
                        <label>Email Address</label>
                        <div className="input-wrapper">
                            <span className="field-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                    <polyline points="22,6 12,13 2,6"></polyline>
                                </svg>
                            </span>
                            <input type="email" placeholder="name@gmail.com" value={gmail} onChange={(e) => setGmail(e.target.value)} required />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="input-group">
                            <label>Role</label>
                            <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.12)', color: '#0f172a', fontSize: '0.9rem' }}>
                                <option value="Student">Student</option>
                                <option value="Mentor">Mentor</option>
                                <option value="Department">Department Head</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <label>Department</label>
                            <select value={department} onChange={(e) => setDepartment(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.12)', color: '#0f172a', fontSize: '0.9rem' }}>
                                <option value="CSE">CSE</option>
                                <option value="IT">IT</option>
                                <option value="ECE">ECE</option>
                                <option value="EEE">EEE</option>
                                <option value="MECH">MECH</option>
                                <option value="AI & DS">AI & DS</option>
                                <option value="CIVIL">CIVIL</option>
                            </select>
                        </div>
                    </div>

                    <div className="input-group">
                        <label>Password</label>
                        <div className="input-wrapper">
                            <span className="field-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                            </span>
                            <input type="password" placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </div>
                    </div>

                    <div className="input-group">
                        <label>Confirm Password</label>
                        <div className="input-wrapper">
                            <span className="field-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                            </span>
                            <input type="password" placeholder="Re-enter your password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                        </div>
                    </div>

                    <button type="submit" className="submit-btn" disabled={loading} style={{ background: loading ? '#334155' : 'linear-gradient(135deg, #b45309, #92400e)' }}>
                        {loading ? (
                            <span className="btn-loader"><svg className="spinner" viewBox="0 0 50 50"><circle className="path" cx="25" cy="25" r="20" fill="none" strokeWidth="5"></circle></svg></span>
                        ) : (
                            <span className="btn-text">Create Account</span>
                        )}
                    </button>

                    <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.82rem', marginTop: '12px' }}>
                        After signup, a Coordinator must approve your account before you can sign in.
                    </p>
                </form>
            )}
        </div>
    );
}
