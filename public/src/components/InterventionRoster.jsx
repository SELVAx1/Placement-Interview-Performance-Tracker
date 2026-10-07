function InterventionRoster({ user, canGenerate = true, title = 'All Student Interventions', description = 'Review, trigger AI diagnostic remediation plans, and manage action items for students.' }) {
    const [students, setStudents] = React.useState([]);
    const [expandedStudentId, setExpandedStudentId] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [refreshing, setRefreshing] = React.useState(false);
    const [generatingStudentId, setGeneratingStudentId] = React.useState(null);
    const [generatingAll, setGeneratingAll] = React.useState(false);
    const [error, setError] = React.useState('');
    const [successMsg, setSuccessMsg] = React.useState('');
    const [searchTerm, setSearchTerm] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState('ALL'); // 'ALL' | 'ACTIVE' | 'RESOLVED' | 'NO_PLAN'

    // Add action task states
    const [addingActionForIv, setAddingActionForIv] = React.useState(null);
    const [newActionTitle, setNewActionTitle] = React.useState('');
    const [newActionWeakness, setNewActionWeakness] = React.useState('');
    const [newActionResource, setNewActionResource] = React.useState('');
    const [newActionDueDate, setNewActionDueDate] = React.useState('');

    // Custom intervention modal
    const [isCustomModalOpen, setIsCustomModalOpen] = React.useState(false);
    const [customStudentGmail, setCustomStudentGmail] = React.useState('');
    const [customTitle, setCustomTitle] = React.useState('');
    const [customSummary, setCustomSummary] = React.useState('');
    const [customAnalysis, setCustomAnalysis] = React.useState('');
    const [customPriority, setCustomPriority] = React.useState('MEDIUM');
    const [savingCustom, setSavingCustom] = React.useState(false);

    const showSuccess = (msg) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 4000);
    };

    const loadStudents = React.useCallback(async (showLoader = false) => {
        if (showLoader) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }
        setError('');
        try {
            const response = await fetch('/api/interventions/students', {
                headers: window.interventionHeaders(user)
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'Unable to load intervention students.');
            }
            setStudents(data.students || []);
        } catch (loadError) {
            setError(loadError.message);
        } finally {
            if (showLoader) {
                setLoading(false);
            } else {
                setRefreshing(false);
            }
        }
    }, [user]);

    React.useEffect(() => {
        loadStudents(true);
    }, [loadStudents]);

    const generateForStudent = async (student) => {
        setGeneratingStudentId(student.uuid || student.student_id);
        setError('');
        try {
            const response = await fetch('/api/interventions/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
                body: JSON.stringify({
                    student_id: student.uuid || student.student_id,
                    gmail: student.gmail
                })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'Unable to generate intervention.');
            }
            await loadStudents(false);
            setExpandedStudentId(student.uuid || student.student_id);
            showSuccess(`Generated AI intervention plan for ${student.name || student.gmail}.`);
        } catch (generationError) {
            setError(generationError.message);
        } finally {
            setGeneratingStudentId(null);
        }
    };

    const generateForAll = async () => {
        setGeneratingAll(true);
        setError('');
        try {
            const response = await fetch('/api/interventions/generate-all', {
                method: 'POST',
                headers: window.interventionHeaders(user)
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'Unable to generate interventions.');
            }
            await loadStudents(false);
            showSuccess(`Generated AI intervention plans for ${data.generated?.length || 0} student(s).`);
        } catch (generationError) {
            setError(generationError.message);
        } finally {
            setGeneratingAll(false);
        }
    };

    const updateStatus = async (interventionId, nextStatus) => {
        const response = await fetch(`/api/interventions/${interventionId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
            body: JSON.stringify({ status: nextStatus })
        });
        if (response.ok) {
            await loadStudents(false);
            showSuccess(`Intervention status updated to ${nextStatus}.`);
        } else {
            const data = await response.json();
            setError(data.detail || 'Unable to update intervention status.');
        }
    };

    const updateAction = async (action) => {
        const response = await fetch(`/api/intervention/actions/${action.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
            body: JSON.stringify({ completed: !action.completed })
        });
        if (response.ok) {
            await loadStudents(false);
        } else {
            const data = await response.json();
            setError(data.detail || 'Unable to update intervention action.');
        }
    };

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
                await loadStudents(false);
                setNewActionTitle('');
                setNewActionWeakness('');
                setNewActionResource('');
                setNewActionDueDate('');
                setAddingActionForIv(null);
                showSuccess('Action item added to plan.');
            }
        } catch (err) {
            setError('Failed to append action item.');
        }
    };

    const handleDeleteIntervention = async (interventionId) => {
        if (!window.confirm('Are you sure you want to remove this intervention plan?')) return;
        try {
            const res = await fetch(`/api/interventions/${interventionId}`, {
                method: 'DELETE',
                headers: window.interventionHeaders(user)
            });
            if (res.ok) {
                await loadStudents(false);
                showSuccess('Intervention plan removed.');
            }
        } catch (err) {
            setError('Failed to remove intervention.');
        }
    };

    const handleCreateCustom = async (e) => {
        e.preventDefault();
        if (!customStudentGmail || !customTitle.trim()) return;
        setSavingCustom(true);
        setError('');
        try {
            const res = await fetch('/api/interventions/custom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
                body: JSON.stringify({
                    gmail: customStudentGmail.trim(),
                    title: customTitle.trim(),
                    failure_summary: customSummary.trim(),
                    ai_analysis: customAnalysis.trim(),
                    priority: customPriority,
                    actions: [
                        {
                            title: `Review foundational concepts with mentor`,
                            weakness_area: 'Core Fundamentals',
                            resources: 'Department Library & LMS',
                            due_date: 'Within 2 weeks'
                        }
                    ]
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                await loadStudents(false);
                setIsCustomModalOpen(false);
                setCustomTitle('');
                setCustomSummary('');
                setCustomAnalysis('');
                setCustomStudentGmail('');
                showSuccess('Custom intervention created successfully.');
            } else {
                setError(data.detail || 'Failed to create intervention.');
            }
        } catch (err) {
            setError('Failed to create custom intervention.');
        } finally {
            setSavingCustom(false);
        }
    };

    // Filter students
    const filteredStudents = students.filter(s => {
        const matchSearch =
            (s.gmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.department || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.register_number || '').toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchSearch) return false;

        const ivCount = (s.interventions || []).length;
        if (statusFilter === 'NO_PLAN') return ivCount === 0;
        if (statusFilter === 'ACTIVE') return ivCount > 0 && s.interventions.some(i => i.status !== 'RESOLVED' && i.status !== 'COMPLETED');
        if (statusFilter === 'RESOLVED') return ivCount > 0 && s.interventions.every(i => i.status === 'RESOLVED' || i.status === 'COMPLETED');

        return true;
    });

    return (
        <div className="card" style={{ background: 'var(--panel-bg)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            {/* Header & Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <div>
                    <h3 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{title}</span>
                        <span style={{ fontSize: '0.75rem', background: 'var(--primary-subtle)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
                            {students.length} Total Students
                        </span>
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '6px 0 0' }}>{description}</p>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => loadStudents(false)}
                        style={{ padding: '8px 14px', borderRadius: '7px', background: 'var(--panel-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '500' }}
                    >
                        {refreshing ? 'Refreshing...' : '↻ Refresh'}
                    </button>
                    {canGenerate && (
                        <>
                            <button
                                type="button"
                                onClick={() => setIsCustomModalOpen(true)}
                                style={{ padding: '8px 14px', borderRadius: '7px', background: 'var(--accent-subtle)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.82rem' }}
                            >
                                + Custom Intervention
                            </button>
                            <button
                                type="button"
                                onClick={generateForAll}
                                disabled={generatingAll || loading || students.length === 0}
                                style={{ padding: '8px 16px', borderRadius: '7px', background: 'var(--primary)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.82rem', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
                            >
                                {generatingAll ? 'Synthesizing All AI Plans...' : 'Generate All AI Plans'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    type="text"
                    placeholder="Search by student name, email, department, or reg no..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ flex: 1, minWidth: '260px', padding: '8px 14px', borderRadius: '7px', background: 'var(--panel-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                />
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '7px', background: 'var(--panel-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                >
                    <option value="ALL">All Cohort ({students.length})</option>
                    <option value="ACTIVE">Active Interventions</option>
                    <option value="RESOLVED">Resolved / Completed</option>
                    <option value="NO_PLAN">No Plan Yet</option>
                </select>
            </div>

            {error && <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', color: 'var(--error-text)', padding: '10px 14px', borderRadius: '7px', marginBottom: '14px', fontSize: '0.85rem' }}>{error}</div>}
            {successMsg && <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success-text)', padding: '10px 14px', borderRadius: '7px', marginBottom: '14px', fontSize: '0.85rem' }}>{successMsg}</div>}

            {loading ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>Loading authorized student cohort...</p>
            ) : filteredStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    <p style={{ margin: 0 }}>No students match your filter criteria.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {filteredStudents.map(student => {
                        const sId = student.uuid || student.student_id;
                        const expanded = expandedStudentId === sId;
                        const ivs = student.interventions || [];
                        const isGenerating = generatingStudentId === sId;

                        return (
                            <div key={sId || student.gmail} style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 18px', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => setExpandedStudentId(expanded ? null : sId)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '240px', textAlign: 'left', background: 'transparent', color: 'var(--text-primary)', border: 'none', cursor: 'pointer' }}
                                    >
                                        <span style={{ color: 'var(--primary)', fontSize: '1.2rem', fontWeight: 'bold' }}>{expanded ? '−' : '+'}</span>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <strong style={{ fontSize: '0.95rem' }}>{student.name || student.gmail}</strong>
                                                {student.register_number && (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--border-color)', padding: '1px 6px', borderRadius: '4px' }}>
                                                        {student.register_number}
                                                    </span>
                                                )}
                                            </div>
                                            <small style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                                {student.gmail} · {student.department || 'CSE'} {student.year ? `· ${student.year}` : ''} · {ivs.length} intervention plan(s)
                                            </small>
                                        </div>
                                    </button>

                                    {canGenerate && (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <button
                                                type="button"
                                                onClick={() => generateForStudent(student)}
                                                disabled={isGenerating}
                                                style={{
                                                    padding: '7px 14px',
                                                    borderRadius: '6px',
                                                    background: isGenerating ? 'var(--border-color)' : 'var(--primary)',
                                                    color: isGenerating ? 'var(--text-muted)' : 'var(--panel-bg)',
                                                    border: 'none',
                                                    cursor: isGenerating ? 'wait' : 'pointer',
                                                    fontWeight: '600',
                                                    fontSize: '0.82rem',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px'
                                                }}
                                            >
                                                <span>{isGenerating ? 'Synthesizing...' : '+ Trigger AI Plan'}</span>
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {expanded && (
                                    <div style={{ borderTop: '1px solid var(--border-color)', padding: '18px', background: 'var(--panel-bg)' }}>
                                        {ivs.length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                                                <p style={{ margin: '0 0 10px' }}>No intervention generated for this student yet.</p>
                                                {canGenerate && (
                                                    <button
                                                        type="button"
                                                        onClick={() => generateForStudent(student)}
                                                        disabled={isGenerating}
                                                        style={{ padding: '6px 14px', borderRadius: '6px', background: 'var(--primary)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
                                                    >
                                                        Generate First AI Plan
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            ivs.map(intervention => (
                                                <div key={intervention.id} style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '8px', marginBottom: '14px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>{intervention.title}</strong>
                                                                <span style={{ fontSize: '0.72rem', background: intervention.priority === 'HIGH' ? 'var(--error-bg)' : 'var(--primary-subtle)', color: intervention.priority === 'HIGH' ? 'var(--error-text)' : 'var(--primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>
                                                                    Priority: {intervention.priority}
                                                                </span>
                                                            </div>
                                                            {intervention.failure_summary && (
                                                                <p style={{ color: 'var(--error-text)', fontSize: '0.84rem', margin: '6px 0 0', background: 'var(--error-bg)', padding: '6px 10px', borderRadius: '4px' }}>
                                                                    <strong>Diagnostic:</strong> {intervention.failure_summary}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                            {canGenerate && (
                                                                <>
                                                                    <select
                                                                        value={intervention.status}
                                                                        onChange={(e) => updateStatus(intervention.id, e.target.value)}
                                                                        style={{ height: '32px', background: 'var(--panel-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '5px', fontSize: '0.8rem', padding: '0 8px' }}
                                                                    >
                                                                        <option value="OPEN">OPEN</option>
                                                                        <option value="IN_PROGRESS">IN PROGRESS</option>
                                                                        <option value="COMPLETED">COMPLETED</option>
                                                                        <option value="RESOLVED">RESOLVED</option>
                                                                        <option value="CANCELLED">CANCELLED</option>
                                                                    </select>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteIntervention(intervention.id)}
                                                                        title="Delete intervention"
                                                                        style={{ background: 'transparent', border: 'none', color: 'var(--error-text)', cursor: 'pointer', fontSize: '0.9rem', padding: '4px' }}
                                                                    >
                                                                        
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {intervention.ai_analysis && (
                                                        <p style={{ color: 'var(--primary)', fontSize: '0.84rem', margin: '8px 0', background: 'var(--primary-light)', padding: '6px 10px', borderRadius: '4px' }}>
                                                            <strong>AI Recommendation:</strong> {intervention.ai_analysis}
                                                        </p>
                                                    )}

                                                    {/* Checklist */}
                                                    <div style={{ marginTop: '12px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                            <small style={{ color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                Action Checklist ({((intervention.actions || []).filter(a => a.completed)).length}/{(intervention.actions || []).length} Done)
                                                            </small>
                                                            {canGenerate && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setAddingActionForIv(addingActionForIv === intervention.id ? null : intervention.id)}
                                                                    style={{ background: 'transparent', color: 'var(--primary)', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600' }}
                                                                >
                                                                    {addingActionForIv === intervention.id ? 'Cancel' : '+ Add Task'}
                                                                </button>
                                                            )}
                                                        </div>

                                                        {addingActionForIv === intervention.id && (
                                                            <div style={{ background: 'var(--panel-bg)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Task title (e.g. Solve 20 Dynamic Programming questions)"
                                                                    value={newActionTitle}
                                                                    onChange={(e) => setNewActionTitle(e.target.value)}
                                                                    style={{ padding: '6px 10px', borderRadius: '4px', background: 'var(--panel-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}
                                                                />
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Weakness area"
                                                                        value={newActionWeakness}
                                                                        onChange={(e) => setNewActionWeakness(e.target.value)}
                                                                        style={{ padding: '6px 10px', borderRadius: '4px', background: 'var(--panel-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Resource"
                                                                        value={newActionResource}
                                                                        onChange={(e) => setNewActionResource(e.target.value)}
                                                                        style={{ padding: '6px 10px', borderRadius: '4px', background: 'var(--panel-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleAppendAction(intervention.id)}
                                                                        style={{ padding: '5px 12px', borderRadius: '4px', background: 'var(--primary)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.78rem' }}
                                                                    >
                                                                        Save Task
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                            {(intervention.actions || []).map(action => (
                                                                <label key={action.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: action.completed ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: '0.85rem', background: 'var(--panel-bg)', padding: '6px 10px', borderRadius: '5px' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={Boolean(action.completed)}
                                                                        disabled={!canGenerate}
                                                                        onChange={() => canGenerate && updateAction(action)}
                                                                        style={{ cursor: 'pointer' }}
                                                                    />
                                                                    <span style={{ textDecoration: action.completed ? 'line-through' : 'none', flex: 1 }}>{action.title}</span>
                                                                    {action.weakness_area && (
                                                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>[{action.weakness_area}]</span>
                                                                    )}
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal: Create Custom Intervention */}
            {isCustomModalOpen && (
                <div className="modal-overlay" onClick={() => setIsCustomModalOpen(false)}>
                    <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <div className="modal-head">
                            <div className="head-text">
                                <h3>Create Custom Intervention</h3>
                                <p className="modal-sub">Create a manual targeted remediation action plan for any student.</p>
                            </div>
                            <button type="button" className="close-btn" onClick={() => setIsCustomModalOpen(false)}>×</button>
                        </div>
                        <form onSubmit={handleCreateCustom} className="modal-form-content">
                            <div className="form-group">
                                <label className="form-label">Student Gmail *</label>
                                <input
                                    type="email"
                                    required
                                    className="input-text"
                                    placeholder="e.g. rahul.sharma@college.edu"
                                    value={customStudentGmail}
                                    onChange={(e) => setCustomStudentGmail(e.target.value)}
                                    list="student-emails-list"
                                />
                                <datalist id="student-emails-list">
                                    {students.map(s => <option key={s.gmail} value={s.gmail}>{s.name || s.gmail}</option>)}
                                </datalist>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Intervention Title *</label>
                                <input
                                    type="text"
                                    required
                                    className="input-text"
                                    placeholder="e.g. Intensive DSA Sprint & Mock Interview Series"
                                    value={customTitle}
                                    onChange={(e) => setCustomTitle(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Priority</label>
                                <select
                                    className="input-text"
                                    value={customPriority}
                                    onChange={(e) => setCustomPriority(e.target.value)}
                                >
                                    <option value="HIGH">HIGH (Urgent Remediation)</option>
                                    <option value="MEDIUM">MEDIUM (Moderate Focus)</option>
                                    <option value="LOW">LOW (Standard Monitoring)</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Diagnostic Failure Summary</label>
                                <textarea
                                    className="input-text"
                                    rows="2"
                                    placeholder="e.g. Struggled in Round 2 Technical interview on system architecture."
                                    value={customSummary}
                                    onChange={(e) => setCustomSummary(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Remediation Strategy / Analysis</label>
                                <textarea
                                    className="input-text"
                                    rows="2"
                                    placeholder="e.g. Recommend 1:1 mentor coaching and mock interview exercises."
                                    value={customAnalysis}
                                    onChange={(e) => setCustomAnalysis(e.target.value)}
                                />
                            </div>
                            <div className="modal-actions-bar">
                                <button type="button" className="btn-cancel" onClick={() => setIsCustomModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-confirm" disabled={savingCustom}>
                                    {savingCustom ? 'Creating...' : 'Create Intervention'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
