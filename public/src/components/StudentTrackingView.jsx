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

    // Batch trigger AI plans for all at-risk students in view
    const handleGenerateAllAtRisk = async () => {
        const atRiskStudents = students.filter(s => s.placement_status === 'At Risk' || s.highest_risk === 'HIGH' || s.highest_risk === 'MEDIUM');
        if (atRiskStudents.length === 0) {
            if (showToast) showToast('No at-risk students found in current filtered cohort.');
            return;
        }
        setGeneratingIntervention(true);
        if (showToast) showToast(`Synthesizing AI intervention plans for ${atRiskStudents.length} candidate(s)...`);
        try {
            let successCount = 0;
            for (const s of atRiskStudents) {
                try {
                    const res = await fetch('/api/interventions/generate', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...window.interventionHeaders(user)
                        },
                        body: JSON.stringify({
                            student_id: s.student_id,
                            gmail: s.email
                        })
                    });
                    if (res.ok) successCount++;
                } catch (subErr) {
                    console.error('Batch generation item error:', subErr);
                }
            }
            await fetchTrackingData();
            if (showToast) showToast(`Generated AI intervention plans for ${successCount} student(s).`);
        } catch (err) {
            console.error('Failed to run batch intervention generation:', err);
            if (showToast) showToast('Error during batch intervention generation.');
        } finally {
            setGeneratingIntervention(false);
        }
    };

    // Toggle Action Task status with instant DB persistence
    const handleToggleTask = async (taskIndex, ivIndex, actionId) => {
        if (!selectedStudent) return;
        const currentCompleted = !!selectedStudent.interventions?.[ivIndex]?.actions?.[taskIndex]?.completed;
        const nextCompleted = !currentCompleted;

        setSelectedStudent(prev => {
            const updated = { ...prev };
            const ivs = [...(updated.interventions || [])];
            if (ivs[ivIndex] && ivs[ivIndex].actions && ivs[ivIndex].actions[taskIndex]) {
                const actions = [...ivs[ivIndex].actions];
                actions[taskIndex] = { ...actions[taskIndex], completed: nextCompleted };
                ivs[ivIndex] = { ...ivs[ivIndex], actions };
                updated.interventions = ivs;
            }
            return updated;
        });

        if (actionId) {
            try {
                await fetch(`/api/intervention/actions/${actionId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
                    body: JSON.stringify({ completed: nextCompleted })
                });
            } catch (err) {
                console.error('Failed to persist action update:', err);
            }
        }
        if (showToast) showToast(nextCompleted ? 'Task marked complete.' : 'Task reopened.');
    };

    // Update intervention overall status with DB persistence
    const handleUpdateInterventionStatus = async (interventionId, newStatus) => {
        try {
            const res = await fetch(`/api/interventions/${interventionId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                setSelectedStudent(prev => {
                    if (!prev) return prev;
                    const updatedIvs = (prev.interventions || []).map(iv =>
                        iv.id === interventionId ? { ...iv, status: newStatus } : iv
                    );
                    return { ...prev, interventions: updatedIvs };
                });
                if (showToast) showToast(`Intervention status updated to ${newStatus}.`);
            }
        } catch (err) {
            console.error('Failed to update intervention status:', err);
        }
    };

    // Append new remediation action task
    const [addingActionForIv, setAddingActionForIv] = React.useState(null);
    const [newActionTitle, setNewActionTitle] = React.useState('');
    const [newActionWeakness, setNewActionWeakness] = React.useState('');
    const [newActionResource, setNewActionResource] = React.useState('');
    const [newActionDueDate, setNewActionDueDate] = React.useState('');

    const handleAppendAction = async (interventionId) => {
        if (!newActionTitle.trim()) return;
        try {
            const res = await fetch(`/api/interventions/${interventionId}/actions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
                body: JSON.stringify({
                    title: newActionTitle.trim(),
                    weakness_area: newActionWeakness.trim() || 'Remediation',
                    resources: newActionResource.trim() || 'LMS & Mentor Guidance',
                    due_date: newActionDueDate.trim() || 'Within 2 weeks'
                })
            });
            if (res.ok) {
                const data = await res.json();
                setSelectedStudent(prev => {
                    if (!prev) return prev;
                    const updatedIvs = (prev.interventions || []).map(iv => {
                        if (iv.id === interventionId) {
                            return { ...iv, actions: [...(iv.actions || []), data.action] };
                        }
                        return iv;
                    });
                    return { ...prev, interventions: updatedIvs };
                });
                setNewActionTitle('');
                setNewActionWeakness('');
                setNewActionResource('');
                setNewActionDueDate('');
                setAddingActionForIv(null);
                if (showToast) showToast('New action item added to plan.');
            }
        } catch (err) {
            console.error('Failed to append action:', err);
        }
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

                        <button
                            type="button"
                            className="btn-create-drive"
                            onClick={handleGenerateAllAtRisk}
                            disabled={generatingIntervention}
                            title="Automatically synthesize personalized AI intervention & action plans for all at-risk students"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                            </svg>
                            {generatingIntervention ? 'Analyzing & Generating...' : '⚡ Trigger AI for At-Risk'}
                        </button>
                    </div>
                </div>

                <div className="filter-row-top" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
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
                                    background: 'rgba(15,23,42,0.8)',
                                    color: '#0f172a',
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
                    <span className="kpi-val" style={{ color: '#059669' }}>
                        {stats.placed_count} <span style={{ fontSize: '1rem', fontWeight: '500' }}>({stats.placement_rate_pct}%)</span>
                    </span>
                    <span className="kpi-lbl">Placed / Offers Accepted</span>
                </div>
                <div className="kpi-card-track kpi-process">
                    <span className="kpi-val" style={{ color: '#0f766e' }}>{stats.in_process_count}</span>
                    <span className="kpi-lbl">In Active Rounds</span>
                </div>
                <div className="kpi-card-track kpi-risk">
                    <span className="kpi-val" style={{ color: '#d97706' }}>{stats.at_risk_count}</span>
                    <span className="kpi-lbl">Needs Academic Support</span>
                </div>
                <div className="kpi-card-track kpi-interventions">
                    <span className="kpi-val" style={{ color: '#dc2626' }}>{stats.interventions_count}</span>
                    <span className="kpi-lbl">Active Interventions</span>
                </div>
                <div className="kpi-card-track">
                    <span className="kpi-val" style={{ color: '#5eead4' }}>{stats.avg_cgpa}</span>
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
                                            <div className="card-student-cgpa">★ {s.cgpa}</div>
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
                                                    background: 'rgba(20, 184, 166, 0.15)',
                                                    color: '#5eead4',
                                                    border: '1px solid rgba(20, 184, 166, 0.3)',
                                                    textDecoration: 'none'
                                                }}
                                                title={`Download ${s.name}'s complete Excel dossier template`}
                                            >
                                                📥 .xlsx
                                            </a>
                                        </div>
                                    </div>

                                    <div className="card-tags-row">
                                        <span className="dept-tag">{s.department}</span>
                                        <span className="year-tag">{s.year}</span>

                                        {s.placement_status === 'Placed' ? (
                                            <span className="status-pill-placed">
                                                ✓ Placed {s.placed_company ? `(${s.placed_company})` : ''}
                                            </span>
                                        ) : s.placement_status === 'In Process' ? (
                                            <span className="status-pill-in-process">
                                                ⚡ In Rounds ({s.drives_count} Drives)
                                            </span>
                                        ) : s.placement_status === 'At Risk' ? (
                                            <span className="status-pill-at-risk">
                                                ⚠️ Needs Support
                                            </span>
                                        ) : (
                                            <span className="status-pill-neutral">
                                                ⚪ Not Started
                                            </span>
                                        )}

                                        {s.open_interventions_count > 0 && (
                                            <span className="risk-alert-chip">
                                                {s.open_interventions_count} Intervention{s.open_interventions_count > 1 ? 's' : ''}
                                            </span>
                                        )}

                                        <span style={{ fontSize: '0.72rem', padding: '2px 7px', borderRadius: '4px', background: 'rgba(249, 115, 22, 0.15)', color: '#fdba74', border: '1px solid rgba(249, 115, 22, 0.3)', fontWeight: '600' }}>
                                            🔥 {s.monthly_total_solved || 0} solved/mo
                                        </span>

                                        {s.resume_url && (
                                            <a
                                                href={s.resume_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ fontSize: '0.72rem', color: '#0f766e', textDecoration: 'none', background: 'rgba(20, 184, 166, 0.12)', border: '1px solid rgba(20, 184, 166, 0.3)', borderRadius: '4px', padding: '2px 6px', fontWeight: '600' }}
                                                title={`View ${s.name}'s Resume`}
                                            >
                                                📄 Resume
                                            </a>
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
                                                {selectedStudent.resume_url && (
                                                    <a
                                                        href={selectedStudent.resume_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="btn-download-dossier"
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            padding: '5px 12px',
                                                            background: 'linear-gradient(135deg, #059669, #10b981)',
                                                            color: '#ffffff',
                                                            borderRadius: '7px',
                                                            fontSize: '0.8rem',
                                                            fontWeight: '600',
                                                            textDecoration: 'none',
                                                            border: '1px solid #10b981',
                                                            boxShadow: '0 2px 8px rgba(16,185,129,0.25)',
                                                            cursor: 'pointer'
                                                        }}
                                                        title={`View ${selectedStudent.name}'s verified resume`}
                                                    >
                                                        📄 View Resume
                                                    </a>
                                                )}
                                                <a
                                                    href={`/api/coordinator/export/student/${encodeURIComponent(selectedStudent.register_number || selectedStudent.email)}`}
                                                    download
                                                    className="btn-download-dossier"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '5px 12px',
                                                        background: 'linear-gradient(135deg, #134e4a, #0f766e)',
                                                        color: '#ffffff',
                                                        borderRadius: '7px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: '600',
                                                        textDecoration: 'none',
                                                        border: '1px solid #14b8a6',
                                                        boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
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
                                            <div className="hero-sub" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                                <span><strong>Reg:</strong> {selectedStudent.register_number}</span>
                                                <span>•</span>
                                                <span><strong>Dept:</strong> {selectedStudent.department}</span>
                                                <span>•</span>
                                                <span><strong>Year:</strong> {selectedStudent.year}</span>
                                                <span>•</span>
                                                <span>{selectedStudent.email}</span>
                                                {selectedStudent.phone && (
                                                    <>
                                                        <span>•</span>
                                                        <span><strong>Phone:</strong> {selectedStudent.phone}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="hero-right-metrics">
                                        <div className="hero-metric-item" style={{ background: 'rgba(234, 88, 12, 0.12)', border: '1px solid rgba(234, 88, 12, 0.35)' }}>
                                            <div className="hero-metric-val" style={{ color: '#ea580c' }}>{selectedStudent.monthly_total_solved || 0}</div>
                                            <div className="hero-metric-lbl">Monthly Solved</div>
                                        </div>
                                        <div className="hero-metric-item">
                                            <div className="hero-metric-val" style={{ color: '#0f766e' }}>{selectedStudent.cgpa}</div>
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
                                        background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.25), rgba(16, 185, 129, 0.15))',
                                        border: '1px solid rgba(16, 185, 129, 0.4)',
                                        borderRadius: '10px',
                                        padding: '14px 18px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div>
                                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                🎉 Placed & Selected
                                            </span>
                                            <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#ffffff', marginTop: '2px' }}>
                                                {selectedStudent.placed_company || 'Campus Partner'} • {selectedStudent.placed_role || 'Software Engineer'}
                                            </div>
                                        </div>
                                        {selectedStudent.placed_package && (
                                            <div style={{
                                                background: 'rgba(16, 185, 129, 0.2)',
                                                color: '#059669',
                                                border: '1px solid rgba(16, 185, 129, 0.4)',
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
                                        background: 'rgba(20, 184, 166, 0.12)',
                                        border: '1px solid rgba(20, 184, 166, 0.35)',
                                        borderRadius: '10px',
                                        padding: '12px 18px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div>
                                            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#5eead4', textTransform: 'uppercase' }}>
                                                ⚡ In Recruitment Pipeline
                                            </span>
                                            <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#ffffff', marginTop: '2px' }}>
                                                Participating in {selectedStudent.drives_count} active placement drive(s)
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{
                                        background: 'rgba(245, 158, 11, 0.12)',
                                        border: '1px solid rgba(245, 158, 11, 0.35)',
                                        borderRadius: '10px',
                                        padding: '12px 18px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div>
                                            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#d97706', textTransform: 'uppercase' }}>
                                                ⚠️ Under Mentoring & Remediation
                                            </span>
                                            <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#ffffff', marginTop: '2px' }}>
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
                                                const resLower = (item.result || '').toLowerCase();
                                                const isRejectedVerdict = resLower.includes('reject') || resLower.includes('fail') || resLower.includes('not select');
                                                const isSelectedVerdict = !isRejectedVerdict && (resLower.includes('select') || resLower.includes('placed') || resLower.includes('offer') || resLower.includes('hired'));

                                                return (
                                                    <div key={idx} className="process-drive-card">
                                                        <div className="drive-header-row">
                                                            <div>
                                                                <span className="drive-company-name">{item.company_name}</span>
                                                                <span className="drive-role-title"> • {item.job_role}</span>
                                                            </div>
                                                            {item.ctc_lpa && (
                                                                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#059669' }}>
                                                                    ₹{item.ctc_lpa} LPA
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="round-status-box">
                                                            <div className="round-status-head">
                                                                <span>Stage: Round {item.round}</span>
                                                                {isSelectedVerdict ? (
                                                                    <span className="status-pill-placed">✓ {item.result}</span>
                                                                ) : isRejectedVerdict ? (
                                                                    <span className="status-pill-at-risk">✕ {item.result}</span>
                                                                ) : (
                                                                    <span className="status-pill-in-process">⚡ {item.result}</span>
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
                                                                <div style={{ fontSize: '0.78rem', color: '#dc2626' }}>
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
                                                background: 'rgba(16, 185, 129, 0.08)',
                                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                                borderRadius: '10px'
                                            }}>
                                                <h4 style={{ color: '#059669', marginBottom: '6px' }}>Clear Academic & Placement Record</h4>
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
                                                                <select
                                                                    value={iv.status || 'OPEN'}
                                                                    onChange={(e) => handleUpdateInterventionStatus(iv.id, e.target.value)}
                                                                    style={{
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: '600',
                                                                        padding: '2px 8px',
                                                                        borderRadius: '5px',
                                                                        background: iv.status === 'RESOLVED' || iv.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(20, 184, 166, 0.2)',
                                                                        color: iv.status === 'RESOLVED' || iv.status === 'COMPLETED' ? '#059669' : '#5eead4',
                                                                        border: '1px solid rgba(20, 184, 166, 0.4)',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    <option value="OPEN">OPEN</option>
                                                                    <option value="IN_PROGRESS">IN PROGRESS</option>
                                                                    <option value="COMPLETED">COMPLETED</option>
                                                                    <option value="RESOLVED">RESOLVED</option>
                                                                    <option value="CANCELLED">CANCELLED</option>
                                                                </select>
                                                            </div>
                                                        </div>

                                                        {iv.failure_summary && (
                                                            <div style={{
                                                                fontSize: '0.82rem',
                                                                color: '#f87171',
                                                                background: 'rgba(239, 68, 68, 0.1)',
                                                                padding: '8px 12px',
                                                                borderRadius: '6px'
                                                            }}>
                                                                <strong>Diagnostic Assessment:</strong> {iv.failure_summary}
                                                            </div>
                                                        )}

                                                        {iv.ai_analysis && (
                                                            <div style={{
                                                                fontSize: '0.82rem',
                                                                color: '#5eead4',
                                                                background: 'rgba(20, 184, 166, 0.1)',
                                                                padding: '8px 12px',
                                                                borderRadius: '6px'
                                                            }}>
                                                                <strong>AI Recommended Path:</strong> {iv.ai_analysis}
                                                            </div>
                                                        )}

                                                        {/* Action Tasks Checklist */}
                                                        <div>
                                                            <div className="filter-section-title" style={{ marginTop: '8px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span>Action Items Checklist ({((iv.actions || []).filter(a => a.completed)).length}/{(iv.actions || []).length} Completed):</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setAddingActionForIv(addingActionForIv === iv.id ? null : iv.id)}
                                                                    style={{
                                                                        background: 'transparent',
                                                                        color: '#0f766e',
                                                                        border: 'none',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.78rem',
                                                                        fontWeight: '600'
                                                                    }}
                                                                >
                                                                    {addingActionForIv === iv.id ? '✕ Cancel' : '+ Add Action Task'}
                                                                </button>
                                                            </div>

                                                            {addingActionForIv === iv.id && (
                                                                <div style={{
                                                                    background: 'rgba(241, 245, 249, 0.9)',
                                                                    padding: '12px',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid #e2e8f0',
                                                                    marginBottom: '10px',
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: '8px'
                                                                }}>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Action task title (e.g. Complete 20 LeetCode Mediums on Graphs)"
                                                                        value={newActionTitle}
                                                                        onChange={(e) => setNewActionTitle(e.target.value)}
                                                                        style={{ padding: '6px 10px', borderRadius: '5px', background: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', fontSize: '0.8rem' }}
                                                                    />
                                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Weakness area (e.g. Graphs / DSA)"
                                                                            value={newActionWeakness}
                                                                            onChange={(e) => setNewActionWeakness(e.target.value)}
                                                                            style={{ padding: '6px 10px', borderRadius: '5px', background: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', fontSize: '0.8rem' }}
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Resource (e.g. NeetCode 150)"
                                                                            value={newActionResource}
                                                                            onChange={(e) => setNewActionResource(e.target.value)}
                                                                            style={{ padding: '6px 10px', borderRadius: '5px', background: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', fontSize: '0.8rem' }}
                                                                        />
                                                                    </div>
                                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleAppendAction(iv.id)}
                                                                            style={{ padding: '6px 12px', borderRadius: '5px', background: '#0f766e', color: '#0f172a', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem' }}
                                                                        >
                                                                            Save Action Task
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div className="action-checklist">
                                                                {(iv.actions || []).map((act, actIdx) => (
                                                                    <div key={act.id || actIdx} className={`action-task-item ${act.completed ? 'completed' : ''}`}>
                                                                        <input
                                                                            type="checkbox"
                                                                            className="action-checkbox"
                                                                            checked={!!act.completed}
                                                                            onChange={() => handleToggleTask(actIdx, ivIdx, act.id)}
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
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}

                                {/* Tab 3: Profile, Personal Dossier & Competitive Coding Tracker */}
                                {inspectorTab === 'profile' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {/* Contact & Personal Dossier Card */}
                                        <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                                                <h4 style={{ fontSize: '0.95rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                                    <span>👤</span> Personal Details & Verification Dossier
                                                </h4>
                                                {selectedStudent.resume_url && (
                                                    <a
                                                        href={selectedStudent.resume_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            padding: '4px 12px',
                                                            background: 'rgba(16, 185, 129, 0.15)',
                                                            color: '#059669',
                                                            border: '1px solid rgba(16, 185, 129, 0.4)',
                                                            borderRadius: '6px',
                                                            fontSize: '0.78rem',
                                                            fontWeight: '600',
                                                            textDecoration: 'none'
                                                        }}
                                                    >
                                                        📄 View Uploaded Resume
                                                    </a>
                                                )}
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '0.85rem' }}>
                                                <div style={{ background: 'rgba(255, 255, 255, 0.6)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>Phone Number</div>
                                                    <div style={{ color: '#0f172a', fontWeight: '600', marginTop: '2px' }}>{selectedStudent.phone || 'Not provided'}</div>
                                                </div>

                                                <div style={{ background: 'rgba(255, 255, 255, 0.6)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>LinkedIn Profile</div>
                                                    <div style={{ marginTop: '2px' }}>
                                                        {selectedStudent.linkedin_url ? (
                                                            <a href={selectedStudent.linkedin_url.startsWith('http') ? selectedStudent.linkedin_url : `https://${selectedStudent.linkedin_url}`} target="_blank" rel="noopener noreferrer" style={{ color: '#0f766e', textDecoration: 'none', fontWeight: '600' }}>
                                                                🔗 View LinkedIn &rarr;
                                                            </a>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)' }}>Not linked</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div style={{ background: 'rgba(255, 255, 255, 0.6)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>GitHub Profile</div>
                                                    <div style={{ marginTop: '2px' }}>
                                                        {selectedStudent.github_url ? (
                                                            <a href={selectedStudent.github_url.startsWith('http') ? selectedStudent.github_url : `https://${selectedStudent.github_url}`} target="_blank" rel="noopener noreferrer" style={{ color: '#b45309', textDecoration: 'none', fontWeight: '600' }}>
                                                                🐙 View GitHub &rarr;
                                                            </a>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)' }}>Not linked</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div style={{ background: 'rgba(255, 255, 255, 0.6)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>Portfolio / Website</div>
                                                    <div style={{ marginTop: '2px' }}>
                                                        {selectedStudent.portfolio_url ? (
                                                            <a href={selectedStudent.portfolio_url.startsWith('http') ? selectedStudent.portfolio_url : `https://${selectedStudent.portfolio_url}`} target="_blank" rel="noopener noreferrer" style={{ color: '#059669', textDecoration: 'none', fontWeight: '600' }}>
                                                                🌐 View Portfolio &rarr;
                                                            </a>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)' }}>Not linked</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Competitive Coding Platform Profiles & Monthly Solved Tracker */}
                                        <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
                                            <div style={{
                                                background: 'linear-gradient(135deg, rgba(234, 88, 12, 0.18), rgba(249, 115, 22, 0.08))',
                                                border: '1px solid rgba(249, 115, 22, 0.4)',
                                                borderRadius: '8px',
                                                padding: '14px 18px',
                                                marginBottom: '16px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                flexWrap: 'wrap',
                                                gap: '10px'
                                            }}>
                                                <div>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        ⚡ Competitive Coding Activity Tracker
                                                    </div>
                                                    <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#ffffff', marginTop: '2px' }}>
                                                        🔥 {selectedStudent.monthly_total_solved || 0} Problems Solved This Month
                                                    </div>
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                        Aggregated across LeetCode, Codeforces, CodeChef, HackerRank, and AtCoder
                                                    </div>
                                                </div>
                                                <div style={{
                                                    background: 'rgba(249, 115, 22, 0.2)',
                                                    color: '#fdba74',
                                                    padding: '6px 14px',
                                                    borderRadius: '8px',
                                                    fontWeight: '700',
                                                    fontSize: '0.9rem',
                                                    border: '1px solid rgba(249, 115, 22, 0.4)'
                                                }}>
                                                    Monthly Sum: {selectedStudent.monthly_total_solved || 0}
                                                </div>
                                            </div>

                                            {/* 5 Platforms Cards */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                                                {/* LeetCode */}
                                                <div style={{ background: 'rgba(255, 255, 255, 0.6)', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <strong style={{ color: '#d97706', fontSize: '0.85rem' }}>LeetCode</strong>
                                                        {selectedStudent.leetcode_handle && (
                                                            <a href={`https://leetcode.com/u/${selectedStudent.leetcode_handle}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: '#5eead4', textDecoration: 'none' }}>↗</a>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                        @{selectedStudent.leetcode_handle || 'Not connected'}
                                                    </div>
                                                    <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>This Month:</span>
                                                        <strong style={{ color: '#059669' }}>{selectedStudent.leetcode_solved_month || 0}</strong>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '2px' }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>Total Solved:</span>
                                                        <strong style={{ color: '#0f172a' }}>{selectedStudent.leetcode_total_solved || 0}</strong>
                                                    </div>
                                                </div>

                                                {/* Codeforces */}
                                                <div style={{ background: 'rgba(255, 255, 255, 0.6)', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <strong style={{ color: '#0f766e', fontSize: '0.85rem' }}>Codeforces</strong>
                                                        {selectedStudent.codeforces_handle && (
                                                            <a href={`https://codeforces.com/profile/${selectedStudent.codeforces_handle}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: '#5eead4', textDecoration: 'none' }}>↗</a>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                        @{selectedStudent.codeforces_handle || 'Not connected'}
                                                    </div>
                                                    <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>This Month:</span>
                                                        <strong style={{ color: '#059669' }}>{selectedStudent.codeforces_solved_month || 0}</strong>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '2px' }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>Rating:</span>
                                                        <strong style={{ color: '#0f766e' }}>{selectedStudent.codeforces_rating || 'Unrated'}</strong>
                                                    </div>
                                                </div>

                                                {/* CodeChef */}
                                                <div style={{ background: 'rgba(255, 255, 255, 0.6)', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <strong style={{ color: '#d97706', fontSize: '0.85rem' }}>CodeChef</strong>
                                                        {selectedStudent.codechef_handle && (
                                                            <a href={`https://www.codechef.com/users/${selectedStudent.codechef_handle}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: '#5eead4', textDecoration: 'none' }}>↗</a>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                        @{selectedStudent.codechef_handle || 'Not connected'}
                                                    </div>
                                                    <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>This Month:</span>
                                                        <strong style={{ color: '#059669' }}>{selectedStudent.codechef_solved_month || 0}</strong>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '2px' }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>Stars:</span>
                                                        <strong style={{ color: '#b45309' }}>{selectedStudent.codechef_stars || '—'}</strong>
                                                    </div>
                                                </div>

                                                {/* HackerRank */}
                                                <div style={{ background: 'rgba(255, 255, 255, 0.6)', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <strong style={{ color: '#10b981', fontSize: '0.85rem' }}>HackerRank</strong>
                                                        {selectedStudent.hackerrank_handle && (
                                                            <a href={`https://www.hackerrank.com/profile/${selectedStudent.hackerrank_handle}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: '#5eead4', textDecoration: 'none' }}>↗</a>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                        @{selectedStudent.hackerrank_handle || 'Not connected'}
                                                    </div>
                                                    <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>This Month:</span>
                                                        <strong style={{ color: '#059669' }}>{selectedStudent.hackerrank_solved_month || 0}</strong>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '2px' }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>Score:</span>
                                                        <strong style={{ color: '#10b981' }}>{selectedStudent.hackerrank_score || 0}</strong>
                                                    </div>
                                                </div>

                                                {/* AtCoder */}
                                                <div style={{ background: 'rgba(255, 255, 255, 0.6)', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <strong style={{ color: '#d97706', fontSize: '0.85rem' }}>AtCoder</strong>
                                                        {selectedStudent.atcoder_handle && (
                                                            <a href={`https://atcoder.jp/users/${selectedStudent.atcoder_handle}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: '#5eead4', textDecoration: 'none' }}>↗</a>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                        @{selectedStudent.atcoder_handle || 'Not connected'}
                                                    </div>
                                                    <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>This Month:</span>
                                                        <strong style={{ color: '#059669' }}>{selectedStudent.atcoder_solved_month || 0}</strong>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '2px' }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>Rating:</span>
                                                        <strong style={{ color: '#d97706' }}>{selectedStudent.atcoder_rating || 'Unrated'}</strong>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Technical Skillset */}
                                        <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                                            <h4 style={{ fontSize: '0.9rem', color: '#0f172a', marginBottom: '10px' }}>Technical Skillset</h4>
                                            {selectedStudent.skills_list && selectedStudent.skills_list.length > 0 ? (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    {selectedStudent.skills_list.map((sk, skIdx) => (
                                                        <span
                                                            key={skIdx}
                                                            style={{
                                                                background: 'rgba(20, 184, 166, 0.15)',
                                                                color: '#5eead4',
                                                                border: '1px solid rgba(20, 184, 166, 0.3)',
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

                                        {/* Assigned Mentors & Notes */}
                                        <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                                            <h4 style={{ fontSize: '0.9rem', color: '#0f172a', marginBottom: '10px' }}>Assigned Mentors & Notes</h4>
                                            {selectedStudent.mentor_notes && selectedStudent.mentor_notes.length > 0 ? (
                                                selectedStudent.mentor_notes.map((mn, mnIdx) => (
                                                    <div key={mn.note_id || mnIdx} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                                        <div style={{ fontSize: '0.82rem', color: '#334155' }}>{mn.content}</div>
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
                                <th>Monthly Solved</th>
                                <th>Placement Status</th>
                                <th>Offer / Current Stage</th>
                                <th>Resume</th>
                                <th>Interventions</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.map(s => (
                                <tr key={s.student_id || s.email}>
                                    <td><strong>{s.register_number}</strong></td>
                                    <td>
                                        <div style={{ fontWeight: '600', color: '#0f172a' }}>{s.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.email}</div>
                                        {s.phone && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>📞 {s.phone}</div>}
                                    </td>
                                    <td><span className="dept-tag">{s.department}</span></td>
                                    <td><span className="year-tag">{s.year}</span></td>
                                    <td><strong>{s.cgpa}</strong></td>
                                    <td>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(249, 115, 22, 0.15)', color: '#fdba74', fontWeight: '700', fontSize: '0.8rem', border: '1px solid rgba(249, 115, 22, 0.3)' }}>
                                            🔥 {s.monthly_total_solved || 0}
                                        </span>
                                    </td>
                                    <td>
                                        {s.placement_status === 'Placed' ? (
                                            <span className="status-pill-placed">✓ Placed</span>
                                        ) : s.placement_status === 'In Process' ? (
                                            <span className="status-pill-in-process">⚡ In Process</span>
                                        ) : s.placement_status === 'At Risk' ? (
                                            <span className="status-pill-at-risk">⚠️ At Risk</span>
                                        ) : (
                                            <span className="status-pill-neutral">⚪ Not Started</span>
                                        )}
                                    </td>
                                    <td>
                                        {s.placed_company ? (
                                            <span style={{ color: '#059669', fontWeight: '600' }}>
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
                                        {s.resume_url ? (
                                            <a href={s.resume_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#0f766e', textDecoration: 'none', fontWeight: '600', fontSize: '0.78rem' }}>
                                                📄 Resume
                                            </a>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>—</span>
                                        )}
                                    </td>
                                    <td>
                                        {s.interventions.length > 0 ? (
                                            <span className="risk-alert-chip">
                                                {s.interventions.length} Plan ({s.highest_risk})
                                            </span>
                                        ) : (
                                            <span style={{ color: '#059669', fontSize: '0.8rem' }}>Clear</span>
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
                                                    background: 'rgba(16, 185, 129, 0.15)',
                                                    color: '#059669',
                                                    borderColor: 'rgba(16, 185, 129, 0.35)',
                                                    textDecoration: 'none',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '5px 9px'
                                                }}
                                                title={`Download ${s.name}'s individual Excel dossier`}
                                            >
                                                📥 .xlsx
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

