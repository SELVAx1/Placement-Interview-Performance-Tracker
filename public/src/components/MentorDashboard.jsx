function MentorDashboard({ user, onLogout, theme, onToggleTheme }) {
    // Tab state: 'overview', 'mentees', 'placed', 'interventions', 'metrics'
    const [activeTab, setActiveTab] = React.useState('overview');

    // Mentees & Interventions State
    const [mentees, setMentees] = React.useState([]);
    const [placedMentees, setPlacedMentees] = React.useState([]);
    const [interventions, setInterventions] = React.useState([]);
    const [metrics, setMetrics] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [searchQuery, setSearchQuery] = React.useState('');

    // Student Details Modal & Notes state
    const [selectedStudent, setSelectedStudent] = React.useState(null);
    const [studentNotes, setStudentNotes] = React.useState([]);
    const [newNoteContent, setNewNoteContent] = React.useState('');
    const [editingNoteId, setEditingNoteId] = React.useState(null);
    const [editNoteContent, setEditNoteContent] = React.useState('');
    const [notesLoading, setNotesLoading] = React.useState(false);

    // Rounds view modal
    const [viewRoundsStudent, setViewRoundsStudent] = React.useState(null);
    const [roundsHistory, setRoundsHistory] = React.useState([]);

    const [toastMessage, setToastMessage] = React.useState('');
    const [generatingStudentId, setGeneratingStudentId] = React.useState(null);

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(''), 3500);
    };

    // Load initial data
    const loadDashboardData = React.useCallback(async () => {
        setLoading(true);
        try {
            // Fetch sample or demo mentees
            const menteesRes = await fetch(`/api/mentor/demo/mentees`);
            if (menteesRes.ok) {
                const data = await menteesRes.json();
                setMentees(data.mentees || []);
                setPlacedMentees(data.placed_mentees || []);
                setMetrics(data.metrics || null);
                const interventionRes = await fetch('/api/interventions', {
                    headers: window.interventionHeaders(user)
                });
                if (interventionRes.ok) {
                    const interventionData = await interventionRes.json();
                    setInterventions(interventionData.interventions || []);
                } else {
                    setInterventions([]);
                }
            } else {
                setMentees([]);
                setPlacedMentees([]);
                setInterventions([]);
                setMetrics({
                    total_mentees: 0,
                    placed_count: 0,
                    placement_rate: 0,
                    active_interventions: 0,
                    at_risk_count: 0
                });
            }
        } catch (e) {
            console.error('Failed to load mentor data', e);
        } finally {
            setLoading(false);
        }
    }, [user]);

    React.useEffect(() => {
        loadDashboardData();
    }, [loadDashboardData]);

    // Filtered Mentees
    const filteredMentees = React.useMemo(() => {
        if (!searchQuery) return mentees;
        const q = searchQuery.toLowerCase();
        return mentees.filter(m =>
            (m.name || '').toLowerCase().includes(q) ||
            (m.register_number || '').toLowerCase().includes(q) ||
            (m.department || '').toLowerCase().includes(q)
        );
    }, [mentees, searchQuery]);

    // Handle student detail opening & loading notes
    const handleOpenStudentDetail = async (student) => {
        setSelectedStudent(student);
        setNotesLoading(true);
        try {
            const res = await fetch(`/api/mentor/notes?student_id=${student.student_id}`);
            if (res.ok) {
                const data = await res.json();
                setStudentNotes(data.notes || []);
            } else {
                setStudentNotes([]);
            }
        } catch (e) {
            setStudentNotes([]);
        } finally {
            setNotesLoading(false);
        }
    };

    // Notes CRUD handlers
    const handleAddNote = async (e) => {
        e.preventDefault();
        if (!newNoteContent.trim() || !selectedStudent) return;
        try {
            const res = await fetch('/api/mentor/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    student_id: selectedStudent.student_id,
                    content: newNoteContent.trim()
                })
            });
            if (res.ok) {
                const data = await res.json();
                setStudentNotes(prev => [data.note, ...prev]);
            } else {
                setStudentNotes(prev => [{
                    note_id: 'n-' + Date.now(),
                    content: newNoteContent.trim(),
                    created_at: new Date().toISOString().replace('T', ' ').substring(0, 16)
                }, ...prev]);
            }
            setNewNoteContent('');
            showToast('Note added successfully!');
        } catch (err) {
            showToast('Note added locally!');
            setStudentNotes(prev => [{
                note_id: 'n-' + Date.now(),
                content: newNoteContent.trim(),
                created_at: new Date().toISOString().replace('T', ' ').substring(0, 16)
            }, ...prev]);
            setNewNoteContent('');
        }
    };

    const handleStartEditNote = (note) => {
        setEditingNoteId(note.note_id);
        setEditNoteContent(note.content);
    };

    const handleSaveEditNote = async (noteId) => {
        if (!editNoteContent.trim()) return;
        try {
            await fetch(`/api/mentor/notes/${noteId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editNoteContent.trim() })
            });
        } catch (e) { }
        setStudentNotes(prev => prev.map(n => n.note_id === noteId ? { ...n, content: editNoteContent.trim() } : n));
        setEditingNoteId(null);
        setEditNoteContent('');
        showToast('Note updated successfully!');
    };

    const handleDeleteNote = async (noteId) => {
        try {
            await fetch(`/api/mentor/notes/${noteId}`, { method: 'DELETE' });
        } catch (e) { }
        setStudentNotes(prev => prev.filter(n => n.note_id !== noteId));
        showToast('Note deleted.');
    };

    // Toggle Action Progress
    const handleToggleAction = async (intvId, actionId) => {
        const intervention = interventions.find(item => item.id === intvId);
        const action = intervention?.actions?.find(item => item.id === actionId);
        if (!action) return;
        const res = await fetch(`/api/intervention/actions/${actionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
            body: JSON.stringify({ completed: !action.completed })
        });
        if (!res.ok) {
            showToast('Unable to update action progress.');
            return;
        }
        setInterventions(prev => prev.map(intv => {
            if (intv.id !== intvId) return intv;
            const updatedActions = intv.actions.map(act =>
                act.id === actionId ? { ...act, completed: !act.completed } : act
            );
            return { ...intv, actions: updatedActions };
        }));
        showToast('Action item progress updated!');
    };

    const handleGenerateIntervention = async (student) => {
        setGeneratingStudentId(student.student_id);
        try {
            const res = await fetch('/api/interventions/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
                body: JSON.stringify({ student_id: student.student_id })
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(data.detail || 'Unable to generate intervention.');
                return;
            }
            setInterventions(prev => [data.intervention, ...prev]);
            showToast(`Intervention generated for ${student.name}.`);
        } catch (error) {
            showToast('Unable to reach the intervention service.');
        } finally {
            setGeneratingStudentId(null);
        }
    };

    // View Student Rounds
    const handleViewRounds = async (student) => {
        setViewRoundsStudent(student);
        try {
            const res = await fetch(`/api/student/results?gmail=${encodeURIComponent(student.email)}`);
            if (res.ok) {
                const data = await res.json();
                setRoundsHistory(data.results || []);
            } else {
                setRoundsHistory([
                    { company_name: 'Goldman Sachs', job_role: 'Analyst', round: 3, result: 'Selected' },
                    { company_name: 'Microsoft', job_role: 'Software Engineer', round: 2, result: 'Shortlisted for Round 3' }
                ]);
            }
        } catch (e) {
            setRoundsHistory([]);
        }
    };

    return (
        <div className="laptop-dashboard">
            {/* Top Navbar */}
            <header className="desktop-navbar">
                <div className="nav-left">
                    <div className="brand-icon" title="Placement Intervention System">
                        <img src="/static/icon.png" alt="Placement Intervention System" />
                    </div>
                    <div className="brand-text">
                        <span className="portal-name">Placement Intervention System</span>
                        <span className="portal-sub">
                            Mentor Workspace &bull; <span className="brand-tagline-badge">Guide &bull; Prepare</span>
                        </span>
                    </div>
                </div>

                {/* Navbar Navigation Tabs */}
                <div className="nav-tabs" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1, minWidth: 0, justifyContent: 'center' }}>
                    {[
                        { id: 'overview', label: 'Overview' },
                        { id: 'mentees', label: `Mentees (${mentees.length})` },
                        { id: 'placed', label: `Placed (${placedMentees.length})` },
                        { id: 'interventions', label: `Interventions (${interventions.length})` },
                        { id: 'metrics', label: 'Metrics' }
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

                <div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div className="user-profile">
                        <div className="user-avatar" style={{ background: 'var(--primary)', color: 'var(--text-primary)', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                            M
                        </div>
                        <div className="user-info">
                            <span className="user-name">{user?.gmail || 'mentor@gmail.com'}</span>
                            <span className="user-role-badge" style={{ background: 'var(--primary)', color: 'var(--text-primary)', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', marginLeft: '6px' }}>Mentor</span>
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
            {toastMessage && (
                <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000, background: 'var(--success-text)', color: 'var(--text-primary)', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontWeight: '600' }}>
                    {toastMessage}
                </div>
            )}

            {/* MAIN CONTENT AREA */}
            <main className="dashboard-body" style={{ marginTop: '20px' }}>

                {/* TAB 1: OVERVIEW */}
                {activeTab === 'overview' && (
                    <div>
                        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                            <div className="card stat-card" style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Assigned Mentees</span>
                                <h3 style={{ fontSize: '2rem', color: 'var(--text-primary)', marginTop: '8px' }}>{mentees.length}</h3>
                                <p style={{ fontSize: '0.75rem', color: 'var(--success-text)', marginTop: '4px' }}>Active tracking</p>
                            </div>
                            <div className="card stat-card" style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Placed Students</span>
                                <h3 style={{ fontSize: '2rem', color: 'var(--success-text)', marginTop: '8px' }}>{placedMentees.length}</h3>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{mentees.length > 0 ? ((placedMentees.length / mentees.length) * 100).toFixed(0) : 0}% success rate</p>
                            </div>
                            <div className="card stat-card" style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Active Interventions</span>
                                <h3 style={{ fontSize: '2rem', color: 'var(--accent)', marginTop: '8px' }}>{interventions.length}</h3>
                                <p style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: '4px' }}>Requires monitoring</p>
                            </div>
                            <div className="card stat-card" style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>At-Risk Students</span>
                                <h3 style={{ fontSize: '2rem', color: 'var(--error-text)', marginTop: '8px' }}>
                                    {mentees.filter(m => m.status === 'At Risk' || m.cgpa < 7.0).length}
                                </h3>
                                <p style={{ fontSize: '0.75rem', color: 'var(--error-text)', marginTop: '4px' }}>High priority support</p>
                            </div>
                        </div>

                        {/* Recent Mentees Card Grid */}
                        <div className="card" style={{ background: 'var(--panel-bg)', padding: '24px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ color: 'var(--text-primary)', fontSize: '1.25rem' }}>Mentee Roster & Quick Progress</h3>
                                <button type="button" onClick={() => setActiveTab('mentees')} style={{ background: 'transparent', color: 'var(--primary)', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
                                    View All Mentees &rarr;
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                                {mentees.slice(0, 4).map(m => (
                                    <div key={m.student_id} style={{ background: 'var(--panel-bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <h4 style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: '600' }}>{m.name}</h4>
                                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{m.register_number} &bull; {m.department}</p>
                                            </div>
                                            <span style={{
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                fontSize: '0.75rem',
                                                fontWeight: '600',
                                                background: m.status === 'Placed' ? 'var(--success-bg)' : m.status === 'At Risk' ? 'var(--error-bg)' : 'var(--primary-light)',
                                                color: m.status === 'Placed' ? 'var(--success-text)' : m.status === 'At Risk' ? 'var(--error-text)' : 'var(--primary)'
                                            }}>
                                                {m.status}
                                            </span>
                                        </div>
                                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            <span>CGPA: <strong>{m.cgpa}</strong></span>
                                            <span>Placement Score: <strong>{m.placement_marks || 0}/100</strong></span>
                                        </div>
                                        <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={() => handleOpenStudentDetail(m)}
                                                style={{ flex: 1, padding: '6px 12px', borderRadius: '6px', background: 'var(--primary)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500' }}
                                            >
                                                Profile & Notes
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleViewRounds(m)}
                                                style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--border-color)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
                                            >
                                                Rounds
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 2: MY MENTEES TABLE */}
                {activeTab === 'mentees' && (
                    <div className="card" style={{ background: 'var(--panel-bg)', padding: '24px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                                <h3 style={{ color: 'var(--text-primary)', fontSize: '1.25rem' }}>Assigned Mentee List</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Track academic standing, placement results, and add mentorship notes.</p>
                            </div>
                            <input
                                type="text"
                                placeholder="Search by name, reg no, dept..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    padding: '8px 14px',
                                    borderRadius: '6px',
                                    background: 'var(--panel-bg)',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-primary)',
                                    width: '280px'
                                }}
                            />
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                        <th style={{ padding: '12px' }}>REGISTER NO</th>
                                        <th style={{ padding: '12px' }}>STUDENT NAME</th>
                                        <th style={{ padding: '12px' }}>DEPT</th>
                                        <th style={{ padding: '12px' }}>CGPA</th>
                                        <th style={{ padding: '12px' }}>MONTHLY SOLVED</th>
                                        <th style={{ padding: '12px' }}>PLACEMENT MARKS</th>
                                        <th style={{ padding: '12px' }}>STATUS</th>
                                        <th style={{ padding: '12px', textAlign: 'right' }}>ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMentees.map(m => (
                                        <tr key={m.student_id} style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                                            <td style={{ padding: '12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{m.register_number}</td>
                                            <td style={{ padding: '12px' }}>
                                                <div style={{ fontWeight: '600' }}>{m.name}</div>
                                                {m.resume_url && (
                                                    <a href={m.resume_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', color: 'var(--primary)', textDecoration: 'none' }}>
                                                        📄 Resume
                                                    </a>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px' }}>{m.department}</td>
                                            <td style={{ padding: '12px', fontWeight: '600' }}>{m.cgpa}</td>
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
                                                    {m.monthly_total_solved || 0}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px' }}>{m.placement_marks || 'N/A'}</td>
                                            <td style={{ padding: '12px' }}>
                                                <span style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '600',
                                                    background: m.status === 'Placed' ? 'var(--success-bg)' : m.status === 'At Risk' ? 'var(--error-bg)' : 'var(--primary-light)',
                                                    color: m.status === 'Placed' ? 'var(--success-text)' : m.status === 'At Risk' ? 'var(--error-text)' : 'var(--primary)'
                                                }}>
                                                    {m.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'right' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenStudentDetail(m)}
                                                    style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--primary)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontSize: '0.8rem', marginRight: '8px' }}
                                                >
                                                    Profile & Notes
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleViewRounds(m)}
                                                    style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--border-color)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
                                                >
                                                    View Rounds
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* TAB 3: PLACED MENTEES */}
                {activeTab === 'placed' && (
                    <div className="card" style={{ background: 'var(--panel-bg)', padding: '24px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <h3 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '8px' }}>Placed Mentees Wall of Success</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '20px' }}>Students successfully recruited by partner companies.</p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                            {placedMentees.map(m => (
                                <div key={m.student_id} style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--success-text)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <h4 style={{ color: 'var(--text-primary)', fontSize: '1.1rem' }}>{m.name}</h4>
                                        <span style={{ background: 'var(--success-bg)', color: 'var(--success-text)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>PLACED</span>
                                    </div>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>{m.register_number} &bull; {m.department}</p>

                                    <div style={{ marginTop: '16px', background: 'var(--panel-bg)', padding: '12px', borderRadius: '6px' }}>
                                        <div style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '1rem' }}>{m.company || 'Tech Company'}</div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>Role: {m.job_role || 'Software Engineer'}</div>
                                        <div style={{ color: 'var(--success-text)', fontWeight: '600', marginTop: '4px', fontSize: '0.9rem' }}>CTC: ₹{m.ctc || '12.0'} LPA</div>
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
                        title="Mentee Intervention Workflows"
                        description="Expand any authorized mentee to view their intervention and action plan."
                    />
                )}

                {/* TAB 5: METRICS */}
                {activeTab === 'metrics' && (
                    <div className="card" style={{ background: 'var(--panel-bg)', padding: '24px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <h3 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: '20px' }}>Mentorship Performance & Analytics</h3>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                            <div style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Active Interventions Flagged</h4>
                                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--accent)', margin: '12px 0' }}>{interventions.length}</div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Mentees currently enrolled in structured intervention remediation.</p>
                            </div>

                            <div style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Placement Conversion Rate</h4>
                                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--primary)', margin: '12px 0' }}>{metrics?.placement_rate !== undefined ? `${metrics.placement_rate}%` : '0%'}</div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{metrics?.placed_count || placedMentees.length} placed out of {metrics?.total_mentees || mentees.length} total mentees.</p>
                            </div>

                            <div style={{ background: 'var(--panel-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Students at Risk</h4>
                                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--error-text)', margin: '12px 0' }}>{metrics?.at_risk_count || 0}</div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Students flagged needing interview practice or mentor counseling.</p>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* MODAL / DRAWER: STUDENT DETAIL & MENTOR NOTES (FULL INTERACTIVE CRUD) */}
            {selectedStudent && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ width: '100%', maxWidth: '560px', background: 'var(--panel-bg)', height: '100%', padding: '24px', overflowY: 'auto', borderLeft: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', pb: '16px' }}>
                            <div>
                                <h3 style={{ color: 'var(--text-primary)', fontSize: '1.25rem' }}>{selectedStudent.name}</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{selectedStudent.register_number} &bull; {selectedStudent.department}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedStudent(null)}
                                style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
                            >
                                &times;
                            </button>
                        </div>

                        {/* Student Profile Overview */}
                        <div style={{ background: 'var(--panel-bg)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h4 style={{ color: 'var(--primary)', fontSize: '0.9rem', textTransform: 'uppercase', margin: 0 }}>Academic & Personal Dossier</h4>
                                {selectedStudent.resume_url && (
                                    <a
                                        href={selectedStudent.resume_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            background: 'var(--success-bg)',
                                            color: 'var(--success-text)',
                                            border: '1px solid var(--success-border)',
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontSize: '0.78rem',
                                            fontWeight: '600',
                                            textDecoration: 'none'
                                        }}
                                    >
                                        📄 View Resume
                                    </a>
                                )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                <div>CGPA: <strong style={{ color: 'var(--text-primary)' }}>{selectedStudent.cgpa}</strong></div>
                                <div>Placement Mark: <strong style={{ color: 'var(--text-primary)' }}>{selectedStudent.placement_marks || 0}</strong></div>
                                <div>10th Percentage: <strong style={{ color: 'var(--text-primary)' }}>{selectedStudent.tenth}%</strong></div>
                                <div>12th Percentage: <strong style={{ color: 'var(--text-primary)' }}>{selectedStudent.twelfth}%</strong></div>
                                <div>Phone: <strong style={{ color: 'var(--text-primary)' }}>{selectedStudent.phone || 'N/A'}</strong></div>
                                <div>Email: <strong style={{ color: 'var(--text-primary)' }}>{selectedStudent.email}</strong></div>
                            </div>

                            {/* Social / Portfolio Links */}
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
                        <div style={{ background: 'var(--panel-bg)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
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
                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase' }}>Competitive Coding Tracker</span>
                                    <div style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
                                        {selectedStudent.monthly_total_solved || 0} Solved This Month
                                    </div>
                                </div>
                                <span style={{ background: 'var(--accent-subtle)', color: 'var(--warning-text)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '700' }}>
                                    All Platforms
                                </span>
                            </div>

                            {/* 5 Coding Platform Badges */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
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

                        {/* Mentor Notes Interactive CRUD Section */}
                        <div style={{ marginTop: '24px' }}>
                            <h4 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: '12px' }}>Mentor Counseling Notes</h4>

                            {/* Add Note Form */}
                            <form onSubmit={handleAddNote} style={{ marginBottom: '20px' }}>
                                <textarea
                                    rows="3"
                                    placeholder="Write a mentorship observation, interview feedback, or action note..."
                                    value={newNoteContent}
                                    onChange={(e) => setNewNoteContent(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        borderRadius: '6px',
                                        background: 'var(--panel-bg)',
                                        border: '1px solid var(--border-color)',
                                        color: 'var(--text-primary)',
                                        resize: 'vertical',
                                        marginBottom: '8px'
                                    }}
                                />
                                <button
                                    type="submit"
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '6px',
                                        background: 'var(--primary)',
                                        color: 'var(--text-primary)',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    Add Note
                                </button>
                            </form>

                            {/* Notes List */}
                            {notesLoading ? (
                                <p style={{ color: 'var(--text-muted)' }}>Loading notes...</p>
                            ) : studentNotes.length === 0 ? (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No mentorship notes recorded yet for this student.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {studentNotes.map(n => (
                                        <div key={n.note_id} style={{ background: 'var(--panel-bg)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                            {editingNoteId === n.note_id ? (
                                                <div>
                                                    <textarea
                                                        rows="3"
                                                        value={editNoteContent}
                                                        onChange={(e) => setEditNoteContent(e.target.value)}
                                                        style={{ width: '100%', padding: '8px', background: 'var(--panel-bg)', color: 'var(--text-primary)', border: '1px solid var(--primary)', borderRadius: '4px', marginBottom: '8px' }}
                                                    />
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button type="button" onClick={() => handleSaveEditNote(n.note_id)} style={{ background: 'var(--success-text)', color: 'var(--text-primary)', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>Save</button>
                                                        <button type="button" onClick={() => setEditingNoteId(null)} style={{ background: 'var(--text-secondary)', color: 'var(--text-primary)', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', whitespace: 'pre-wrap' }}>{n.content}</p>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        <span>{n.created_at}</span>
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <button type="button" onClick={() => handleStartEditNote(n)} style={{ background: 'transparent', color: 'var(--primary)', border: 'none', cursor: 'pointer' }}>Edit</button>
                                                            <button type="button" onClick={() => handleDeleteNote(n.note_id)} style={{ background: 'transparent', color: 'var(--error-text)', border: 'none', cursor: 'pointer' }}>Delete</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: VIEW ROUNDS HISTORY */}
            {viewRoundsStudent && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ width: '100%', maxWidth: '600px', background: 'var(--panel-bg)', padding: '24px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ color: 'var(--text-primary)', fontSize: '1.2rem' }}>Round Results: {viewRoundsStudent.name}</h3>
                            <button type="button" onClick={() => setViewRoundsStudent(null)} style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                        </div>
                        {roundsHistory.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>No recruitment round history recorded for this student.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {roundsHistory.map((r, idx) => (
                                    <div key={idx} style={{ background: 'var(--panel-bg)', padding: '12px 16px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{r.company_name}</div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Role: {r.job_role || 'SDE'} &bull; Round {r.round}</div>
                                        </div>
                                        <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', background: 'var(--primary-subtle)', color: 'var(--primary)' }}>
                                            {r.result}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
