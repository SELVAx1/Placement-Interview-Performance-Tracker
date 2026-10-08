function DepartmentDashboard({ user, onLogout, theme, onToggleTheme }) {
    // Navigation Tabs: 'overview', 'students', 'mentors', 'interventions', 'placed'
    const [activeTab, setActiveTab] = React.useState('overview');

    // Data states
    const [deptData, setDeptData] = React.useState(null);
    const [interventions, setInterventions] = React.useState([]);
    const [loading, setLoading] = React.useState(true);

    // Filters & Search
    const [searchQuery, setSearchQuery] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState('ALL');

    // Selected Student for Slide-Over Drawer
    const [selectedStudent, setSelectedStudent] = React.useState(null);

    // Toast Notification
    const [toastMsg, setToastMsg] = React.useState('');

    const showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(''), 3500);
    };

    // Fetch Department Data from Backend API
    const fetchDepartmentData = React.useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/department/dashboard?dept=CSE');
            if (res.ok) {
                const data = await res.json();
                setDeptData(data);
            }
            const interventionRes = await fetch('/api/interventions', {
                headers: window.interventionHeaders(user)
            });
            if (interventionRes.ok) {
                const interventionData = await interventionRes.json();
                setInterventions(interventionData.interventions || []);
            } else {
                setInterventions([]);
            }
        } catch (err) {
            console.error('Failed to load department dashboard data:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    React.useEffect(() => {
        fetchDepartmentData();
    }, [fetchDepartmentData]);

    const metrics = deptData?.metrics || {
        total_students: 0,
        placed_count: 0,
        placement_rate: 0,
        at_risk_count: 0,
        total_mentors: 0,
        avg_ctc: 0,
        highest_ctc: 0
    };

    const students = deptData?.students || [];
    const mentors = deptData?.mentors || [];
    const placedStudents = deptData?.placed_students || [];

    const updateInterventionStatus = async (interventionId, nextStatus) => {
        const res = await fetch(`/api/interventions/${interventionId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
            body: JSON.stringify({ status: nextStatus })
        });
        if (res.ok) {
            setInterventions(prev => prev.map(item => item.id === interventionId ? { ...item, status: nextStatus } : item));
            showToast(`Intervention marked ${nextStatus.toLowerCase()}.`);
        } else {
            showToast('Unable to update intervention status.');
        }
    };

    // Filtered Students List
    const filteredStudents = React.useMemo(() => {
        return students.filter(s => {
            const matchesSearch = (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (s.register_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (s.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (s.assigned_mentor || '').toLowerCase().includes(searchQuery.toLowerCase());

            const matchesStatus = statusFilter === 'ALL' ||
                (statusFilter === 'PLACED' && s.status === 'Placed') ||
                (statusFilter === 'AT_RISK' && s.status === 'At Risk') ||
                (statusFilter === 'ACTIVE' && (s.status === 'Active' || s.status === 'In Progress'));

            return matchesSearch && matchesStatus;
        });
    }, [students, searchQuery, statusFilter]);

    return (
        <div className="laptop-dashboard">
            {/* Top Navbar Header */}
            <header className="desktop-navbar">
                <div className="nav-left">
                    <div className="brand-icon" title="Placement Intervention System">
                        <img src="/static/icon.png" alt="Placement Intervention System" />
                    </div>
                    <div className="brand-text">
                        <span className="portal-name">Placement Intervention System</span>
                        <span className="portal-sub">
                            {deptData?.department?.name || 'Computer Science & Engineering'} &bull; <span className="brand-tagline-badge">Dept Head</span>
                        </span>
                    </div>
                </div>

                {/* Navbar Tabs */}
                <div className="nav-tabs" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1, minWidth: 0, justifyContent: 'center' }}>
                    {[
                        { id: 'overview', label: 'Overview & Metrics' },
                        { id: 'students', label: `Dept Students (${students.length})` },
                        { id: 'mentors', label: `Mentors (${mentors.length})` },
                        { id: 'interventions', label: `Interventions (${interventions.length})` },
                        { id: 'placed', label: `Placed Gallery (${placedStudents.length})` }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                background: activeTab === tab.id ? 'var(--primary)' : 'transparent',
                                color: activeTab === tab.id ? 'var(--panel-bg)' : 'var(--text-secondary)',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '0.8rem',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Header User Profile & Sign Out */}
                <div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="user-avatar" style={{ background: 'var(--accent)', color: 'var(--text-primary)', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                            D
                        </div>
                        <div className="user-info">
                            <span className="user-name" style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{user?.gmail || 'dept.cse@gmail.com'}</span>
                            <span className="user-role-badge" style={{ background: 'var(--accent)', color: 'var(--text-primary)', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', marginLeft: '6px' }}>Department Head</span>
                        </div>
                    </div>
                    {onToggleTheme && (
                        <button type="button" className="theme-toggle" onClick={onToggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {theme === 'dark' ? (<><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>) : (<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>)}
                            </svg>
                        </button>
                    )}
                    <button type="button" className="logout-btn" onClick={onLogout} style={{ padding: '8px 14px', borderRadius: '6px', background: 'var(--border-color)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer' }}>
                        Sign Out
                    </button>
                </div>
            </header>

            {/* Toast Notification */}
            {toastMsg && (
                <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000, background: 'var(--accent)', color: 'var(--text-primary)', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontWeight: '600' }}>
                    {toastMsg}
                </div>
            )}

            {/* MAIN DASHBOARD CONTENT */}
            <main className="dashboard-body" style={{ marginTop: '20px' }}>
                {loading ? (
                    <div style={{ color: 'var(--text-muted)', padding: '40px', textAlign: 'center' }}>
                        <p>Loading Department Workspace...</p>
                    </div>
                ) : (
                    <>
                        {/* TAB 1: OVERVIEW & METRICS */}
                        {activeTab === 'overview' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {/* Top KPI Metric Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                    <div style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Total Dept Students</span>
                                        <h3 style={{ fontSize: '2rem', color: 'var(--text-primary)', marginTop: '6px' }}>{metrics.total_students}</h3>
                                        <p style={{ color: 'var(--primary)', fontSize: '0.75rem', marginTop: '4px' }}>Active Batch Enrolled</p>
                                    </div>

                                    <div style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Placement Rate</span>
                                        <h3 style={{ fontSize: '2rem', color: 'var(--success-text)', marginTop: '6px' }}>{metrics.placement_rate}%</h3>
                                        <p style={{ color: 'var(--success-text)', fontSize: '0.75rem', marginTop: '4px' }}>{metrics.placed_count} Placed Candidates</p>
                                    </div>

                                    <div style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Department Mentors</span>
                                        <h3 style={{ fontSize: '2rem', color: 'var(--accent)', marginTop: '6px' }}>{metrics.total_mentors}</h3>
                                        <p style={{ color: 'var(--accent)', fontSize: '0.75rem', marginTop: '4px' }}>Active Faculty Supervisors</p>
                                    </div>

                                    <div style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Average CTC Package</span>
                                        <h3 style={{ fontSize: '2rem', color: 'var(--primary)', marginTop: '6px' }}>₹{metrics.avg_ctc} LPA</h3>
                                        <p style={{ color: 'var(--primary)', fontSize: '0.75rem', marginTop: '4px' }}>Highest: ₹{metrics.highest_ctc} LPA</p>
                                    </div>

                                    <div style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Students Needing Focus</span>
                                        <h3 style={{ fontSize: '2rem', color: 'var(--error-text)', marginTop: '6px' }}>{metrics.at_risk_count}</h3>
                                        <p style={{ color: 'var(--error-text)', fontSize: '0.75rem', marginTop: '4px' }}>Active Interventions Flagged</p>
                                    </div>
                                </div>

                                {/* Placement Progress Bar */}
                                <div className="card" style={{ background: 'var(--panel-bg)', padding: '24px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', color: 'var(--text-primary)' }}>
                                        <h4 style={{ fontSize: '1.05rem' }}>Batch Placement Progress</h4>
                                        <span style={{ color: 'var(--success-text)', fontWeight: 'bold' }}>{metrics.placed_count} / {metrics.total_students} Placed ({metrics.placement_rate}%)</span>
                                    </div>
                                    <div style={{ width: '100%', height: '12px', background: 'var(--panel-bg)', borderRadius: '6px', overflow: 'hidden' }}>
                                        <div style={{ width: `${metrics.placement_rate}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--success-text))', borderRadius: '6px', transition: 'width 0.5s ease-in-out' }}></div>
                                    </div>
                                </div>

                                {/* Quick Summary Grids */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    {/* Faculty Mentors Overview */}
                                    <div className="card" style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: '16px' }}>Department Faculty Mentors</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {mentors.map(m => (
                                                <div key={m.id} style={{ background: 'var(--panel-bg)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <h5 style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 'bold' }}>{m.name}</h5>
                                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{m.specialization}</p>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <span style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                            {m.assigned_mentees} Mentees ({m.placed_mentees} Placed)
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Recent Interventions Overview */}
                                    <div className="card" style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: '16px' }}>Active Department Interventions</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {interventions.map(inv => (
                                                <div key={inv.id} style={{ background: 'var(--panel-bg)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <h5 style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 'bold' }}>{inv.title}</h5>
                                                        <span style={{ background: inv.status === 'APPROVED' ? 'var(--success-bg)' : 'var(--warning-bg)', color: inv.status === 'APPROVED' ? 'var(--success-text)' : 'var(--primary)', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                            {inv.status}
                                                        </span>
                                                    </div>
                                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '6px' }}>
                                                        Student: <strong style={{ color: 'var(--text-primary)' }}>{inv.student_gmail}</strong>
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 2: DEPARTMENT STUDENTS TABLE */}
                        {activeTab === 'students' && (
                            <div className="card" style={{ background: 'var(--panel-bg)', padding: '24px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                                    <div>
                                        <h3 style={{ color: 'var(--text-primary)', fontSize: '1.25rem' }}>Department Students Directory</h3>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Complete student roster for {deptData?.department?.name || 'CSE'}</p>
                                    </div>

                                    {/* Search & Status Filters */}
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            placeholder="Search student, reg no, mentor..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            style={{ padding: '8px 14px', borderRadius: '6px', background: 'var(--panel-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.875rem', width: '240px' }}
                                        />
                                        <select
                                            value={statusFilter}
                                            onChange={(e) => setStatusFilter(e.target.value)}
                                            style={{ padding: '8px 14px', borderRadius: '6px', background: 'var(--panel-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.875rem' }}
                                        >
                                            <option value="ALL">All Statuses</option>
                                            <option value="PLACED">Placed Only</option>
                                            <option value="AT_RISK">At Risk Only</option>
                                            <option value="ACTIVE">Active / In Progress</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                <th style={{ padding: '12px' }}>STUDENT NAME</th>
                                                <th style={{ padding: '12px' }}>REG NUMBER</th>
                                                <th style={{ padding: '12px' }}>CGPA</th>
                                                <th style={{ padding: '12px' }}>MONTHLY SOLVED</th>
                                                <th style={{ padding: '12px' }}>STATUS</th>
                                                <th style={{ padding: '12px' }}>OFFER / COMPANY</th>
                                                <th style={{ padding: '12px' }}>ASSIGNED MENTOR</th>
                                                <th style={{ padding: '12px', textAlign: 'right' }}>ACTION</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredStudents.length === 0 ? (
                                                <tr>
                                                    <td colSpan="8" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No students found matching filters.</td>
                                                </tr>
                                            ) : (
                                                filteredStudents.map(st => (
                                                    <tr key={st.student_id} style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                                                        <td style={{ padding: '12px' }}>
                                                            <div style={{ fontWeight: 'bold' }}>{st.name}</div>
                                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span>{st.email}</span>
                                                                {st.resume_url && (
                                                                    <a href={st.resume_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: '600' }}>
                                                                        📄 Resume
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{st.register_number}</td>
                                                        <td style={{ padding: '12px', color: 'var(--success-text)', fontWeight: 'bold' }}>{st.cgpa}</td>
                                                        <td style={{ padding: '12px' }}>
                                                            <span style={{
                                                                padding: '3px 8px',
                                                                borderRadius: '6px',
                                                                background: 'var(--accent-light)',
                                                                color: 'var(--warning-text)',
                                                                fontWeight: '700',
                                                                fontSize: '0.8rem',
                                                                border: '1px solid var(--accent-subtle)',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}>
                                                                {st.monthly_total_solved || 0}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '12px' }}>
                                                            <span style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '12px',
                                                                fontSize: '0.75rem',
                                                                fontWeight: 'bold',
                                                                background: st.status === 'Placed' ? 'var(--success-bg)' : st.status === 'At Risk' ? 'var(--error-bg)' : 'var(--primary-light)',
                                                                color: st.status === 'Placed' ? 'var(--success-text)' : st.status === 'At Risk' ? 'var(--error-text)' : 'var(--primary)'
                                                            }}>
                                                                {st.status}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '12px' }}>
                                                            {st.company ? (
                                                                <div>
                                                                    <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{st.company}</span>
                                                                    <span style={{ color: 'var(--success-text)', fontWeight: 'bold', fontSize: '0.8rem', marginLeft: '6px' }}>₹{st.ctc} LPA</span>
                                                                </div>
                                                            ) : (
                                                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Searching</span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{st.assigned_mentor}</td>
                                                        <td style={{ padding: '12px', textAlign: 'right' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedStudent(st)}
                                                                style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--border-color)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}
                                                            >
                                                                View Details &rarr;
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* TAB 3: DEPARTMENT MENTORS */}
                        {activeTab === 'mentors' && (
                            <div className="card" style={{ background: 'var(--panel-bg)', padding: '24px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                <h3 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '8px' }}>Department Faculty Mentors</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '20px' }}>Supervising mentors assigned to students in {deptData?.department?.name || 'CSE'}</p>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                                    {mentors.map(m => (
                                        <div key={m.id} style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                                                <div style={{ background: 'var(--accent)', color: 'var(--text-primary)', width: '42px', height: '42px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.1rem' }}>
                                                    {m.name[0]}
                                                </div>
                                                <div>
                                                    <h4 style={{ color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 'bold' }}>{m.name}</h4>
                                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{m.email}</p>
                                                </div>
                                            </div>

                                            <div style={{ background: 'var(--panel-bg)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '14px' }}>
                                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>SPECIALIZATION</span>
                                                <span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '0.85rem' }}>{m.specialization}</span>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', textAlign: 'center' }}>
                                                <div style={{ background: 'var(--panel-bg)', padding: '10px', borderRadius: '6px' }}>
                                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Assigned Mentees</span>
                                                    <strong style={{ color: 'var(--text-primary)', fontSize: '1.1rem' }}>{m.assigned_mentees}</strong>
                                                </div>
                                                <div style={{ background: 'var(--panel-bg)', padding: '10px', borderRadius: '6px' }}>
                                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Placed Mentees</span>
                                                    <strong style={{ color: 'var(--success-text)', fontSize: '1.1rem' }}>{m.placed_mentees}</strong>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* TAB 4: INTERVENTIONS */}
                        {activeTab === 'interventions' && (
                            <InterventionRoster
                                user={user}
                                canGenerate={true}
                                title="Department Student Interventions"
                                description="Expand a department student to inspect their intervention and action plan."
                            />
                        )}

                        {/* TAB 5: PLACED GALLERY */}
                        {activeTab === 'placed' && (
                            <div className="card" style={{ background: 'var(--panel-bg)', padding: '24px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                <h3 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '8px' }}>Department Placed Students Hall of Fame</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '20px' }}>Celebrating successful campus selections from {deptData?.department?.name || 'CSE'}</p>

                                {placedStudents.length === 0 ? (
                                    <p style={{ color: 'var(--text-muted)' }}>No students placed yet in this batch.</p>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                                        {placedStudents.map(st => (
                                            <div key={st.student_id} style={{ background: 'var(--panel-bg)', padding: '18px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div>
                                                        <h4 style={{ color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 'bold' }}>{st.name}</h4>
                                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{st.register_number}</p>
                                                    </div>
                                                    <span style={{ background: 'var(--success-bg)', color: 'var(--success-text)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                        PLACED
                                                    </span>
                                                </div>

                                                <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                                                    <div style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.95rem' }}>{st.company}</div>
                                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Role: {st.job_role || 'Software Engineer'}</p>
                                                    <p style={{ color: 'var(--success-text)', fontWeight: 'bold', fontSize: '1.05rem', marginTop: '4px' }}>₹{st.ctc} LPA</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* STUDENT DETAIL SLIDE-OVER DRAWER */}
            {selectedStudent && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1100, display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ width: '480px', maxWidth: '100%', background: 'var(--panel-bg)', borderLeft: '1px solid var(--border-color)', padding: '24px', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
                            <div>
                                <h3 style={{ color: 'var(--text-primary)', fontSize: '1.2rem', fontWeight: 'bold' }}>{selectedStudent.name}</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{selectedStudent.register_number} &bull; {selectedStudent.department}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedStudent(null)}
                                style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}
                            >
                                Close &times;
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Academic Overview */}
                            <div style={{ background: 'var(--panel-bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <h4 style={{ color: 'var(--accent)', fontSize: '0.9rem', margin: 0 }}>Academic Overview</h4>
                                    {selectedStudent.resume_url && (
                                        <a
                                            href={selectedStudent.resume_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                background: 'var(--success-bg)',
                                                color: 'var(--success-text)',
                                                border: '1px solid var(--success-border)',
                                                padding: '3px 8px',
                                                borderRadius: '5px',
                                                fontSize: '0.75rem',
                                                fontWeight: '600',
                                                textDecoration: 'none'
                                            }}
                                        >
                                            📄 View Resume
                                        </a>
                                    )}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    <div>CGPA: <strong style={{ color: 'var(--success-text)' }}>{selectedStudent.cgpa}</strong></div>
                                    <div>10th %: <strong style={{ color: 'var(--text-primary)' }}>{selectedStudent.tenth}%</strong></div>
                                    <div>12th %: <strong style={{ color: 'var(--text-primary)' }}>{selectedStudent.twelfth}%</strong></div>
                                    <div>Status: <strong style={{ color: selectedStudent.status === 'Placed' ? 'var(--success-text)' : 'var(--error-text)' }}>{selectedStudent.status}</strong></div>
                                    <div>Phone: <strong style={{ color: 'var(--text-primary)' }}>{selectedStudent.phone || 'N/A'}</strong></div>
                                    <div>Email: <strong style={{ color: 'var(--text-primary)' }}>{selectedStudent.email}</strong></div>
                                </div>

                                {/* Social Links */}
                                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                                    {selectedStudent.linkedin_url && (
                                        <a href={selectedStudent.linkedin_url.startsWith('http') ? selectedStudent.linkedin_url : `https://${selectedStudent.linkedin_url}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: '600' }}>
                                            LinkedIn
                                        </a>
                                    )}
                                    {selectedStudent.github_url && (
                                        <a href={selectedStudent.github_url.startsWith('http') ? selectedStudent.github_url : `https://${selectedStudent.github_url}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: '600' }}>
                                            🐙 GitHub
                                        </a>
                                    )}
                                    {selectedStudent.portfolio_url && (
                                        <a href={selectedStudent.portfolio_url.startsWith('http') ? selectedStudent.portfolio_url : `https://${selectedStudent.portfolio_url}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--success-text)', textDecoration: 'none', fontWeight: '600' }}>
                                            Portfolio
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Competitive Coding Platform & Monthly Solved Activity */}
                            <div style={{ background: 'var(--panel-bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <div style={{
                                    background: 'linear-gradient(135deg, var(--accent-subtle), var(--accent-light))',
                                    border: '1px solid var(--accent-subtle)',
                                    borderRadius: '6px',
                                    padding: '10px 14px',
                                    marginBottom: '14px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <div>
                                        <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase' }}>Competitive Coding Activity</span>
                                        <div style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
                                            {selectedStudent.monthly_total_solved || 0} Solved This Month
                                        </div>
                                    </div>
                                    <span style={{ background: 'var(--accent-subtle)', color: 'var(--warning-text)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '700' }}>
                                        Monthly Total
                                    </span>
                                </div>

                                {/* 5 Platforms Grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                                    {/* LeetCode */}
                                    <div style={{ background: 'var(--panel-bg)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong style={{ color: 'var(--warning-text)', fontSize: '0.78rem' }}>LeetCode</strong>
                                            {selectedStudent.leetcode_handle && (
                                                <a href={`https://leetcode.com/u/${selectedStudent.leetcode_handle}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.65rem', color: 'var(--primary)', textDecoration: 'none' }}>↗</a>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>@{selectedStudent.leetcode_handle || '—'}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--success-text)', fontWeight: '600', marginTop: '4px' }}>
                                            {selectedStudent.leetcode_solved_month || 0} this mo
                                        </div>
                                    </div>

                                    {/* Codeforces */}
                                    <div style={{ background: 'var(--panel-bg)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong style={{ color: 'var(--primary)', fontSize: '0.78rem' }}>Codeforces</strong>
                                            {selectedStudent.codeforces_handle && (
                                                <a href={`https://codeforces.com/profile/${selectedStudent.codeforces_handle}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.65rem', color: 'var(--primary)', textDecoration: 'none' }}>↗</a>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>@{selectedStudent.codeforces_handle || '—'}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--success-text)', fontWeight: '600', marginTop: '4px' }}>
                                            {selectedStudent.codeforces_solved_month || 0} this mo
                                        </div>
                                    </div>

                                    {/* CodeChef */}
                                    <div style={{ background: 'var(--panel-bg)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong style={{ color: 'var(--warning-text)', fontSize: '0.78rem' }}>CodeChef</strong>
                                            {selectedStudent.codechef_handle && (
                                                <a href={`https://www.codechef.com/users/${selectedStudent.codechef_handle}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.65rem', color: 'var(--primary)', textDecoration: 'none' }}>↗</a>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>@{selectedStudent.codechef_handle || '—'}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--success-text)', fontWeight: '600', marginTop: '4px' }}>
                                            {selectedStudent.codechef_solved_month || 0} this mo
                                        </div>
                                    </div>

                                    {/* HackerRank */}
                                    <div style={{ background: 'var(--panel-bg)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong style={{ color: 'var(--success-text)', fontSize: '0.78rem' }}>HackerRank</strong>
                                            {selectedStudent.hackerrank_handle && (
                                                <a href={`https://www.hackerrank.com/profile/${selectedStudent.hackerrank_handle}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.65rem', color: 'var(--primary)', textDecoration: 'none' }}>↗</a>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>@{selectedStudent.hackerrank_handle || '—'}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--success-text)', fontWeight: '600', marginTop: '4px' }}>
                                            {selectedStudent.hackerrank_solved_month || 0} this mo
                                        </div>
                                    </div>

                                    {/* AtCoder */}
                                    <div style={{ background: 'var(--panel-bg)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong style={{ color: 'var(--warning-text)', fontSize: '0.78rem' }}>AtCoder</strong>
                                            {selectedStudent.atcoder_handle && (
                                                <a href={`https://atcoder.jp/users/${selectedStudent.atcoder_handle}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.65rem', color: 'var(--primary)', textDecoration: 'none' }}>↗</a>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>@{selectedStudent.atcoder_handle || '—'}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--success-text)', fontWeight: '600', marginTop: '4px' }}>
                                            {selectedStudent.atcoder_solved_month || 0} this mo
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Assigned Supervisor */}
                            <div style={{ background: 'var(--panel-bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ color: 'var(--accent)', fontSize: '0.9rem', marginBottom: '8px' }}>Assigned Supervisor</h4>
                                <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 'bold' }}>{selectedStudent.assigned_mentor}</p>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Supervisor Email: {selectedStudent.email}</p>
                            </div>

                            {selectedStudent.company && (
                                <div style={{ background: 'var(--panel-bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--success-text)' }}>
                                    <h4 style={{ color: 'var(--success-text)', fontSize: '0.9rem', marginBottom: '6px' }}>Placed Offer Details</h4>
                                    <p style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '1rem' }}>{selectedStudent.company}</p>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Role: {selectedStudent.job_role}</p>
                                    <p style={{ color: 'var(--success-text)', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '4px' }}>₹{selectedStudent.ctc} LPA</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
