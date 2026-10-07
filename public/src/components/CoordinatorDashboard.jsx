function CoordinatorDashboard({ user, onLogout, theme, onToggleTheme }) {
    if (user && user.role && user.role.toLowerCase() === 'student') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', padding: '24px' }}>
                <h2 style={{ fontSize: '1.5rem', color: 'var(--error-text)', marginBottom: '8px' }}>Access Restricted</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Student accounts are not authorized to access Coordinator management tools.</p>
                <button type="button" onClick={onLogout} style={{ padding: '10px 20px', borderRadius: '8px', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
                    Sign Out
                </button>
            </div>
        );
    }

    const [drives, setDrives] = React.useState([]);
    const [loadingDrives, setLoadingDrives] = React.useState(true);
    const [interventions, setInterventions] = React.useState([]);
    const [loadingInterventions, setLoadingInterventions] = React.useState(true);
    const [activeTab, setActiveTab] = React.useState('drives');

    // Modal states
    const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
    const [editingDrive, setEditingDrive] = React.useState(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = React.useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = React.useState(false);
    const [isUserAccessModalOpen, setIsUserAccessModalOpen] = React.useState(false);
    const [isTemplatesModalOpen, setIsTemplatesModalOpen] = React.useState(false);
    const [isRosterModalOpen, setIsRosterModalOpen] = React.useState(false);
    const [selectedDriveForUpload, setSelectedDriveForUpload] = React.useState(null);
    const [selectedDriveForView, setSelectedDriveForView] = React.useState(null);

    const [pendingSignups, setPendingSignups] = React.useState([]);
    const [loadingSignups, setLoadingSignups] = React.useState(false);

    const [searchTerm, setSearchTerm] = React.useState('');
    const [viewMode, setViewMode] = React.useState('table'); // 'table' or 'grid'
    const [toastMessage, setToastMessage] = React.useState('');

    const fetchDrives = React.useCallback(async () => {
        setLoadingDrives(true);
        try {
            const res = await fetch('/api/drives');
            const data = await res.json();
            if (res.ok && data.success) {
                setDrives(data.drives || []);
            }
        } catch (err) {
            console.error('Failed to fetch drives:', err);
        } finally {
            setLoadingDrives(false);
        }
    }, []);

    React.useEffect(() => {
        fetchDrives();
    }, [fetchDrives]);

    const [coordinatorStats, setCoordinatorStats] = React.useState({
        total_students: 0,
        placed_count: 0
    });

    const fetchCoordinatorStats = React.useCallback(async () => {
        try {
            const res = await fetch('/api/coordinator/students-tracking');
            if (res.ok) {
                const data = await res.json();
                if (data.stats) {
                    setCoordinatorStats({
                        total_students: data.stats.total_students || 0,
                        placed_count: data.stats.placed_count || 0
                    });
                }
            }
        } catch (e) {
            console.error('Failed to fetch coordinator stats:', e);
        }
    }, []);

    React.useEffect(() => {
        fetchCoordinatorStats();
    }, [fetchCoordinatorStats]);

    const fetchInterventions = React.useCallback(async () => {
        setLoadingInterventions(true);
        try {
            const res = await fetch('/api/interventions', {
                headers: window.interventionHeaders(user)
            });
            if (res.ok) {
                const data = await res.json();
                setInterventions(data.interventions || []);
            }
        } catch (err) {
            console.error('Failed to fetch interventions:', err);
        } finally {
            setLoadingInterventions(false);
        }
    }, [user]);

    React.useEffect(() => {
        fetchInterventions();
    }, [fetchInterventions]);

    const fetchPendingSignups = React.useCallback(async () => {
        setLoadingSignups(true);
        try {
            const res = await fetch('/api/signups/pending', {
                headers: window.interventionHeaders(user)
            });
            if (res.ok) {
                const data = await res.json();
                setPendingSignups(data.pending || []);
            }
        } catch (err) {
            console.error('Failed to fetch pending signups:', err);
        } finally {
            setLoadingSignups(false);
        }
    }, [user]);

    React.useEffect(() => {
        fetchPendingSignups();
    }, [fetchPendingSignups]);

    const handleApproveSignup = async (userUuid) => {
        try {
            const res = await fetch(`/api/signups/${userUuid}/approve`, {
                method: 'POST',
                headers: window.interventionHeaders(user)
            });
            if (res.ok) {
                setPendingSignups(prev => prev.filter(s => s.uuid !== userUuid));
                setToastMessage('Account approved successfully.');
                setTimeout(() => setToastMessage(''), 3500);
            }
        } catch (err) {
            console.error('Failed to approve signup:', err);
        }
    };

    const handleRejectSignup = async (userUuid) => {
        try {
            const res = await fetch(`/api/signups/${userUuid}/reject`, {
                method: 'POST',
                headers: window.interventionHeaders(user)
            });
            if (res.ok) {
                setPendingSignups(prev => prev.filter(s => s.uuid !== userUuid));
                setToastMessage('Signup request rejected.');
                setTimeout(() => setToastMessage(''), 3500);
            }
        } catch (err) {
            console.error('Failed to reject signup:', err);
        }
    };

    const updateInterventionStatus = async (interventionId, nextStatus) => {
        const res = await fetch(`/api/interventions/${interventionId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
            body: JSON.stringify({ status: nextStatus })
        });
        if (res.ok) {
            setInterventions(prev => prev.map(item => item.id === interventionId ? { ...item, status: nextStatus } : item));
            setToastMessage(`Intervention marked ${nextStatus.toLowerCase()}.`);
            setTimeout(() => setToastMessage(''), 3500);
        }
    };

    const regenerateIntervention = async (studentGmail) => {
        const res = await fetch('/api/interventions/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
            body: JSON.stringify({ gmail: studentGmail })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            await fetchInterventions();
            setToastMessage('Intervention generated successfully.');
        } else {
            setToastMessage(data.detail || 'Unable to generate intervention.');
        }
        setTimeout(() => setToastMessage(''), 3500);
    };

    const handleDriveCreated = (savedDrive, isEdit = false) => {
        if (isEdit) {
            setDrives(prev => prev.map(d => d.id === savedDrive.id ? { ...d, ...savedDrive } : d));
            setToastMessage(`Drive for "${savedDrive.company_name}" altered successfully.`);
            if (selectedDriveForView && selectedDriveForView.id === savedDrive.id) {
                setSelectedDriveForView(prev => ({ ...prev, ...savedDrive }));
            }
        } else {
            setDrives(prev => [savedDrive, ...prev]);
            setToastMessage(`Drive for "${savedDrive.company_name}" initialized successfully.`);
        }
        setTimeout(() => setToastMessage(''), 3500);
    };

    const openCreateModal = () => {
        setEditingDrive(null);
        setIsCreateModalOpen(true);
    };

    const openEditModal = (drive) => {
        setEditingDrive(drive);
        setIsCreateModalOpen(true);
    };

    const handleResultsUploaded = (driveId) => {
        fetchDrives();
        fetchCoordinatorStats();
        setToastMessage(`Student results updated successfully.`);
        setTimeout(() => setToastMessage(''), 3500);
    };

    const handleUserAccessGranted = (data) => {
        fetchCoordinatorStats();
        setToastMessage(`Successfully granted access to ${data.total_processed} user account(s).`);
        setTimeout(() => setToastMessage(''), 3500);
    };

    const handleRosterUploaded = (data) => {
        fetchCoordinatorStats();
        setToastMessage(`Successfully imported/updated ${data.imported_count} student academic profiles.`);
        setTimeout(() => setToastMessage(''), 3500);
    };

    const openUploadModal = (driveId = null) => {
        setSelectedDriveForUpload(driveId);
        setIsUploadModalOpen(true);
    };

    const openViewModal = (drive) => {
        setSelectedDriveForView(drive);
        setIsViewModalOpen(true);
    };

    const filteredDrives = drives.filter(d =>
        d.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.job_role.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.allowed_branches.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="laptop-dashboard">
            {/* Top Navigation Bar */}
            <header className="desktop-navbar">
                <div className="nav-left">
                    <div className="brand-icon" title="Placement Intervention System">
                        <img src="/static/icon.png" alt="Placement Intervention System" />
                    </div>
                    <div className="brand-text">
                        <span className="portal-name">Placement Intervention System</span>
                        <span className="portal-sub">
                            Coordinator Workspace &bull; <span className="brand-tagline-badge">Guide &bull; Track</span>
                        </span>
                    </div>
                </div>

                <div className="coordinator-nav-tabs">
                    <button
                        type="button"
                        className={`coord-tab-button ${activeTab === 'drives' ? 'active tab-drives' : ''}`}
                        onClick={() => setActiveTab('drives')}
                    >
                        <div className="tab-icon-wrap">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                            </svg>
                        </div>
                        <span className="tab-text">Placement Drives</span>
                        <span className="tab-badge">{drives.length}</span>
                    </button>

                    <button
                        type="button"
                        className={`coord-tab-button ${activeTab === 'students' ? 'active tab-students' : ''}`}
                        onClick={() => setActiveTab('students')}
                    >
                        <div className="tab-icon-wrap">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                        </div>
                        <span className="tab-text">Student 360° Tracking</span>
                        <span className="tab-tag-pill">Year & Dept</span>
                    </button>

                    <button
                        type="button"
                        className={`coord-tab-button ${activeTab === 'interventions' ? 'active tab-interventions' : ''}`}
                        onClick={() => setActiveTab('interventions')}
                    >
                        <div className="tab-icon-wrap">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                        </div>
                        <span className="tab-text">Interventions</span>
                        <span className="tab-badge badge-alert">{interventions.length}</span>
                    </button>

                    <button
                        type="button"
                        className={`coord-tab-button ${activeTab === 'approvals' ? 'active tab-approvals' : ''}`}
                        onClick={() => setActiveTab('approvals')}
                    >
                        <div className="tab-icon-wrap">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="8.5" cy="7" r="4"></circle>
                                <polyline points="17 11 19 13 23 9"></polyline>
                            </svg>
                        </div>
                        <span className="tab-text">Approvals</span>
                        {pendingSignups.length > 0 && (
                            <span className="tab-badge badge-alert">{pendingSignups.length}</span>
                        )}
                    </button>
                </div>

                <div className="nav-right">
                    <div className="user-badge">
                        <span className="user-email">{user.gmail}</span>
                        <span className="badge-pill coordinator-pill">Coordinator</span>
                    </div>

                    {onToggleTheme && (
                        <button type="button" className="theme-toggle" onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {theme === 'dark' ? (
                                    <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>
                                ) : (
                                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                                )}
                            </svg>
                        </button>
                    )}

                    <button type="button" className="btn-nav-signout" onClick={onLogout} title="Sign Out">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                            <polyline points="16 17 21 12 16 7"></polyline>
                            <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
                        Sign Out
                    </button>
                </div>
            </header>

            {/* Toast Notification */}
            {toastMessage && (
                <div className="toast-bar">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>{toastMessage}</span>
                </div>
            )}

            {/* Main Content Area */}
            <div className="dashboard-content">
                {activeTab === 'students' && (
                    <StudentTrackingView
                        user={user}
                        showToast={(msg) => {
                            setToastMessage(msg);
                            setTimeout(() => setToastMessage(''), 3500);
                        }}
                    />
                )}

                {activeTab === 'interventions' && (
                    <InterventionRoster
                        user={user}
                        canGenerate={true}
                        title="All Student Interventions"
                        description="Expand any authorized student to inspect their intervention and action plan."
                    />
                )}

                {activeTab === 'approvals' && (
                    <div style={{ padding: '0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div>
                                <h2 style={{ color: 'var(--text-primary)', fontSize: '1.3rem', fontWeight: '700', margin: 0 }}>Pending Signup Approvals</h2>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>Review and approve or reject new user registration requests.</p>
                            </div>
                            <button type="button" onClick={fetchPendingSignups} style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary-subtle)', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}>
                                Refresh
                            </button>
                        </div>

                        {loadingSignups ? (
                            <div className="panel-loading"><div className="spinner-sm"></div><span>Loading pending requests...</span></div>
                        ) : pendingSignups.length === 0 ? (
                            <div className="panel-empty" style={{ background: 'var(--panel-bg)', borderRadius: '12px', padding: '40px' }}>
                                <h3>No Pending Requests</h3>
                                <p>All signup requests have been processed. New requests will appear here when users register.</p>
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table className="enterprise-table">
                                    <thead>
                                        <tr>
                                            <th>Email</th>
                                            <th>Requested Role</th>
                                            <th>Department</th>
                                            <th>Requested On</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pendingSignups.map(signup => (
                                            <tr key={signup.uuid}>
                                                <td className="font-semibold">{signup.gmail}</td>
                                                <td>
                                                    <span style={{
                                                        background: signup.role === 'Student' ? 'var(--success-bg)' : signup.role === 'Mentor' ? 'var(--primary-light)' : 'var(--accent-light)',
                                                        color: signup.role === 'Student' ? 'var(--success-text)' : signup.role === 'Mentor' ? 'var(--primary)' : 'var(--warning-text)',
                                                        padding: '3px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: '600'
                                                    }}>
                                                        {signup.role}
                                                    </span>
                                                </td>
                                                <td>{signup.department || 'CSE'}</td>
                                                <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{signup.created_at || 'Just now'}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                        <button type="button" onClick={() => handleApproveSignup(signup.uuid)} style={{ padding: '6px 14px', borderRadius: '6px', background: 'var(--success-text)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.82rem' }}>
                                                            Approve
                                                        </button>
                                                        <button type="button" onClick={() => handleRejectSignup(signup.uuid)} style={{ padding: '6px 14px', borderRadius: '6px', background: 'var(--error-text)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.82rem' }}>
                                                            Reject
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'drives' && (
                    <>
                        {/* Metrics Banner */}
                        <div className="metrics-row">
                            <div className="metric-box">
                                <span className="metric-num">{drives.length}</span>
                                <span className="metric-title">Active Drives</span>
                            </div>
                            <div className="metric-box">
                                <span className="metric-num">{coordinatorStats.total_students}</span>
                                <span className="metric-title">Candidates Registered</span>
                            </div>
                            <div className="metric-box">
                                <span className="metric-num">{coordinatorStats.placed_count}</span>
                                <span className="metric-title">Placed Students</span>
                            </div>
                            <div className="metric-box">
                                <span className="metric-num">
                                    {drives.reduce((acc, d) => acc + (d.results_count || 0), 0)}
                                </span>
                                <span className="metric-title">Total Results Uploaded</span>
                            </div>
                        </div>

                {/* Toolbar & Filter Bar */}
                <div className="table-toolbar">
                    <div className="search-field">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input
                            type="text"
                            placeholder="Filter by company, position, or branch..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="toolbar-actions">
                        <div className="view-toggle-group">
                            <button
                                type="button"
                                className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
                                onClick={() => setViewMode('table')}
                                title="Table View"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="8" y1="6" x2="21" y2="6"></line>
                                    <line x1="8" y1="12" x2="21" y2="12"></line>
                                    <line x1="8" y1="18" x2="21" y2="18"></line>
                                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                                </svg>
                                Table
                            </button>
                            <button
                                type="button"
                                className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                                onClick={() => setViewMode('grid')}
                                title="Grid View"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="7" height="7"></rect>
                                    <rect x="14" y="3" width="7" height="7"></rect>
                                    <rect x="14" y="14" width="7" height="7"></rect>
                                    <rect x="3" y="14" width="7" height="7"></rect>
                                </svg>
                                Cards
                            </button>
                        </div>

                        <button
                            type="button"
                            className="btn-templates-hub"
                            onClick={() => setIsTemplatesModalOpen(true)}
                            title="Download official Excel (.xlsx) and CSV templates"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Download Templates
                        </button>

                        <button
                            type="button"
                            className="btn-upload-access"
                            onClick={() => setIsUserAccessModalOpen(true)}
                            title="Upload Excel with Gmails to Grant User Access"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M23 21v-2a4 4 0 0 3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                            Grant User Access (Excel)
                        </button>

                        <button
                            type="button"
                            className="btn-upload-roster"
                            onClick={() => setIsRosterModalOpen(true)}
                            title="Upload Excel with Student Academic Profiles, CGPA, and Skills"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="8.5" cy="7" r="4"></circle>
                                <line x1="20" y1="8" x2="20" y2="14"></line>
                                <line x1="23" y1="11" x2="17" y2="11"></line>
                            </svg>
                            Import Student Roster (Excel)
                        </button>

                        <button
                            type="button"
                            className="btn-upload-results"
                            onClick={() => openUploadModal(null)}
                            title="Upload Excel with Candidate Gmail & Results"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                            Upload Excel Results
                        </button>

                        <button
                            type="button"
                            className="btn-create-drive"
                            onClick={openCreateModal}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            Create Placement Drive
                        </button>
                    </div>
                </div>

                {/* Main Data Section */}
                <div className="data-panel">
                    {loadingDrives ? (
                        <div className="panel-loading">
                            <div className="spinner-sm"></div>
                            <span>Loading placement drives...</span>
                        </div>
                    ) : filteredDrives.length === 0 ? (
                        <div className="panel-empty">
                            <h3>No Drives Found</h3>
                            <p>Click "Create Placement Drive" to add a new recruitment drive.</p>
                            <button type="button" className="btn-create-drive" onClick={openCreateModal}>
                                Create Drive
                            </button>
                        </div>
                    ) : viewMode === 'table' ? (
                        /* Professional Compact Data Table */
                        <div className="table-responsive">
                            <table className="enterprise-table">
                                <thead>
                                    <tr>
                                        <th>Company</th>
                                        <th>Job Designation</th>
                                        <th>CTC (LPA)</th>
                                        <th>Min CGPA</th>
                                        <th>Eligible Branches</th>
                                        <th>Location</th>
                                        <th>Deadline</th>
                                        <th>Results Count</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredDrives.map(drive => (
                                        <tr key={drive.id}>
                                            <td
                                                className="font-semibold company-interactive-cell"
                                                onClick={() => openViewModal(drive)}
                                                title="Touch company to view complete interview process, round funnels & selected students"
                                            >
                                                <div className="company-interactive-wrap">
                                                    <span className="company-interactive-title">{drive.company_name}</span>
                                                    <span className="round-count-badge">
                                                        {drive.total_rounds || 4} Rounds
                                                    </span>
                                                </div>
                                                {drive.description && (
                                                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '3px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={drive.description}>
                                                        {drive.description}
                                                    </div>
                                                )}
                                            </td>
                                            <td>{drive.job_role}</td>
                                            <td className="ctc-text">{drive.ctc_lpa} LPA</td>
                                            <td>{drive.min_cgpa ? `${drive.min_cgpa} / 10` : 'None'}</td>
                                            <td>
                                                <div className="tag-list">
                                                    {drive.allowed_branches.split(',').map((b, i) => (
                                                        <span key={i} className="mini-tag">{b.trim()}</span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td>{drive.location || 'On Campus'}</td>
                                            <td>{drive.deadline || 'Open'}</td>
                                            <td>
                                                <span className="results-badge" onClick={() => openViewModal(drive)}>
                                                    {drive.results_count || 0} Updated
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`status-badge ${drive.status ? drive.status.toLowerCase() : 'active'}`}>
                                                    {drive.status || 'Active'}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="action-button-group">
                                                    <button
                                                        type="button"
                                                        className="action-btn-alter"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openEditModal(drive);
                                                        }}
                                                        title="Alter company drive, modify number of rounds, descriptions, and criteria"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M12 20h9"></path>
                                                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                                        </svg>
                                                        <span>Alter</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="action-btn-secondary"
                                                        onClick={() => openUploadModal(drive.id)}
                                                        title="Upload Excel results with Gmail & Result"
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                            <polyline points="17 8 12 3 7 8"></polyline>
                                                            <line x1="12" y1="3" x2="12" y2="15"></line>
                                                        </svg>
                                                        <span>Upload</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="action-btn-primary"
                                                        onClick={() => openViewModal(drive)}
                                                        title="View complete interview process, round funnels & selected students"
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <line x1="6" y1="3" x2="6" y2="15"></line>
                                                            <circle cx="18" cy="6" r="3"></circle>
                                                            <circle cx="6" cy="18" r="3"></circle>
                                                            <path d="M18 9a9 9 0 0 1-9 9"></path>
                                                        </svg>
                                                        <span>Process & Results ({drive.results_count || 0})</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        /* Compact Desktop Cards Grid */
                        <div className="cards-grid-laptop">
                            {filteredDrives.map(drive => (
                                <div key={drive.id} className="laptop-card">
                                    <div
                                        className="card-top"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => openViewModal(drive)}
                                        title="Touch to view complete company interview process, funnels & selected students"
                                    >
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <h4 className="card-company" style={{ color: 'var(--primary)', margin: 0 }}>{drive.company_name}</h4>
                                                <span className="round-count-badge">
                                                    {drive.total_rounds || 4} Rounds
                                                </span>
                                            </div>
                                            <span className="card-role">{drive.job_role}</span>
                                        </div>
                                        <span className={`status-badge ${drive.status ? drive.status.toLowerCase() : 'active'}`}>
                                            {drive.status || 'Active'}
                                        </span>
                                    </div>
                                    <div className="card-metrics">
                                        <div>
                                            <span className="lbl">Package</span>
                                            <span className="val ctc-text">{drive.ctc_lpa} LPA</span>
                                        </div>
                                        <div>
                                            <span className="lbl">Rounds</span>
                                            <span className="val" style={{ color: 'var(--warning-text)' }}>{drive.total_rounds || 4} Stages</span>
                                        </div>
                                        <div>
                                            <span className="lbl">Results</span>
                                            <span className="val">{drive.results_count || 0} Records</span>
                                        </div>
                                    </div>
                                    {drive.description && (
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '4px 0 8px', lineHeight: '1.3', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={drive.description}>
                                            {drive.description}
                                        </div>
                                    )}
                                    <div className="card-branches">
                                        {drive.allowed_branches.split(',').map((b, i) => (
                                            <span key={i} className="mini-tag">{b.trim()}</span>
                                        ))}
                                    </div>
                                    <div className="card-actions-row">
                                        <button
                                            type="button"
                                            className="action-btn-alter"
                                            onClick={() => openEditModal(drive)}
                                            title="Alter company drive, change total rounds and descriptions"
                                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M12 20h9"></path>
                                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                            </svg>
                                            <span>Alter</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-card-action outline"
                                            onClick={() => openUploadModal(drive.id)}
                                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                <polyline points="17 8 12 3 7 8"></polyline>
                                                <line x1="12" y1="3" x2="12" y2="15"></line>
                                            </svg>
                                            <span>Upload Excel</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-card-action primary"
                                            onClick={() => openViewModal(drive)}
                                            title="View complete interview process, round funnels & selected students"
                                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="6" y1="3" x2="6" y2="15"></line>
                                                <circle cx="18" cy="6" r="3"></circle>
                                                <circle cx="6" cy="18" r="3"></circle>
                                                <path d="M18 9a9 9 0 0 1-9 9"></path>
                                            </svg>
                                            <span>Process ({drive.results_count || 0})</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                </>
                )}
            </div>

            {/* Create / Alter Drive Modal */}
            <CreateDriveModal
                isOpen={isCreateModalOpen}
                onClose={() => {
                    setIsCreateModalOpen(false);
                    setEditingDrive(null);
                }}
                onDriveCreated={handleDriveCreated}
                driveToEdit={editingDrive}
            />

            {/* Upload Excel Results Modal */}
            <UploadResultsModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                drives={drives}
                initialDriveId={selectedDriveForUpload}
                onResultsUploaded={handleResultsUploaded}
            />

            {/* View Company Recruitment Process & Results Modal */}
            <ViewResultsModal
                isOpen={isViewModalOpen}
                onClose={() => setIsViewModalOpen(false)}
                drive={selectedDriveForView}
                onOpenUpload={() => {
                    setIsViewModalOpen(false);
                    openUploadModal(selectedDriveForView?.id);
                }}
            />

            {/* Upload User Access Modal */}
            <UploadUserAccessModal
                isOpen={isUserAccessModalOpen}
                onClose={() => setIsUserAccessModalOpen(false)}
                onAccessGranted={handleUserAccessGranted}
            />

            {/* Upload Student Roster Modal */}
            <UploadStudentRosterModal
                isOpen={isRosterModalOpen}
                onClose={() => setIsRosterModalOpen(false)}
                onRosterUploaded={handleRosterUploaded}
            />

            {/* Templates Hub Repository Modal */}
            <TemplatesHubModal
                isOpen={isTemplatesModalOpen}
                onClose={() => setIsTemplatesModalOpen(false)}
            />
        </div>
    );
}

function TemplatesHubModal({ isOpen, onClose }) {
    if (!isOpen) return null;

    const templates = [
        {
            title: "User Accounts & Role Access Template",
            badge: "Grant User Access",
            filename_xlsx: "sample_user_access.xlsx",
            filename_csv: "sample_user_access.csv",
            description: "Bulk grant platform credentials for Students, Mentors, Coordinators, Department Heads, and Recruiters.",
            required: ["User Email / gmail *"],
            optional: ["Role (Student, Mentor...)", "Password"]
        },
        {
            title: "Drive Results & Verdicts Template",
            badge: "Upload Excel Results",
            filename_xlsx: "sample_drive_results.xlsx",
            filename_csv: "sample_drive_results.csv",
            description: "Upload candidate evaluations with explicit statuses (Selected, Rejected, On Hold) and scores.",
            required: ["Student Gmail *", "Result Status *"],
            optional: ["Round", "Score", "Student Name"]
        },
        {
            title: "Drive Shortlist Template (Emails Only)",
            badge: "Upload Shortlist",
            filename_xlsx: "sample_drive_shortlist.xlsx",
            filename_csv: "sample_drive_shortlist.csv",
            description: "Upload shortlisted candidate emails to automatically advance them to the next interview round.",
            required: ["Student Gmail *"],
            optional: ["Student Name", "Branch"]
        },
        {
            title: "Student Academic Profiles Roster Template",
            badge: "Student Roster",
            filename_xlsx: "sample_student_roster.xlsx",
            filename_csv: "sample_student_roster.csv",
            description: "Bulk import academic records, CGPA, 10th/12th percentages, and technical skills.",
            required: ["Register Number *", "Full Name *", "Student Email *", "Department *", "CGPA *"],
            optional: ["10th Percentage", "12th Percentage", "Technical Skills"]
        },
        {
            title: "Company Placement Drives Schedule Template",
            badge: "Company Drives",
            filename_xlsx: "sample_company_drives.xlsx",
            filename_csv: "sample_company_drives.csv",
            description: "Bulk schedule on-campus placement drives with company type, CTC LPA, eligibility criteria, and rounds.",
            required: ["Company Name *", "Job Role *", "CTC LPA *"],
            optional: ["Company Type", "Required CGPA", "Allowed Branches", "Total Rounds", "Location", "Drive Date", "Status"]
        }
    ];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-dialog large-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <div>
                        <h3>Coordinator Excel Templates Repository</h3>
                        <p className="modal-sub">Download official sample templates to verify column formats before uploading bulk files</p>
                    </div>
                    <button type="button" className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="templates-hub-list" style={{ marginTop: '14px' }}>
                    {templates.map((tpl, i) => (
                        <div key={i} className="tpl-item-card">
                            <div className="tpl-item-info">
                                <div className="tpl-item-title">
                                    {tpl.title}
                                    <span className="tpl-item-mode">{tpl.badge}</span>
                                </div>
                                <p className="tpl-item-desc">{tpl.description}</p>
                                <div className="template-columns-info" style={{ marginTop: '6px', marginBottom: 0 }}>
                                    {tpl.required.map((req, rIdx) => (
                                        <span key={rIdx} className="col-badge required">{req}</span>
                                    ))}
                                    {tpl.optional.map((opt, oIdx) => (
                                        <span key={oIdx} className="col-badge optional">{opt}</span>
                                    ))}
                                </div>
                            </div>

                            <div className="template-download-actions" style={{ flexDirection: 'column', minWidth: '130px' }}>
                                <a
                                    href={`/api/templates/download/${tpl.filename_xlsx}`}
                                    download={tpl.filename_xlsx}
                                    className="btn-download-tpl excel"
                                    style={{ justifyContent: 'center' }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="7 10 12 15 17 10"></polyline>
                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                    </svg>
                                    Excel (.xlsx)
                                </a>
                                <a
                                    href={`/api/templates/download/${tpl.filename_csv}`}
                                    download={tpl.filename_csv}
                                    className="btn-download-tpl csv"
                                    style={{ justifyContent: 'center' }}
                                >
                                    CSV (.csv)
                                </a>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="modal-foot" style={{ marginTop: '16px' }}>
                    <button type="button" className="btn-submit" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

function StudentTrackingView({ user, showToast }) {
    const [loading, setLoading] = React.useState(true);
    const [students, setStudents] = React.useState([]);
    const [stats, setStats] = React.useState({
        total_students: 0,
        placed_count: 0,
        placement_rate_pct: 0,
        in_process_count: 0,
        at_risk_count: 0,
        interventions_count: 0,
        avg_cgpa: 0
    });

    // Filters
    const [selectedYear, setSelectedYear] = React.useState('All Years');
    const [selectedDept, setSelectedDept] = React.useState('All Departments');
    const [selectedStatus, setSelectedStatus] = React.useState('All Statuses');
    const [searchQuery, setSearchQuery] = React.useState('');

    // Available filter items
    const [availableYears, setAvailableYears] = React.useState(['All Years', '4th Year', '3rd Year', '2nd Year', '1st Year']);
    const [availableDepts, setAvailableDepts] = React.useState(['All Departments', 'CSE', 'IT', 'ECE', 'EEE', 'MECH']);

    // Layout & inspector states
    const [viewMode, setViewMode] = React.useState('split'); // 'split' or 'table'
    const [selectedStudent, setSelectedStudent] = React.useState(null);
    const [inspectorTab, setInspectorTab] = React.useState('process'); // 'process', 'interventions', 'profile'
    const [generatingIntervention, setGeneratingIntervention] = React.useState(false);

    // Fetch cohort data
    const fetchTrackingData = React.useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (selectedYear && selectedYear !== 'All Years') params.append('year', selectedYear);
            if (selectedDept && selectedDept !== 'All Departments') params.append('department', selectedDept);
            if (selectedStatus && selectedStatus !== 'All Statuses') params.append('status', selectedStatus);
            if (searchQuery.trim()) params.append('search', searchQuery.trim());

            const res = await fetch(`/api/coordinator/students-tracking?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                const fetchedStudents = data.students || [];
                setStudents(fetchedStudents);
                if (data.stats) setStats(data.stats);
                if (data.available_years) setAvailableYears(data.available_years);
                if (data.available_departments) setAvailableDepts(data.available_departments);

                // Preserve or update selected student
                setSelectedStudent(prev => {
                    if (!prev && fetchedStudents.length > 0) return fetchedStudents[0];
                    if (prev) {
                        const match = fetchedStudents.find(s => s.student_id === prev.student_id || s.email === prev.email);
                        return match || (fetchedStudents.length > 0 ? fetchedStudents[0] : null);
                    }
                    return null;
                });
            }
        } catch (err) {
            console.error('Failed to load students tracking data:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedYear, selectedDept, selectedStatus, searchQuery]);

    React.useEffect(() => {
        fetchTrackingData();
    }, [fetchTrackingData]);

    // Export current filtered roster to Excel
    const handleExportExcel = () => {
        const params = new URLSearchParams();
        if (selectedYear && selectedYear !== 'All Years') params.append('year', selectedYear);
        if (selectedDept && selectedDept !== 'All Departments') params.append('department', selectedDept);
        if (selectedStatus && selectedStatus !== 'All Statuses') params.append('status', selectedStatus);
        if (searchQuery.trim()) params.append('search', searchQuery.trim());
        params.append('format', 'xlsx');

        window.location.href = `/api/coordinator/export/students-tracking?${params.toString()}`;
        if (showToast) showToast('Downloading students tracking Excel spreadsheet...');
    };

    // Quick Trigger/Generate Intervention
    const handleTriggerIntervention = async (student) => {
        if (!student) return;
        setGeneratingIntervention(true);
        try {
            const res = await fetch('/api/interventions/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...window.interventionHeaders(user)
                },
                body: JSON.stringify({
                    student_id: student.student_id,
                    gmail: student.email
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                if (showToast) showToast(`Generated AI Intervention plan for ${student.name}.`);
                await fetchTrackingData();
                setInspectorTab('interventions');
            } else {
                if (showToast) showToast(data.detail || 'Could not generate intervention.');
            }
        } catch (err) {
            console.error('Failed to trigger intervention:', err);
            if (showToast) showToast('Failed to trigger intervention.');
        } finally {
            setGeneratingIntervention(false);
        }
    };

    // Toggle Action Task status locally for responsiveness
    const handleToggleTask = (taskIndex, ivIndex) => {
        if (!selectedStudent) return;
        setSelectedStudent(prev => {
            const updated = { ...prev };
            const ivs = [...(updated.interventions || [])];
            if (ivs[ivIndex] && ivs[ivIndex].actions && ivs[ivIndex].actions[taskIndex]) {
                const actions = [...ivs[ivIndex].actions];
                actions[taskIndex] = { ...actions[taskIndex], completed: !actions[taskIndex].completed };
                ivs[ivIndex] = { ...ivs[ivIndex], actions };
                updated.interventions = ivs;
            }
            return updated;
        });
        if (showToast) showToast('Action checklist task updated.');
    };

    return (
        <div className="student-tracking-container">
            {/* Top Filter and Controls Panel */}
            <div className="tracking-filter-panel">
                <div className="filter-row-top">
                    <div>
                        <div className="filter-section-title">Academic Year Filter</div>
                        <div className="filter-pill-group">
                            {availableYears.map(yr => (
                                <button
                                    key={yr}
                                    type="button"
                                    className={`filter-pill ${selectedYear === yr ? 'active' : ''}`}
                                    onClick={() => setSelectedYear(yr)}
                                >
                                    {yr}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="tracking-search-bar">
                        <div className="tracking-input-wrapper">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            <input
                                type="text"
                                placeholder="Search by name, reg no, email, skill, company..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <button
                            type="button"
                            className="btn-tracking-export"
                            onClick={handleExportExcel}
                            title="Download complete cohort Excel report with interview stages & interventions"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Export Excel (.xlsx)
                        </button>
                    </div>
                </div>

                <div className="filter-row-top" style={{ borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
                    <div>
                        <div className="filter-section-title">Department Filter</div>
                        <div className="filter-pill-group">
                            {availableDepts.map(dept => (
                                <button
                                    key={dept}
                                    type="button"
                                    className={`filter-pill ${selectedDept === dept ? 'active' : ''}`}
                                    onClick={() => setSelectedDept(dept)}
                                >
                                    {dept}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div>
                            <span className="filter-section-title" style={{ marginRight: '8px' }}>Status:</span>
                            <select
                                value={selectedStatus}
                                onChange={(e) => setSelectedStatus(e.target.value)}
                                style={{
                                    background: 'var(--panel-hover)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '6px',
                                    padding: '6px 12px',
                                    fontSize: '0.8rem'
                                }}
                            >
                                <option value="All Statuses">All Statuses</option>
                                <option value="Placed">Placed</option>
                                <option value="In Process">In Process</option>
                                <option value="At Risk">At Risk / Remediation</option>
                                <option value="Not Started">Not Started</option>
                            </select>
                        </div>

                        <div className="view-toggle-group">
                            <button
                                type="button"
                                className={`view-btn ${viewMode === 'split' ? 'active' : ''}`}
                                onClick={() => setViewMode('split')}
                                title="Split Side-by-Side 360° Inspector View"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="12" y1="3" x2="12" y2="21"></line>
                                </svg>
                                <span>Split Side</span>
                            </button>
                            <button
                                type="button"
                                className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
                                onClick={() => setViewMode('table')}
                                title="Comprehensive Enterprise Table"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="3" y1="6" x2="21" y2="6"></line>
                                    <line x1="3" y1="12" x2="21" y2="12"></line>
                                    <line x1="3" y1="18" x2="21" y2="18"></line>
                                </svg>
                                <span>Full Table</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* KPI Summary Banner */}
            <div className="tracking-kpi-bar">
                <div className="kpi-card-track">
                    <span className="kpi-val">{stats.total_students}</span>
                    <span className="kpi-lbl">Students in View ({selectedYear})</span>
                </div>
                <div className="kpi-card-track kpi-placed">
                    <span className="kpi-val" style={{ color: 'var(--success-text)' }}>
                        {stats.placed_count} <span style={{ fontSize: '1rem', fontWeight: '500' }}>({stats.placement_rate_pct}%)</span>
                    </span>
                    <span className="kpi-lbl">Placed / Offers Accepted</span>
                </div>
                <div className="kpi-card-track kpi-process">
                    <span className="kpi-val" style={{ color: 'var(--primary)' }}>{stats.in_process_count}</span>
                    <span className="kpi-lbl">In Active Rounds</span>
                </div>
                <div className="kpi-card-track kpi-risk">
                    <span className="kpi-val" style={{ color: 'var(--warning-text)' }}>{stats.at_risk_count}</span>
                    <span className="kpi-lbl">Needs Academic Support</span>
                </div>
                <div className="kpi-card-track kpi-interventions">
                    <span className="kpi-val" style={{ color: 'var(--error-text)' }}>{stats.interventions_count}</span>
                    <span className="kpi-lbl">Active Interventions</span>
                </div>
                <div className="kpi-card-track">
                    <span className="kpi-val" style={{ color: 'var(--primary)' }}>{stats.avg_cgpa}</span>
                    <span className="kpi-lbl">Average CGPA</span>
                </div>
            </div>

            {/* Content Display: Split View vs Full Table View */}
            {loading ? (
                <div className="panel-loading" style={{ background: 'var(--panel-bg)', borderRadius: '12px', padding: '40px' }}>
                    <div className="spinner-sm"></div>
                    <span>Loading student academic & placement profiles...</span>
                </div>
            ) : students.length === 0 ? (
                <div className="panel-empty" style={{ background: 'var(--panel-bg)', borderRadius: '12px', padding: '40px' }}>
                    <h3>No Students Found</h3>
                    <p>No student profiles match the filter: Year: <strong>{selectedYear}</strong>, Department: <strong>{selectedDept}</strong>.</p>
                    <button type="button" className="btn-tracking-export" onClick={() => { setSelectedYear('All Years'); setSelectedDept('All Departments'); setSelectedStatus('All Statuses'); setSearchQuery(''); }}>
                        Reset Filters
                    </button>
                </div>
            ) : viewMode === 'split' ? (
                /* Split Side-by-Side ("The Separate Side") View */
                <div className="split-side-layout">
                    {/* Left Column: Students Roster List */}
                    <div className="side-left-roster">
                        <div className="side-left-header">
                            <h3>Students Directory ({students.length})</h3>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Click to inspect</span>
                        </div>

                        {students.map(s => {
                            const isSelected = selectedStudent && (selectedStudent.student_id === s.student_id || selectedStudent.email === s.email);
                            const initials = (s.name || 'S').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                            return (
                                <div
                                    key={s.student_id || s.email}
                                    className={`student-card-item ${isSelected ? 'selected' : ''}`}
                                    onClick={() => setSelectedStudent(s)}
                                >
                                    <div className="card-top-row">
                                        <div className="avatar-circle-sm">{initials}</div>
                                        <div className="card-student-info">
                                            <div className="card-student-name">{s.name}</div>
                                            <div className="card-student-reg">{s.register_number} • {s.email}</div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <div className="card-student-cgpa">{s.cgpa}</div>
                                            <a
                                                href={`/api/coordinator/export/student/${encodeURIComponent(s.register_number || s.email)}`}
                                                download
                                                onClick={(e) => e.stopPropagation()}
                                                className="btn-card-dossier-download"
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '3px',
                                                    padding: '3px 8px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: '600',
                                                    borderRadius: '5px',
                                                    background: 'var(--primary-light)',
                                                    color: 'var(--primary)',
                                                    border: '1px solid var(--primary-subtle)',
                                                    textDecoration: 'none'
                                                }}
                                                title={`Download ${s.name}'s complete Excel dossier template`}
                                            >
                                                .xlsx
                                            </a>
                                        </div>
                                    </div>

                                    <div className="card-tags-row">
                                        <span className="dept-tag">{s.department}</span>
                                        <span className="year-tag">{s.year}</span>

                                        {s.placement_status === 'Placed' ? (
                                            <span className="status-pill-placed">
                                                Placed {s.placed_company ? `(${s.placed_company})` : ''}
                                            </span>
                                        ) : s.placement_status === 'In Process' ? (
                                            <span className="status-pill-in-process">
                                                In Rounds ({s.drives_count} Drives)
                                            </span>
                                        ) : s.placement_status === 'At Risk' ? (
                                            <span className="status-pill-at-risk">
                                                Needs Support
                                            </span>
                                        ) : (
                                            <span className="status-pill-neutral">
                                                Not Started
                                            </span>
                                        )}

                                        {s.open_interventions_count > 0 && (
                                            <span className="risk-alert-chip">
                                                {s.open_interventions_count} Intervention{s.open_interventions_count > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Right Column ("The Separate Side"): Student 360° Inspector Panel */}
                    <div className="side-right-inspector">
                        {selectedStudent ? (
                            <>
                                {/* Student Hero Card */}
                                <div className="inspector-hero">
                                    <div className="hero-left">
                                        <div className="hero-avatar">
                                            {(selectedStudent.name || 'S').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                        </div>
                                        <div className="hero-titles">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                                <h2>{selectedStudent.name}</h2>
                                                <a
                                                    href={`/api/coordinator/export/student/${encodeURIComponent(selectedStudent.register_number || selectedStudent.email)}`}
                                                    download
                                                    className="btn-download-dossier"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '5px 12px',
                                                        background: 'linear-gradient(135deg, var(--primary-hover), var(--primary))',
                                                        color: '#fff',
                                                        borderRadius: '7px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: '600',
                                                        textDecoration: 'none',
                                                        border: '1px solid var(--primary)',
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                                                        cursor: 'pointer'
                                                    }}
                                                    title={`Download ${selectedStudent.name}'s complete placement & intervention Excel dossier template`}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                        <polyline points="7 10 12 15 17 10"></polyline>
                                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                                    </svg>
                                                    <span>Download Dossier (.xlsx)</span>
                                                </a>
                                            </div>
                                            <div className="hero-sub">
                                                <span><strong>Reg:</strong> {selectedStudent.register_number}</span>
                                                <span>•</span>
                                                <span><strong>Dept:</strong> {selectedStudent.department}</span>
                                                <span>•</span>
                                                <span><strong>Year:</strong> {selectedStudent.year}</span>
                                                <span>•</span>
                                                <span>{selectedStudent.email}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="hero-right-metrics">
                                        <div className="hero-metric-item">
                                            <div className="hero-metric-val" style={{ color: 'var(--primary)' }}>{selectedStudent.cgpa}</div>
                                            <div className="hero-metric-lbl">CGPA</div>
                                        </div>
                                        <div className="hero-metric-item">
                                            <div className="hero-metric-val">{selectedStudent.tenth_percentage || 'N/A'}%</div>
                                            <div className="hero-metric-lbl">10th Std</div>
                                        </div>
                                        <div className="hero-metric-item">
                                            <div className="hero-metric-val">{selectedStudent.twelfth_percentage || 'N/A'}%</div>
                                            <div className="hero-metric-lbl">12th Std</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Placement Status Alert Banner */}
                                {selectedStudent.placement_status === 'Placed' ? (
                                    <div style={{
                                        background: 'linear-gradient(135deg, var(--success-bg), var(--success-bg))',
                                        border: '1px solid var(--success-border)',
                                        borderRadius: '10px',
                                        padding: '14px 18px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div>
                                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--success-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Placed & Selected
                                            </span>
                                            <div style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>
                                                {selectedStudent.placed_company || 'Campus Partner'} • {selectedStudent.placed_role || 'Software Engineer'}
                                            </div>
                                        </div>
                                        {selectedStudent.placed_package && (
                                            <div style={{
                                                background: 'var(--success-bg)',
                                                color: 'var(--success-text)',
                                                border: '1px solid var(--success-border)',
                                                padding: '6px 14px',
                                                borderRadius: '8px',
                                                fontWeight: '700',
                                                fontSize: '1rem'
                                            }}>
                                                ₹{selectedStudent.placed_package} LPA
                                            </div>
                                        )}
                                    </div>
                                ) : selectedStudent.placement_status === 'In Process' ? (
                                    <div style={{
                                        background: 'var(--primary-light)',
                                        border: '1px solid var(--primary-subtle)',
                                        borderRadius: '10px',
                                        padding: '12px 18px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div>
                                            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--primary)', textTransform: 'uppercase' }}>
                                                In Recruitment Pipeline
                                            </span>
                                            <div style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)', marginTop: '2px' }}>
                                                Participating in {selectedStudent.drives_count} active placement drive(s)
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{
                                        background: 'var(--warning-bg)',
                                        border: '1px solid var(--warning-border)',
                                        borderRadius: '10px',
                                        padding: '12px 18px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div>
                                            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--warning-text)', textTransform: 'uppercase' }}>
                                                Under Mentoring & Remediation
                                            </span>
                                            <div style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)', marginTop: '2px' }}>
                                                {selectedStudent.open_interventions_count > 0 ? `${selectedStudent.open_interventions_count} active intervention plan in progress` : 'Needs mock interview preparation'}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="btn-create-drive"
                                            style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                                            onClick={() => handleTriggerIntervention(selectedStudent)}
                                            disabled={generatingIntervention}
                                        >
                                            {generatingIntervention ? 'Generating...' : 'Trigger AI Plan'}
                                        </button>
                                    </div>
                                )}

                                {/* Inspector Sub-Tabs Navigation */}
                                <div className="inspector-tab-nav">
                                    <button
                                        type="button"
                                        className={`inspector-tab-btn ${inspectorTab === 'process' ? 'active' : ''}`}
                                        onClick={() => setInspectorTab('process')}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="6" y1="3" x2="6" y2="15"></line>
                                            <circle cx="18" cy="6" r="3"></circle>
                                            <circle cx="6" cy="18" r="3"></circle>
                                            <path d="M18 9a9 9 0 0 1-9 9"></path>
                                        </svg>
                                        <span>Interview Process Funnel ({selectedStudent.process_history.length})</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`inspector-tab-btn ${inspectorTab === 'interventions' ? 'active' : ''}`}
                                        onClick={() => setInspectorTab('interventions')}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                            <line x1="12" y1="8" x2="12" y2="12"></line>
                                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                        </svg>
                                        <span>Academic Interventions ({selectedStudent.interventions.length})</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`inspector-tab-btn ${inspectorTab === 'profile' ? 'active' : ''}`}
                                        onClick={() => setInspectorTab('profile')}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                            <circle cx="12" cy="7" r="4"></circle>
                                        </svg>
                                        <span>Profile & Skills</span>
                                    </button>
                                </div>

                                {/* Tab 1: Interview Process Pipeline */}
                                {inspectorTab === 'process' && (
                                    <div className="process-timeline-list">
                                        {selectedStudent.process_history.length === 0 ? (
                                            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                <p>This student has not yet participated in campus recruitment drives.</p>
                                            </div>
                                        ) : (
                                            selectedStudent.process_history.map((item, idx) => {
                                                const isSelectedVerdict = (item.result || '').toLowerCase().includes('selected');
                                                const isRejectedVerdict = (item.result || '').toLowerCase().includes('rejected');

                                                return (
                                                    <div key={idx} className="process-drive-card">
                                                        <div className="drive-header-row">
                                                            <div>
                                                                <span className="drive-company-name">{item.company_name}</span>
                                                                <span className="drive-role-title"> • {item.job_role}</span>
                                                            </div>
                                                            {item.ctc_lpa && (
                                                                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--success-text)' }}>
                                                                    ₹{item.ctc_lpa} LPA
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="round-status-box">
                                                            <div className="round-status-head">
                                                                <span>Stage: Round {item.round}</span>
                                                                {isSelectedVerdict ? (
                                                                    <span className="status-pill-placed">{item.result}</span>
                                                                ) : isRejectedVerdict ? (
                                                                    <span className="status-pill-at-risk">{item.result}</span>
                                                                ) : (
                                                                    <span className="status-pill-in-process">{item.result}</span>
                                                                )}
                                                            </div>

                                                            {item.score !== null && item.score !== undefined && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Evaluation Score:</span>
                                                                    <span className="round-score-pill">{item.score} / {item.max_score || 100}</span>
                                                                </div>
                                                            )}

                                                            {item.feedback && (
                                                                <div className="round-feedback-text">
                                                                    <strong>Interviewer Notes:</strong> "{item.feedback}"
                                                                </div>
                                                            )}

                                                            {item.weakness_area && (
                                                                <div style={{ fontSize: '0.78rem', color: 'var(--error-text)' }}>
                                                                    <strong>Identified Gap:</strong> {item.weakness_area}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}

                                {/* Tab 2: Academic & Placement Interventions */}
                                {inspectorTab === 'interventions' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                {selectedStudent.interventions.length} active intervention plan(s) recorded
                                            </span>
                                            <button
                                                type="button"
                                                className="btn-create-drive"
                                                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                                                onClick={() => handleTriggerIntervention(selectedStudent)}
                                                disabled={generatingIntervention}
                                            >
                                                {generatingIntervention ? 'Generating...' : '+ Generate New AI Plan'}
                                            </button>
                                        </div>

                                        {selectedStudent.interventions.length === 0 ? (
                                            <div style={{
                                                padding: '30px',
                                                textAlign: 'center',
                                                background: 'var(--success-bg)',
                                                border: '1px solid var(--success-border)',
                                                borderRadius: '10px'
                                            }}>
                                                <h4 style={{ color: 'var(--success-text)', marginBottom: '6px' }}>Clear Academic & Placement Record</h4>
                                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                    This student does not currently have any remediation alerts. All assessment scores are satisfactory.
                                                </p>
                                            </div>
                                        ) : (
                                            selectedStudent.interventions.map((iv, ivIdx) => {
                                                const isHigh = (iv.priority || '').toUpperCase() === 'HIGH';
                                                return (
                                                    <div key={iv.id || ivIdx} className={`intervention-card-track ${isHigh ? '' : 'medium-risk'}`}>
                                                        <div className="intervention-title-row">
                                                            <h4>{iv.title}</h4>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span className={isHigh ? 'risk-alert-chip' : 'status-pill-at-risk'}>
                                                                    Priority: {iv.priority}
                                                                </span>
                                                                <span style={{
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: '600',
                                                                    padding: '2px 8px',
                                                                    borderRadius: '4px',
                                                                    background: iv.status === 'RESOLVED' ? 'var(--success-bg)' : 'var(--primary-light)',
                                                                    color: iv.status === 'RESOLVED' ? 'var(--success-text)' : 'var(--primary)'
                                                                }}>
                                                                    {iv.status}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {iv.failure_summary && (
                                                            <div style={{
                                                                fontSize: '0.82rem',
                                                                color: 'var(--error-text)',
                                                                background: 'var(--error-bg)',
                                                                padding: '8px 12px',
                                                                borderRadius: '6px'
                                                            }}>
                                                                <strong>Diagnostic Assessment:</strong> {iv.failure_summary}
                                                            </div>
                                                        )}

                                                        {iv.ai_analysis && (
                                                            <div style={{
                                                                fontSize: '0.82rem',
                                                                color: 'var(--primary)',
                                                                background: 'var(--primary-light)',
                                                                padding: '8px 12px',
                                                                borderRadius: '6px'
                                                            }}>
                                                                <strong>AI Recommended Path:</strong> {iv.ai_analysis}
                                                            </div>
                                                        )}

                                                        {/* Action Tasks Checklist */}
                                                        {iv.actions && iv.actions.length > 0 && (
                                                            <div>
                                                                <div className="filter-section-title" style={{ marginTop: '4px', marginBottom: '8px' }}>
                                                                    Action Items Checklist ({iv.actions.filter(a => a.completed).length}/{iv.actions.length} Completed):
                                                                </div>
                                                                <div className="action-checklist">
                                                                    {iv.actions.map((act, actIdx) => (
                                                                        <div key={act.id || actIdx} className={`action-task-item ${act.completed ? 'completed' : ''}`}>
                                                                            <input
                                                                                type="checkbox"
                                                                                className="action-checkbox"
                                                                                checked={!!act.completed}
                                                                                onChange={() => handleToggleTask(actIdx, ivIdx)}
                                                                            />
                                                                            <div className="action-task-content">
                                                                                <div className="action-task-title" style={{ textDecoration: act.completed ? 'line-through' : 'none' }}>
                                                                                    {act.title}
                                                                                </div>
                                                                                <div className="action-task-meta">
                                                                                    {act.weakness_area && <span>Focus: {act.weakness_area}</span>}
                                                                                    {act.resources && <span>Resource: {act.resources}</span>}
                                                                                    {act.due_date && <span>Due: {act.due_date}</span>}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}

                                {/* Tab 3: Profile & Technical Skills */}
                                {inspectorTab === 'profile' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div style={{ background: 'var(--panel-hover)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                                            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '10px' }}>Technical Skillset</h4>
                                            {selectedStudent.skills_list && selectedStudent.skills_list.length > 0 ? (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    {selectedStudent.skills_list.map((sk, skIdx) => (
                                                        <span
                                                            key={skIdx}
                                                            style={{
                                                                background: 'var(--primary-light)',
                                                                color: 'var(--primary)',
                                                                border: '1px solid var(--primary-subtle)',
                                                                padding: '4px 10px',
                                                                borderRadius: '6px',
                                                                fontSize: '0.8rem',
                                                                fontWeight: '600'
                                                            }}
                                                        >
                                                            {sk}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No technical skills registered.</span>
                                            )}
                                        </div>

                                        <div style={{ background: 'var(--panel-hover)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                                            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '10px' }}>Assigned Mentors & Notes</h4>
                                            {selectedStudent.mentor_notes && selectedStudent.mentor_notes.length > 0 ? (
                                                selectedStudent.mentor_notes.map((mn, mnIdx) => (
                                                    <div key={mn.note_id || mnIdx} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{mn.content}</div>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>{mn.created_at}</div>
                                                    </div>
                                                ))
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No mentor notes logged yet for this candidate.</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                Select a student from the left directory to inspect their full 360° interview journey and intervention records.
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* Full Enterprise Roster Table View */
                <div className="tracking-table-container">
                    <table className="enterprise-table">
                        <thead>
                            <tr>
                                <th>Register No</th>
                                <th>Student Name</th>
                                <th>Department</th>
                                <th>Year</th>
                                <th>CGPA</th>
                                <th>Placement Status</th>
                                <th>Offer / Current Stage</th>
                                <th>Interventions</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.map(s => (
                                <tr key={s.student_id || s.email}>
                                    <td><strong>{s.register_number}</strong></td>
                                    <td>
                                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{s.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.email}</div>
                                    </td>
                                    <td><span className="dept-tag">{s.department}</span></td>
                                    <td><span className="year-tag">{s.year}</span></td>
                                    <td><strong>{s.cgpa}</strong></td>
                                    <td>
                                        {s.placement_status === 'Placed' ? (
                                            <span className="status-pill-placed">Placed</span>
                                        ) : s.placement_status === 'In Process' ? (
                                            <span className="status-pill-in-process">In Process</span>
                                        ) : s.placement_status === 'At Risk' ? (
                                            <span className="status-pill-at-risk">At Risk</span>
                                        ) : (
                                            <span className="status-pill-neutral">Not Started</span>
                                        )}
                                    </td>
                                    <td>
                                        {s.placed_company ? (
                                            <span style={{ color: 'var(--success-text)', fontWeight: '600' }}>
                                                {s.placed_company} ({s.placed_package ? `₹${s.placed_package} LPA` : 'Selected'})
                                            </span>
                                        ) : s.process_history.length > 0 ? (
                                            <span>
                                                {s.process_history[0].company_name} (Round {s.process_history[0].round})
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                                        )}
                                    </td>
                                    <td>
                                        {s.interventions.length > 0 ? (
                                            <span className="risk-alert-chip">
                                                {s.interventions.length} Plan ({s.highest_risk})
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--success-text)', fontSize: '0.8rem' }}>Clear</span>
                                        )}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <button
                                                type="button"
                                                className="btn-inspect-student"
                                                onClick={() => {
                                                    setSelectedStudent(s);
                                                    setViewMode('split');
                                                }}
                                            >
                                                Inspect 360°
                                            </button>
                                            <a
                                                href={`/api/coordinator/export/student/${encodeURIComponent(s.register_number || s.email)}`}
                                                download
                                                className="btn-inspect-student"
                                                style={{
                                                    background: 'var(--success-bg)',
                                                    color: 'var(--success-text)',
                                                    borderColor: 'var(--success-border)',
                                                    textDecoration: 'none',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '5px 9px'
                                                }}
                                                title={`Download ${s.name}'s individual Excel dossier`}
                                            >
                                                .xlsx
                                            </a>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

window.StudentTrackingView = StudentTrackingView;

